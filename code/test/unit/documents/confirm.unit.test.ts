import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock services BEFORE importing the handler
vi.mock('../../../src/services/index.js', () => ({
  createDocumentService: vi.fn(),
  createVendorService: vi.fn(),
  createVersionService: vi.fn(),
  createRunService: vi.fn(),
}));

import { confirmMappingHandler } from '../../../src/functions/http/runs/confirm.js';
import { createRunService } from '../../../src/services/index.js';
import { mockInvocationContext } from '../setup/mocks';

describe('Confirm Mapping Handler - Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock RunService
    const mockRunService = {
      confirmMapping: vi.fn().mockResolvedValue({
        documentId: 'test-uuid-1234',
        productsExported: 2,
        vendor: 'ACME',
      }),
    };
    vi.mocked(createRunService).mockResolvedValue(mockRunService as any);
  });

  it('should export products to vendor_products table', async () => {
    const request = {
      params: { runId: 'test-uuid-1234' },
    };
    const context = mockInvocationContext();

    const response = await confirmMappingHandler(request as any, context as any);

    expect(response.status).toBe(200);
    expect(response.jsonBody.productsExported).toBe(2);
    expect(response.jsonBody.vendor).toBe('ACME');
  });

  it('should return 400 when documentId is missing', async () => {
    const request = {
      params: {},
    };
    const context = mockInvocationContext();

    const response = await confirmMappingHandler(request as any, context as any);

    expect(response.status).toBe(400);
    expect(response.jsonBody.error).toContain('Missing run ID');
  });

  it('should return 404 when document not found', async () => {
    // Mock service to throw not found error
    const mockRunService = {
      confirmMapping: vi
        .fn()
        .mockRejectedValue(Object.assign(new Error('Document not found'), { statusCode: 404 })),
    };
    vi.mocked(createRunService).mockResolvedValue(mockRunService as any);

    const request = {
      params: { runId: 'nonexistent-uuid' },
    };
    const context = mockInvocationContext();

    const response = await confirmMappingHandler(request as any, context as any);

    expect(response.status).toBe(404);
    expect(response.jsonBody.error).toContain('Document not found');
  });

  it('should return 400 when document status is not completed', async () => {
    // Mock service to throw status error
    const mockRunService = {
      confirmMapping: vi.fn().mockRejectedValue(
        Object.assign(new Error("Document status must be 'completed' to confirm mapping"), {
          statusCode: 400,
        })
      ),
    };
    vi.mocked(createRunService).mockResolvedValue(mockRunService as any);

    const request = {
      params: { runId: 'test-uuid-1234' },
    };
    const context = mockInvocationContext();

    const response = await confirmMappingHandler(request as any, context as any);

    expect(response.status).toBe(400);
    expect(response.jsonBody.error).toContain("must be 'completed'");
  });

  it('should return 400 when no mapping result available', async () => {
    // Mock service to throw missing result error
    const mockRunService = {
      confirmMapping: vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error('No products found in mapping result'), { statusCode: 400 })
        ),
    };
    vi.mocked(createRunService).mockResolvedValue(mockRunService as any);

    const request = {
      params: { runId: 'test-uuid-1234' },
    };
    const context = mockInvocationContext();

    const response = await confirmMappingHandler(request as any, context as any);

    expect(response.status).toBe(400);
    expect(response.jsonBody.error).toContain('No products found');
  });
});
