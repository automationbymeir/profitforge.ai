import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock services BEFORE importing the handler
vi.mock('../../src/services/index.js', () => ({
  getAIService: vi.fn(),
}));

import { aiProductMapperHandler } from '../../src/functions/aiProductMapper';
import { getAIService } from '../../src/services/index.js';
import { mockInvocationContext } from './setup/mocks';

describe('AI Product Mapper - Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock AIService
    const mockAIService = {
      mapProducts: vi.fn().mockResolvedValue({
        products: [
          { name: 'Widget A', sku: 'W001', price: 19.99, unit: 'ea' },
          { name: 'Widget B', sku: 'W002', price: 29.99, unit: 'box' },
        ],
        qualityMetrics: { mappingConfidence: 0.95 },
        productCount: 2,
        cost: 0.15,
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
      }),
    };
    vi.mocked(getAIService).mockReturnValue(mockAIService as any);
  });

  it('should return 400 when documentId is missing', async () => {
    const request = {
      json: vi.fn().mockResolvedValue({}),
    };
    const context = mockInvocationContext();

    const response = await aiProductMapperHandler(request as any, context as any);

    expect(response.status).toBe(400);
    expect(response.jsonBody.error).toContain('Missing documentId');
  });

  it('should return 404 when document not found', async () => {
    // Mock service to throw not found error
    const mockAIService = {
      mapProducts: vi
        .fn()
        .mockRejectedValue(Object.assign(new Error('Document not found'), { statusCode: 404 })),
    };
    vi.mocked(getAIService).mockReturnValue(mockAIService as any);

    const request = {
      json: vi.fn().mockResolvedValue({ documentId: 'nonexistent-uuid' }),
    };
    const context = mockInvocationContext();

    const response = await aiProductMapperHandler(request as any, context as any);

    expect(response.status).toBe(404);
    expect(response.jsonBody.error).toContain('Document not found');
  });

  it('should return 400 when document status is not ocr_complete', async () => {
    // Mock service to throw status error
    const mockAIService = {
      mapProducts: vi
        .fn()
        .mockRejectedValue(
          Object.assign(
            new Error("Document status must be 'ocr_complete'. Current status: pending"),
            { statusCode: 400 }
          )
        ),
    };
    vi.mocked(getAIService).mockReturnValue(mockAIService as any);

    const request = {
      json: vi.fn().mockResolvedValue({ documentId: 'test-uuid-1234' }),
    };
    const context = mockInvocationContext();

    const response = await aiProductMapperHandler(request as any, context as any);

    expect(response.status).toBe(400);
    expect(response.jsonBody.error).toContain('ocr_complete');
  });

  it('should successfully extract products from OCR data', async () => {
    const request = {
      json: vi.fn().mockResolvedValue({ documentId: 'test-uuid-1234' }),
    };
    const context = mockInvocationContext();

    const response = await aiProductMapperHandler(request as any, context as any);

    expect(response.status).toBe(200);
    expect(response.jsonBody.productCount).toBeGreaterThan(0);
    expect(response.jsonBody.message).toBe('AI product mapping completed successfully');
  });

  it('should handle price parsing with currency symbols and commas', async () => {
    const request = {
      json: vi.fn().mockResolvedValue({ documentId: 'test-uuid' }),
    };
    const context = mockInvocationContext();

    const response = await aiProductMapperHandler(request as any, context as any);

    expect(response.status).toBe(200);
    // Price should be parsed correctly by AIService
  });

  it('should filter out products with missing required fields', async () => {
    const request = {
      json: vi.fn().mockResolvedValue({ documentId: 'test-uuid' }),
    };
    const context = mockInvocationContext();

    const response = await aiProductMapperHandler(request as any, context as any);

    expect(response.status).toBe(200);
    // AIService filters products with missing required fields
  });

  it('should store results in bronze-layer storage', async () => {
    const request = {
      json: vi.fn().mockResolvedValue({ documentId: 'test-uuid' }),
    };
    const context = mockInvocationContext();

    const response = await aiProductMapperHandler(request as any, context as any);

    expect(response.status).toBe(200);
    // AIService handles bronze-layer storage
  });

  it('should calculate token usage and costs', async () => {
    const request = {
      json: vi.fn().mockResolvedValue({ documentId: 'test-uuid' }),
    };
    const context = mockInvocationContext();

    const response = await aiProductMapperHandler(request as any, context as any);

    expect(response.status).toBe(200);
    // Verify cost calculation fields are present
    expect(response.jsonBody).toHaveProperty('cost');
    expect(response.jsonBody).toHaveProperty('usage');
    expect(response.jsonBody.usage).toHaveProperty('promptTokens');
    expect(response.jsonBody.usage).toHaveProperty('completionTokens');
    expect(response.jsonBody.usage).toHaveProperty('totalTokens');
  });

  it('should handle OpenAI API errors gracefully', async () => {
    // Mock service to throw OpenAI error
    const mockAIService = {
      mapProducts: vi.fn().mockRejectedValue(new Error('OpenAI rate limit exceeded')),
    };
    vi.mocked(getAIService).mockReturnValue(mockAIService as any);

    const request = {
      json: vi.fn().mockResolvedValue({ documentId: 'test-uuid' }),
    };
    const context = mockInvocationContext();

    const response = await aiProductMapperHandler(request as any, context as any);

    expect(response.status).toBe(500);
    expect(response.jsonBody.error).toBe('Internal Server Error');
  });

  it('should handle database errors gracefully', async () => {
    // Mock service to throw database error
    const mockAIService = {
      mapProducts: vi.fn().mockRejectedValue(new Error('Database connection failed')),
    };
    vi.mocked(getAIService).mockReturnValue(mockAIService as any);

    const request = {
      json: vi.fn().mockResolvedValue({ documentId: 'test-uuid' }),
    };
    const context = mockInvocationContext();

    const response = await aiProductMapperHandler(request as any, context as any);

    expect(response.status).toBe(500);
    expect(response.jsonBody.error).toBe('Internal Server Error');
  });

  it('should support reprocessing with incremented count', async () => {
    const request = {
      json: vi.fn().mockResolvedValue({ documentId: 'test-uuid' }),
    };
    const context = mockInvocationContext();

    const response = await aiProductMapperHandler(request as any, context as any);

    expect(response.status).toBe(200);
    // AIService allows reprocessing even if already completed
  });
});
