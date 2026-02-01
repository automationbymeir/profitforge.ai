import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock services BEFORE importing the handler
vi.mock('../../src/services/index.js', () => ({
  getAIService: vi.fn(),
}));

import { aiProductMapperQueueTrigger } from '../../src/functions/queues/ai-product-mapper';
import { getAIService } from '../../src/services/index.js';
import { mockAIService, mockInvocationContext } from './setup/mocks';

describe('AI Product Mapper Queue - Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Use consolidated mock with realistic response
    const aiService = mockAIService({
      mapProducts: vi.fn().mockResolvedValue({
        documentId: 'test-uuid-1234',
        vendor: 'TEST_VENDOR',
        products: [
          { name: 'Product 1', sku: 'SKU1', price: 10.0 },
          { name: 'Product 2', sku: 'SKU2', price: 20.0 },
        ],
        productCount: 2,
        processingDuration: 1500,
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
        cost: 0.15,
        qualityMetrics: {
          completenessScore: 95.5,
          confidenceScore: 92.0,
          productsWithSKU: 2,
          productsWithPrice: 2,
          productsWithValidPrice: 2,
          productsWithName: 2,
          productsWithUnit: 0,
          productsWithDescription: 0,
          emptyFields: 0,
        },
      }),
    });
    vi.mocked(getAIService).mockReturnValue(aiService as any);
  });

  it('should process valid queue message with documentId', async () => {
    const queueMessage = {
      documentId: 'test-uuid-1234',
    };
    const context = mockInvocationContext();

    await aiProductMapperQueueTrigger(queueMessage, context as any);

    // Verify AIService.mapProducts was called
    const mockService = vi.mocked(getAIService)();
    expect(mockService.mapProducts).toHaveBeenCalledWith('test-uuid-1234');

    expect(context.log).toHaveBeenCalledWith(
      expect.stringContaining('Queue trigger: Processing AI mapping')
    );
    expect(context.log).toHaveBeenCalledWith(
      expect.stringContaining('Queue processing complete: 2 products extracted')
    );
  });

  it('should parse string-encoded JSON messages', async () => {
    const queueMessage = JSON.stringify({
      documentId: 'test-uuid-5678',
    });
    const context = mockInvocationContext();

    await aiProductMapperQueueTrigger(queueMessage, context as any);

    const mockService = vi.mocked(getAIService)();
    expect(mockService.mapProducts).toHaveBeenCalledWith('test-uuid-5678');
    expect(context.error).not.toHaveBeenCalled();
  });

  it('should throw error when documentId is missing', async () => {
    const queueMessage = {
      // Missing documentId
      someOtherField: 'value',
    };
    const context = mockInvocationContext();

    await expect(aiProductMapperQueueTrigger(queueMessage, context as any)).rejects.toThrow(
      'Queue message missing documentId'
    );

    expect(context.error).toHaveBeenCalledWith(expect.stringContaining('Queue processing failed'));
  });

  it('should throw error when AIService fails', async () => {
    // Mock service to throw error
    const aiService = mockAIService({
      mapProducts: vi.fn().mockRejectedValue(new Error('Database error')),
    });
    vi.mocked(getAIService).mockReturnValue(aiService as any);

    const queueMessage = {
      documentId: 'test-uuid-1234',
    };
    const context = mockInvocationContext();

    await expect(aiProductMapperQueueTrigger(queueMessage, context as any)).rejects.toThrow(
      'Database error'
    );

    expect(context.error).toHaveBeenCalledWith(expect.stringContaining('Queue processing failed'));
  });

  it('should throw error when AIService throws', async () => {
    // Mock service to throw OpenAI error
    const aiService = mockAIService({
      mapProducts: vi.fn().mockRejectedValue(new Error('OpenAI timeout')),
    });
    vi.mocked(getAIService).mockReturnValue(aiService as any);

    const queueMessage = {
      documentId: 'test-uuid-1234',
    };
    const context = mockInvocationContext();

    await expect(aiProductMapperQueueTrigger(queueMessage, context as any)).rejects.toThrow(
      'OpenAI timeout'
    );

    expect(context.error).toHaveBeenCalledWith(expect.stringContaining('OpenAI timeout'));
  });

  it('should call AIService with correct documentId', async () => {
    const queueMessage = {
      documentId: 'test-uuid-9999',
    };
    const context = mockInvocationContext();

    await aiProductMapperQueueTrigger(queueMessage, context as any);

    // Verify AIService.mapProducts was called with correct documentId
    const mockService = vi.mocked(getAIService)();
    expect(mockService.mapProducts).toHaveBeenCalledWith('test-uuid-9999');
  });

  it('should handle different documentId formats', async () => {
    const testCases = [
      '123e4567-e89b-12d3-a456-426614174000', // Standard UUID
      'test-id-123', // Custom ID format
      'ACME-DOC-2024-001', // Alphanumeric
    ];

    for (const documentId of testCases) {
      const queueMessage = { documentId };
      const context = mockInvocationContext();

      await aiProductMapperQueueTrigger(queueMessage, context as any);

      const mockService = vi.mocked(getAIService)();
      expect(mockService.mapProducts).toHaveBeenCalledWith(documentId);
      expect(context.error).not.toHaveBeenCalled();
      vi.clearAllMocks();
    }
  });

  it('should log success message with product count', async () => {
    // Mock AIService to return 15 products
    const mockAIService = {
      mapProducts: vi.fn().mockResolvedValue({
        documentId: 'test-uuid',
        vendor: 'TEST',
        products: new Array(15).fill({ name: 'Product', sku: 'SKU', price: 10 }),
        productCount: 15,
        processingDuration: 2000,
        usage: { promptTokens: 800, completionTokens: 400, totalTokens: 1200 },
        cost: 0.2,
        qualityMetrics: {
          completenessScore: 100,
          confidenceScore: 95,
          productsWithSKU: 15,
          productsWithPrice: 15,
          productsWithValidPrice: 15,
          productsWithName: 15,
          productsWithUnit: 0,
          productsWithDescription: 0,
          emptyFields: 0,
        },
      }),
    };
    vi.mocked(getAIService).mockReturnValue(mockAIService as any);

    const queueMessage = { documentId: 'test-uuid' };
    const context = mockInvocationContext();

    await aiProductMapperQueueTrigger(queueMessage, context as any);

    expect(context.log).toHaveBeenCalledWith(expect.stringContaining('15 products extracted'));
  });

  it('should propagate errors for queue retry mechanism', async () => {
    // When an error is thrown, the queue should retry the message
    const mockAIService = {
      mapProducts: vi.fn().mockRejectedValue(new Error('Temporary network issue')),
    };
    vi.mocked(getAIService).mockReturnValue(mockAIService as any);

    const queueMessage = { documentId: 'test-uuid' };
    const context = mockInvocationContext();

    // Expect error to be thrown (not caught)
    await expect(aiProductMapperQueueTrigger(queueMessage, context as any)).rejects.toThrow(
      'Temporary network issue'
    );

    // Error should be logged
    expect(context.error).toHaveBeenCalled();
  });

  it('should handle malformed JSON in string messages', async () => {
    const malformedJson = '{ invalid json }';
    const context = mockInvocationContext();

    await expect(aiProductMapperQueueTrigger(malformedJson, context as any)).rejects.toThrow();

    expect(context.error).toHaveBeenCalled();
  });

  it('should handle empty queue message', async () => {
    const emptyMessage = {};
    const context = mockInvocationContext();

    await expect(aiProductMapperQueueTrigger(emptyMessage, context as any)).rejects.toThrow(
      'Queue message missing documentId'
    );
  });

  it('should handle null documentId', async () => {
    const messageWithNullId = {
      documentId: null,
    };
    const context = mockInvocationContext();

    await expect(aiProductMapperQueueTrigger(messageWithNullId, context as any)).rejects.toThrow(
      'Queue message missing documentId'
    );
  });

  it('should handle empty string documentId', async () => {
    const messageWithEmptyId = {
      documentId: '',
    };
    const context = mockInvocationContext();

    await expect(aiProductMapperQueueTrigger(messageWithEmptyId, context as any)).rejects.toThrow(
      'Queue message missing documentId'
    );
  });
});
