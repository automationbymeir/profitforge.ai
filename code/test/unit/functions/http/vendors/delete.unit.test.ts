import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock services BEFORE importing the handler
vi.mock('../../../../../src/services/index.js', () => ({
  getDocumentService: vi.fn(),
  getVendorService: vi.fn(),
  getVersionService: vi.fn(),
}));

import { deleteVendorHandler } from '../../../../../src/functions/http/vendors/delete';
import { getVendorService } from '../../../../../src/services/index.js';
import { mockInvocationContext } from '../../../setup/mocks';

describe('Delete Vendor Handler - Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock VendorService
    const mockVendorService = {
      deleteVendor: vi.fn().mockResolvedValue({
        documentsDeleted: 2,
        blobsDeleted: 2,
      }),
    };
    vi.mocked(getVendorService).mockReturnValue(mockVendorService as any);
  });

  it('should successfully delete vendor documents and blobs', async () => {
    const request = {
      params: { name: 'TEST_VENDOR_11_25' },
    };
    const context = mockInvocationContext();

    const response = await deleteVendorHandler(request as any, context as any);

    expect(response.status).toBe(200);
    expect(response.jsonBody.documentsDeleted).toBe(2);
    expect(response.jsonBody.blobsDeleted).toBeGreaterThanOrEqual(0);
  });

  it('should return 400 when vendorName is missing', async () => {
    const request = {
      params: {},
    };
    const context = mockInvocationContext();

    const response = await deleteVendorHandler(request as any, context as any);

    expect(response.status).toBe(400);
    expect(response.jsonBody.error).toContain('Missing vendor name');
  });

  it('should return 404 when no documents found for vendor', async () => {
    // Mock service to throw not found error
    const mockVendorService = {
      deleteVendor: vi.fn().mockRejectedValue(
        Object.assign(new Error('No documents found for vendor NONEXISTENT_01_26'), {
          statusCode: 404,
        })
      ),
    };
    vi.mocked(getVendorService).mockReturnValue(mockVendorService as any);

    const request = {
      params: { name: 'NONEXISTENT_01_26' },
    };
    const context = mockInvocationContext();

    const response = await deleteVendorHandler(request as any, context as any);

    expect(response.status).toBe(404);
    expect(response.jsonBody.error).toBe('Not Found');
  });

  it('should handle blob deletion errors gracefully', async () => {
    // Mock service to succeed with warning
    const mockVendorService = {
      deleteVendor: vi.fn().mockResolvedValue({
        documentsDeleted: 1,
        blobsDeleted: 0, // Blob deletion failed but process continued
      }),
    };
    vi.mocked(getVendorService).mockReturnValue(mockVendorService as any);

    const request = {
      params: { name: 'TEST_VENDOR_11_25' },
    };
    const context = mockInvocationContext();

    const response = await deleteVendorHandler(request as any, context as any);

    // Should still succeed even if some blobs fail
    expect(response.status).toBe(200);
    expect(response.jsonBody.documentsDeleted).toBe(1);
  });
});
