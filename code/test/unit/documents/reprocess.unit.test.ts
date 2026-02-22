import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock services BEFORE importing the handler
vi.mock('../../../src/services/index.js', () => ({
  createAIService: vi.fn(),
}));

import { processAIMappingHandler } from '../../../src/functions/http/documents/process-ai-mapping.js';
import { createAIService } from '../../../src/services/index.js';
import { mockInvocationContext } from '../setup/mocks';

describe.skip('AI Product Mapper Handler - Unit Tests - API CONTRACT CHANGED', () => {
  // These tests are for the old document-based reprocessing API
  // The new API uses vendor-based routing: POST /api/vendors/{vendorName}/ai-run
  // See process-ai-mapping.ts for the new implementation
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock AIService
    const mockAIService = {
      mapProducts: vi.fn().mockResolvedValue({
        documentId: 'test-uuid-1234',
        vendor: 'TEST_VENDOR',
        productCount: 5,
        processingDuration: 1500,
        usage: { input: 1000, output: 500 },
        cost: 0.025,
      }),
    };
    vi.mocked(createAIService).mockImplementation(() => mockAIService as any);
  });

  it('should successfully map products for a document', async () => {
    const request = {
      params: { id: 'test-uuid-1234' },
    };
    const context = mockInvocationContext();

    const response = await processAIMappingHandler(request as any, context as any);

    expect(response.status).toBe(200);
    expect(response.jsonBody.documentId).toBe('test-uuid-1234');
    expect(response.jsonBody.productCount).toBe(5);
  });

  it('should return 400 when documentId is missing', async () => {
    const request = {
      params: {},
    };
    const context = mockInvocationContext();

    const response = await processAIMappingHandler(request as any, context as any);

    expect(response.status).toBe(400);
    expect(response.jsonBody.error).toContain('Missing document ID');
  });

  it('should handle AI service errors', async () => {
    // Mock service to throw error
    const mockAIService = {
      mapProducts: vi.fn().mockRejectedValue(new Error('AI processing error')),
    };
    vi.mocked(createAIService).mockImplementation(() => mockAIService as any);

    const request = {
      params: { id: 'test-uuid-1234' },
    };
    const context = mockInvocationContext();

    const response = await processAIMappingHandler(request as any, context as any);

    expect(response.status).toBe(500);
  });
});
