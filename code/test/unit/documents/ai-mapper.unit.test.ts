import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock services BEFORE importing the handler
vi.mock('../../../src/services/index.js', () => ({
  createAIService: vi.fn(),
}));

import { aiProductMapperHandler } from '../../../src/functions/http/documents/ai-mapper';
import { createAIService } from '../../../src/services/index.js';
import { mockInvocationContext } from '../setup/mocks';

describe('AI Product Mapper - HTTP Handler - Unit Tests', () => {
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
    vi.mocked(createAIService).mockImplementation(() => mockAIService as any);
  });

  it('should return 400 when documentId is missing', async () => {
    const request = {
      params: {},
    };
    const context = mockInvocationContext();

    const response = await aiProductMapperHandler(request as any, context as any);

    expect(response.status).toBe(400);
    expect(response.jsonBody.error).toContain('Missing document ID');
  });

  it('should return 404 when document not found', async () => {
    // Mock service to throw not found error
    const mockAIService = {
      mapProducts: vi
        .fn()
        .mockRejectedValue(Object.assign(new Error('Document not found'), { statusCode: 404 })),
    };
    vi.mocked(createAIService).mockImplementation(() => mockAIService as any);

    const request = {
      params: { id: 'nonexistent-uuid' },
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
    vi.mocked(createAIService).mockImplementation(() => mockAIService as any);

    const request = {
      params: { id: 'test-uuid-1234' },
    };
    const context = mockInvocationContext();

    const response = await aiProductMapperHandler(request as any, context as any);

    expect(response.status).toBe(400);
    expect(response.jsonBody.error).toContain('ocr_complete');
  });

  it('should successfully extract products from OCR data', async () => {
    const request = {
      params: { id: 'test-uuid-1234' },
    };
    const context = mockInvocationContext();

    const response = await aiProductMapperHandler(request as any, context as any);

    expect(response.status).toBe(200);
    expect(response.jsonBody.productCount).toBe(2);
    expect(response.jsonBody.cost).toBe(0.15);
  });

  it('should handle AI service errors gracefully', async () => {
    // Mock service to throw error
    const mockAIService = {
      mapProducts: vi.fn().mockRejectedValue(new Error('AI API error')),
    };
    vi.mocked(createAIService).mockImplementation(() => mockAIService as any);

    const request = {
      params: { id: 'test-uuid-1234' },
    };
    const context = mockInvocationContext();

    const response = await aiProductMapperHandler(request as any, context as any);

    expect(response.status).toBe(500);
  });
});
