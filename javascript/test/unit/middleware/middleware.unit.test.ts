import { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withAuth } from '../../../src/middleware/auth.js';
import { withCors } from '../../../src/middleware/cors.js';
import { withErrorHandler } from '../../../src/middleware/error-handler.js';
import { withRateLimit } from '../../../src/middleware/rate-limit.js';
import * as usageTracker from '../../../src/utils/usageTracker.js';
import {
    createMockContext,
    createMockHandler,
    createMockRequest,
    mockDailyLimitSuccess,
    mockRateLimitSuccess,
} from '../setup/mocks.js';

// Mock utilities
vi.mock('../../../src/utils/httpHelpers.js', () => ({
  errorResponse: (message: string, status: number) => ({
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
    },
    jsonBody: { error: message },
  }),
}));

vi.mock('../../../src/utils/usageTracker.js', () => ({
  checkIpRateLimit: vi.fn(),
  checkDailyUploadLimit: vi.fn(),
}));

describe('Middleware - Unit Tests', () => {
  let mockContext: InvocationContext;
  let mockHandler: ReturnType<
    typeof vi.fn<[HttpRequest, InvocationContext], Promise<HttpResponseInit>>
  >;

  beforeEach(() => {
    mockContext = createMockContext();
    mockHandler = createMockHandler();

    // Reset environment variables
    delete process.env.IS_DEMO_MODE;
    delete process.env.DEMO_API_KEY;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('CORS Middleware', () => {
    it('should add CORS headers to successful response', async () => {
      const mockRequest = createMockRequest('GET');

      const wrappedHandler = withCors(mockHandler);
      const response = await wrappedHandler(mockRequest, mockContext);

      expect(response.headers).toMatchObject({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
      });
      expect(response.status).toBe(200);
      expect(mockHandler).toHaveBeenCalledWith(mockRequest, mockContext);
    });

    it('should handle OPTIONS preflight request without calling handler', async () => {
      const mockRequest = createMockRequest('OPTIONS');

      const wrappedHandler = withCors(mockHandler);
      const response = await wrappedHandler(mockRequest, mockContext);

      expect(response.status).toBe(204);
      expect(response.headers).toMatchObject({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
      });
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should preserve existing response headers', async () => {
      mockHandler.mockResolvedValue({
        status: 200,
        headers: {
          'X-Custom-Header': 'custom-value',
        },
        jsonBody: { message: 'Success' },
      });

      const mockRequest = createMockRequest('POST');

      const wrappedHandler = withCors(mockHandler);
      const response = await wrappedHandler(mockRequest, mockContext);

      expect(response.headers).toMatchObject({
        'Access-Control-Allow-Origin': '*',
        'X-Custom-Header': 'custom-value',
      });
    });

    it('should add CORS headers to error responses', async () => {
      mockHandler.mockResolvedValue({
        status: 400,
        jsonBody: { error: 'Bad Request' },
      });

      const mockRequest = createMockRequest('POST');

      const wrappedHandler = withCors(mockHandler);
      const response = await wrappedHandler(mockRequest, mockContext);

      expect(response.status).toBe(400);
      expect(response.headers).toMatchObject({
        'Access-Control-Allow-Origin': '*',
      });
    });
  });

  describe('Auth Middleware', () => {
    it('should allow requests with valid API key in demo mode', async () => {
      process.env.IS_DEMO_MODE = 'true';
      process.env.DEMO_API_KEY = 'test-api-key';

      const headers = new Headers();
      headers.set('x-api-key', 'test-api-key');

      const mockRequest = createMockRequest('POST', headers);

      const wrappedHandler = withAuth(mockHandler);
      const response = await wrappedHandler(mockRequest, mockContext);

      expect(response.status).toBe(200);
      expect(mockHandler).toHaveBeenCalledWith(mockRequest, mockContext);
    });

    it('should reject requests with missing API key in demo mode', async () => {
      process.env.IS_DEMO_MODE = 'true';
      process.env.DEMO_API_KEY = 'test-api-key';

      const mockRequest = createMockRequest('POST');

      const wrappedHandler = withAuth(mockHandler);
      const response = await wrappedHandler(mockRequest, mockContext);

      expect(response.status).toBe(401);
      expect(mockHandler).not.toHaveBeenCalled();
      expect(mockContext.warn).toHaveBeenCalledWith(
        expect.stringContaining('API key validation failed: Missing API key')
      );
    });

    it('should reject requests with invalid API key in demo mode', async () => {
      process.env.IS_DEMO_MODE = 'true';
      process.env.DEMO_API_KEY = 'correct-key';

      const headers = new Headers();
      headers.set('x-api-key', 'wrong-key');

      const mockRequest = createMockRequest('POST', headers);

      const wrappedHandler = withAuth(mockHandler);
      const response = await wrappedHandler(mockRequest, mockContext);

      expect(response.status).toBe(401);
      expect(mockHandler).not.toHaveBeenCalled();
      expect(mockContext.warn).toHaveBeenCalledWith(
        expect.stringContaining('API key validation failed: Invalid API key')
      );
    });

    it('should skip auth check when not in demo mode', async () => {
      process.env.IS_DEMO_MODE = 'false';

      const mockRequest = createMockRequest('POST'); // No API key

      const wrappedHandler = withAuth(mockHandler);
      const response = await wrappedHandler(mockRequest, mockContext);

      expect(response.status).toBe(200);
      expect(mockHandler).toHaveBeenCalledWith(mockRequest, mockContext);
    });
  });

  describe('Rate Limit Middleware', () => {
    beforeEach(() => {
      vi.mocked(usageTracker.checkIpRateLimit).mockResolvedValue(mockRateLimitSuccess);
      vi.mocked(usageTracker.checkDailyUploadLimit).mockResolvedValue(mockDailyLimitSuccess);
    });

    it('should allow requests under IP limit in demo mode', async () => {
      process.env.IS_DEMO_MODE = 'true';

      const headers = new Headers();
      headers.set('x-forwarded-for', '192.168.1.1, 10.0.0.1');

      const mockRequest = createMockRequest('POST', headers);

      const wrappedHandler = withRateLimit(mockHandler);
      const response = await wrappedHandler(mockRequest, mockContext);

      expect(response.status).toBe(200);
      expect(usageTracker.checkIpRateLimit).toHaveBeenCalledWith('192.168.1.1');
      expect(usageTracker.checkDailyUploadLimit).toHaveBeenCalled();
      expect(mockHandler).toHaveBeenCalled();
    });

    it('should reject requests exceeding IP rate limit', async () => {
      process.env.IS_DEMO_MODE = 'true';
      vi.mocked(usageTracker.checkIpRateLimit).mockResolvedValue({
        allowed: false,
        current: 10,
        limit: 10,
        resetTime: '15:00 UTC',
      });

      const headers = new Headers();
      headers.set('x-real-ip', '192.168.1.1');

      const mockRequest = createMockRequest('POST', headers);

      const wrappedHandler = withRateLimit(mockHandler);
      const response = await wrappedHandler(mockRequest, mockContext);

      expect(response.status).toBe(429);
      expect(mockHandler).not.toHaveBeenCalled();
      expect(mockContext.info).toHaveBeenCalledWith(
        expect.stringContaining('IP rate limit exceeded')
      );
    });

    it('should reject requests exceeding daily upload limit', async () => {
      process.env.IS_DEMO_MODE = 'true';
      vi.mocked(usageTracker.checkDailyUploadLimit).mockResolvedValue({
        allowed: false,
        current: 100,
        limit: 100,
      });

      const mockRequest = createMockRequest('POST');

      const wrappedHandler = withRateLimit(mockHandler);
      const response = await wrappedHandler(mockRequest, mockContext);

      expect(response.status).toBe(429);
      expect(mockHandler).not.toHaveBeenCalled();
      expect(mockContext.info).toHaveBeenCalledWith(
        expect.stringContaining('Daily upload limit reached')
      );
    });

    it('should skip rate limiting when not in demo mode', async () => {
      process.env.IS_DEMO_MODE = 'false';

      const mockRequest = createMockRequest('POST');

      const wrappedHandler = withRateLimit(mockHandler);
      const response = await wrappedHandler(mockRequest, mockContext);

      expect(response.status).toBe(200);
      expect(usageTracker.checkIpRateLimit).not.toHaveBeenCalled();
      expect(usageTracker.checkDailyUploadLimit).not.toHaveBeenCalled();
      expect(mockHandler).toHaveBeenCalled();
    });

    it('should handle unknown IP address', async () => {
      process.env.IS_DEMO_MODE = 'true';

      const mockRequest = createMockRequest('POST'); // No IP headers

      const wrappedHandler = withRateLimit(mockHandler);
      await wrappedHandler(mockRequest, mockContext);

      expect(usageTracker.checkIpRateLimit).toHaveBeenCalledWith('unknown');
    });
  });

  describe('Error Handler Middleware', () => {
    it('should catch and format handler errors', async () => {
      mockHandler.mockRejectedValue(new Error('Test error'));

      const mockRequest = createMockRequest('POST');

      const wrappedHandler = withErrorHandler(mockHandler);
      const response = await wrappedHandler(mockRequest, mockContext);

      expect(response.status).toBe(500);
      expect(mockContext.error).toHaveBeenCalledWith(
        'Unhandled error in handler:',
        expect.objectContaining({
          error: 'Test error',
          method: 'POST',
        })
      );
    });

    it('should handle 404 errors correctly', async () => {
      const error = new Error('Resource not found');
      (error as { statusCode?: number }).statusCode = 404;
      mockHandler.mockRejectedValue(error);

      const mockRequest = createMockRequest('GET');

      const wrappedHandler = withErrorHandler(mockHandler);
      const response = await wrappedHandler(mockRequest, mockContext);

      expect(response.status).toBe(404);
      expect(response.jsonBody).toMatchObject({
        error: 'Not Found',
        message: 'Resource not found',
      });
    });

    it('should handle 400 validation errors correctly', async () => {
      const error = new Error('Invalid input');
      (error as { statusCode?: number }).statusCode = 400;
      mockHandler.mockRejectedValue(error);

      const mockRequest = createMockRequest('POST');

      const wrappedHandler = withErrorHandler(mockHandler);
      const response = await wrappedHandler(mockRequest, mockContext);

      expect(response.status).toBe(400);
    });

    it('should log error details for debugging', async () => {
      const error = new Error('Detailed error');
      mockHandler.mockRejectedValue(error);

      const mockRequest = {
        method: 'PUT',
        url: 'http://localhost/api/test/123',
        headers: new Headers(),
      } as HttpRequest;

      const wrappedHandler = withErrorHandler(mockHandler);
      await wrappedHandler(mockRequest, mockContext);

      expect(mockContext.error).toHaveBeenCalledWith(
        'Unhandled error in handler:',
        expect.objectContaining({
          url: 'http://localhost/api/test/123',
          method: 'PUT',
          error: 'Detailed error',
          stack: expect.any(String),
        })
      );
    });

    it('should pass through successful responses', async () => {
      mockHandler.mockResolvedValue({
        status: 200,
        jsonBody: { data: 'test' },
      });

      const mockRequest = createMockRequest('GET');

      const wrappedHandler = withErrorHandler(mockHandler);
      const response = await wrappedHandler(mockRequest, mockContext);

      expect(response.status).toBe(200);
      expect(response.jsonBody).toEqual({ data: 'test' });
      expect(mockContext.error).not.toHaveBeenCalled();
    });
  });

  describe('Middleware Composition', () => {
    beforeEach(() => {
      vi.mocked(usageTracker.checkIpRateLimit).mockResolvedValue(mockRateLimitSuccess);
      vi.mocked(usageTracker.checkDailyUploadLimit).mockResolvedValue(mockDailyLimitSuccess);
    });

    it('should execute middleware in correct order: error → cors → auth → rate', async () => {
      process.env.IS_DEMO_MODE = 'true';
      process.env.DEMO_API_KEY = 'test-key';

      const headers = new Headers();
      headers.set('x-api-key', 'test-key');

      const mockRequest = createMockRequest('POST', headers);

      // Compose middleware in the standard order
      const composedHandler = withErrorHandler(withCors(withAuth(withRateLimit(mockHandler))));
      const response = await composedHandler(mockRequest, mockContext);

      expect(response.status).toBe(200);
      expect(response.headers).toMatchObject({
        'Access-Control-Allow-Origin': '*',
      });
      expect(mockHandler).toHaveBeenCalled();
    });

    it('should short-circuit on auth failure without calling rate limit or handler', async () => {
      process.env.IS_DEMO_MODE = 'true';
      process.env.DEMO_API_KEY = 'correct-key';

      const headers = new Headers();
      headers.set('x-api-key', 'wrong-key');

      const mockRequest = createMockRequest('POST', headers);

      const composedHandler = withErrorHandler(withCors(withAuth(withRateLimit(mockHandler))));
      const response = await composedHandler(mockRequest, mockContext);

      expect(response.status).toBe(401);
      expect(usageTracker.checkIpRateLimit).not.toHaveBeenCalled();
      expect(usageTracker.checkDailyUploadLimit).not.toHaveBeenCalled();
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should short-circuit on rate limit failure without calling handler', async () => {
      process.env.IS_DEMO_MODE = 'true';
      process.env.DEMO_API_KEY = 'test-key';

      vi.mocked(usageTracker.checkIpRateLimit).mockResolvedValue({
        allowed: false,
        current: 10,
        limit: 10,
        resetTime: '15:00 UTC',
      });

      const headers = new Headers();
      headers.set('x-api-key', 'test-key');

      const mockRequest = createMockRequest('POST', headers);

      const composedHandler = withErrorHandler(withCors(withAuth(withRateLimit(mockHandler))));
      const response = await composedHandler(mockRequest, mockContext);

      expect(response.status).toBe(429);
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should add CORS headers to auth failure responses', async () => {
      process.env.IS_DEMO_MODE = 'true';
      process.env.DEMO_API_KEY = 'test-key';

      const mockRequest = createMockRequest('POST'); // Missing API key

      const composedHandler = withErrorHandler(withCors(withAuth(withRateLimit(mockHandler))));
      const response = await composedHandler(mockRequest, mockContext);

      expect(response.status).toBe(401);
      expect(response.headers).toMatchObject({
        'Access-Control-Allow-Origin': '*',
      });
    });

    it('should catch errors from inner middleware and add CORS headers', async () => {
      // Make rate limit throw an error
      vi.mocked(usageTracker.checkIpRateLimit).mockRejectedValue(
        new Error('Database connection failed')
      );

      process.env.IS_DEMO_MODE = 'true';
      process.env.DEMO_API_KEY = 'test-key';

      const headers = new Headers();
      headers.set('x-api-key', 'test-key');

      const mockRequest = createMockRequest('POST', headers);
      const composedHandler = withErrorHandler(withCors(withAuth(withRateLimit(mockHandler))));
      const response = await composedHandler(mockRequest, mockContext);

      expect(response.status).toBe(500);
      expect(response.headers).toMatchObject({
        'Access-Control-Allow-Origin': '*',
      });
      expect(mockHandler).not.toHaveBeenCalled();
    });
  });
});
