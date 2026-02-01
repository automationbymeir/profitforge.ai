import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock services BEFORE importing the handler
vi.mock('../../../../../src/services/index.js', () => ({
  getDocumentService: vi.fn(),
  getVendorService: vi.fn(),
  getVersionService: vi.fn(),
}));

import { reprocessMappingHandler } from '../../../../../src/functions/http/documents/reprocess';
import { getDocumentService } from '../../../../../src/services/index.js';
import { mockInvocationContext } from '../../../setup/mocks';

describe('Reprocess Mapping Handler - Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock DocumentService
    const mockDocumentService = {
      reprocess: vi.fn().mockResolvedValue({
        newResultId: 'test-uuid-5678',
        nextStep: 'Will be queued for AI mapping',
      }),
    };
    vi.mocked(getDocumentService).mockReturnValue(mockDocumentService as any);
  });

  it('should successfully reprocess a document by creating immutable version', async () => {
    const request = {
      params: { id: 'test-uuid-1234' },
    };
    const context = mockInvocationContext();

    const response = await reprocessMappingHandler(request as any, context as any);

    expect(response.status).toBe(200);
    expect(response.jsonBody.newResultId).toBe('test-uuid-5678');
    expect(response.jsonBody.nextStep).toContain('AI mapping');
  });

  it('should return 400 when documentId is missing', async () => {
    const request = {
      params: {},
    };
    const context = mockInvocationContext();

    const response = await reprocessMappingHandler(request as any, context as any);

    expect(response.status).toBe(400);
    expect(response.jsonBody.error).toContain('Missing document ID');
  });

  it('should handle database errors', async () => {
    // Mock service to throw error
    const mockDocumentService = {
      reprocess: vi.fn().mockRejectedValue(new Error('Database error')),
    };
    vi.mocked(getDocumentService).mockReturnValue(mockDocumentService as any);

    const request = {
      params: { id: 'test-uuid-1234' },
    };
    const context = mockInvocationContext();

    const response = await reprocessMappingHandler(request as any, context as any);

    expect(response.status).toBe(500);
  });
});
