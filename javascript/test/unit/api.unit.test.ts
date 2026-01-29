import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock services BEFORE importing the handler
vi.mock('../../src/services/index.js', () => ({
  getDocumentService: vi.fn(),
  getVendorService: vi.fn(),
  getVersionService: vi.fn(),
}));

import { confirmMappingHandler } from '../../src/functions/http/documents/confirm';
import { reprocessMappingHandler } from '../../src/functions/http/documents/reprocess';
import { uploadHandler } from '../../src/functions/http/documents/upload';
import { deleteVendorHandler } from '../../src/functions/http/vendors/delete';
import { getDocumentService, getVendorService } from '../../src/services/index.js';
import { mockHttpRequest, mockInvocationContext } from './setup/mocks';

describe('Upload Handler - Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock DocumentService
    const mockDocumentService = {
      upload: vi.fn().mockResolvedValue({
        resultId: 'test-uuid-1234',
        documentName: 'BETTER_LIVING_11_25.pdf',
        vendorName: 'BETTER_LIVING_11_25',
        filePath: 'BETTER_LIVING_11_25/BETTER_LIVING_11_25.pdf',
        status: 'pending',
      }),
    };
    vi.mocked(getDocumentService).mockReturnValue(mockDocumentService as any);
  });

  it('should successfully upload a PDF file', async () => {
    const request = mockHttpRequest();
    const context = mockInvocationContext();

    const response = await uploadHandler(request as any, context as any);

    expect(response.status).toBe(201);
    expect(response.jsonBody).toMatchObject({
      message: 'Document uploaded successfully',
      documentName: 'BETTER_LIVING_11_25.pdf',
      vendorName: 'BETTER_LIVING_11_25',
      status: 'pending',
    });
    expect(response.jsonBody.resultId).toBeDefined();
    expect(response.jsonBody.filePath).toBe('BETTER_LIVING_11_25/BETTER_LIVING_11_25.pdf');
  });

  it('should return 400 when file is missing', async () => {
    const request = mockHttpRequest({
      formData: vi.fn().mockResolvedValue(new Map([['vendorName', 'BETTER_LIVING_11_25']])),
    });
    const context = mockInvocationContext();

    const response = await uploadHandler(request as any, context as any);

    expect(response.status).toBe(400);
    expect(response.jsonBody.error).toBe('Missing file or vendor name in request');
  });

  it('should return 400 when vendorName is missing', async () => {
    const request = mockHttpRequest({
      formData: vi.fn().mockResolvedValue(
        new Map<string, any>([
          [
            'file',
            {
              name: 'test.pdf',
              type: 'application/pdf',
              arrayBuffer: vi.fn().mockResolvedValue(Buffer.from('test')),
            },
          ],
        ])
      ),
    });
    const context = mockInvocationContext();

    const response = await uploadHandler(request as any, context as any);

    // Mock service to throw error for invalid file type
    const mockDocumentService = {
      upload: vi.fn().mockRejectedValue(
        Object.assign(new Error('Unsupported file type: text/plain. Only PDF files are allowed.'), {
          statusCode: 400,
        })
      ),
    };
    vi.mocked(getDocumentService).mockReturnValue(mockDocumentService as any);

    expect(response.status).toBe(400);
    expect(response.jsonBody.error).toBe('Missing file or vendor name in request');
  });

  it('should return 400 for unsupported file type', async () => {
    // Mock service to throw file type error
    const mockDocumentService = {
      upload: vi.fn().mockRejectedValue(
        Object.assign(new Error('Unsupported file type: text/plain. Only PDF files are allowed.'), {
          statusCode: 400,
        })
      ),
    };
    vi.mocked(getDocumentService).mockReturnValue(mockDocumentService as any);

    const request = mockHttpRequest({
      formData: vi.fn().mockResolvedValue(
        new Map<string, any>([
          [
            'file',
            {
              name: 'test.txt',
              type: 'text/plain',
              arrayBuffer: vi.fn().mockResolvedValue(Buffer.from('test')),
            },
          ],
          ['vendorName', 'BETTER_LIVING_11_25'],
        ])
      ),
    });
    const context = mockInvocationContext();

    const response = await uploadHandler(request as any, context as any);

    expect(response.status).toBe(400);
    expect(response.jsonBody.error).toContain('Unsupported file type');
  });

  it('should reject invalid vendor name format', async () => {
    // Mock service to throw validation error
    const mockDocumentService = {
      upload: vi.fn().mockRejectedValue(
        Object.assign(new Error('Invalid vendor name format. Expected format: VENDOR_NAME_MM_YY'), {
          statusCode: 400,
        })
      ),
    };
    vi.mocked(getDocumentService).mockReturnValue(mockDocumentService as any);

    const request = mockHttpRequest({
      formData: vi.fn().mockResolvedValue(
        new Map<string, any>([
          [
            'file',
            {
              name: 'catalog.pdf',
              type: 'application/pdf',
              arrayBuffer: vi.fn().mockResolvedValue(Buffer.from('test content')),
            },
          ],
          ['vendorName', 'invalid-vendor-123'], // Invalid format
        ])
      ),
    });
    const context = mockInvocationContext();

    const response = await uploadHandler(request as any, context as any);

    expect(response.status).toBe(400);
    expect(response.jsonBody.error).toBe(
      'Invalid vendor name format. Expected format: VENDOR_NAME_MM_YY'
    );
  });

  it('should reject vendor with invalid month', async () => {
    // Mock service to throw month validation error
    const mockDocumentService = {
      upload: vi.fn().mockRejectedValue(
        Object.assign(new Error('Invalid month: 13. Month must be between 01 and 12'), {
          statusCode: 400,
        })
      ),
    };
    vi.mocked(getDocumentService).mockReturnValue(mockDocumentService as any);

    const request = mockHttpRequest({
      formData: vi.fn().mockResolvedValue(
        new Map<string, any>([
          [
            'file',
            {
              name: 'catalog.pdf',
              type: 'application/pdf',
              arrayBuffer: vi.fn().mockResolvedValue(Buffer.from('test content')),
            },
          ],
          ['vendorName', 'BETTER_LIVING_13_25'], // Invalid month (13)
        ])
      ),
    });
    const context = mockInvocationContext();

    const response = await uploadHandler(request as any, context as any);

    expect(response.status).toBe(400);
    expect(response.jsonBody.error).toBe('Invalid month: 13. Month must be between 01 and 12');
  });

  it('should reject duplicate vendor upload', async () => {
    // Mock service to throw conflict error with details
    const mockDocumentService = {
      upload: vi.fn().mockRejectedValue(
        Object.assign(new Error('Vendor already exists'), {
          statusCode: 409,
          details: {
            message:
              'A document already exists for vendor BETTER_LIVING_11_25. Please delete the existing document first.',
            existingDocument: {
              resultId: 'existing-uuid',
              documentName: 'BETTER_LIVING-11-25.pdf',
              status: 'completed',
            },
          },
        })
      ),
    };
    vi.mocked(getDocumentService).mockReturnValue(mockDocumentService as any);

    const request = mockHttpRequest();
    const context = mockInvocationContext();

    const response = await uploadHandler(request as any, context as any);

    expect(response.status).toBe(409); // Conflict
    expect(response.jsonBody.error).toBe('Vendor already exists');
    // Details are stored in message field as JSON string
    expect(response.jsonBody.message).toBeDefined();
    const details = JSON.parse(response.jsonBody.message as string);
    expect(details.existingDocument).toBeDefined();
    expect(details.existingDocument.resultId).toBe('existing-uuid');
  });

  it('should handle blob upload errors gracefully', async () => {
    // Mock service to throw storage error
    const mockDocumentService = {
      upload: vi.fn().mockRejectedValue(new Error('Blob storage error')),
    };
    vi.mocked(getDocumentService).mockReturnValue(mockDocumentService as any);

    const request = mockHttpRequest();
    const context = mockInvocationContext();

    const response = await uploadHandler(request as any, context as any);

    expect(response.status).toBe(500);
    expect(response.jsonBody.error).toBe('Internal Server Error');
    expect(context.error).toHaveBeenCalled();
  });

  it('should handle database errors gracefully', async () => {
    // Mock service to throw database error
    const mockDocumentService = {
      upload: vi.fn().mockRejectedValue(new Error('Database error: connection failed')),
    };
    vi.mocked(getDocumentService).mockReturnValue(mockDocumentService as any);

    const request = mockHttpRequest();
    const context = mockInvocationContext();

    const response = await uploadHandler(request as any, context as any);

    expect(response.status).toBe(500);
    expect(response.jsonBody.error).toBe('Internal Server Error');
  });

  it('should reject Excel files (PDF-only validation)', async () => {
    // Mock service to throw file type error
    const mockDocumentService = {
      upload: vi
        .fn()
        .mockRejectedValue(
          Object.assign(
            new Error(
              'Unsupported file type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet. Only PDF files are allowed.'
            ),
            { statusCode: 400 }
          )
        ),
    };
    vi.mocked(getDocumentService).mockReturnValue(mockDocumentService as any);

    const request = mockHttpRequest({
      formData: vi.fn().mockResolvedValue(
        new Map<string, any>([
          [
            'file',
            {
              name: 'products.xlsx',
              type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              arrayBuffer: vi.fn().mockResolvedValue(Buffer.from('excel data')),
            },
          ],
          ['vendorName', 'BETTER_LIVING_11_25'],
        ])
      ),
    });
    const context = mockInvocationContext();

    const response = await uploadHandler(request as any, context as any);

    expect(response.status).toBe(400);
    expect(response.jsonBody.error).toContain('Only PDF files are allowed');
  });

  it('should reject image files (PDF-only validation)', async () => {
    // Mock service to throw file type error
    const mockDocumentService = {
      upload: vi.fn().mockRejectedValue(
        Object.assign(new Error('Unsupported file type: image/jpeg. Only PDF files are allowed.'), {
          statusCode: 400,
        })
      ),
    };
    vi.mocked(getDocumentService).mockReturnValue(mockDocumentService as any);

    const request = mockHttpRequest({
      formData: vi.fn().mockResolvedValue(
        new Map<string, any>([
          [
            'file',
            {
              name: 'invoice.jpg',
              type: 'image/jpeg',
              arrayBuffer: vi.fn().mockResolvedValue(Buffer.from('image data')),
            },
          ],
          ['vendorName', 'BETTER_LIVING_11_25'],
        ])
      ),
    });
    const context = mockInvocationContext();

    const response = await uploadHandler(request as any, context as any);

    expect(response.status).toBe(400);
    expect(response.jsonBody.error).toContain('Only PDF files are allowed');
  });

  it('should use standardized file naming without random UUID', async () => {
    const request = mockHttpRequest();
    const context = mockInvocationContext();

    const response = await uploadHandler(request as any, context as any);

    expect(response.status).toBe(201);
    expect(response.jsonBody.filePath).toBe('BETTER_LIVING_11_25/BETTER_LIVING_11_25.pdf');
    expect(response.jsonBody.documentName).toBe('BETTER_LIVING_11_25.pdf');
  });

  it('should only accept PDF files after POC enhancement', async () => {
    // Mock service to throw file type error
    const mockDocumentService = {
      upload: vi
        .fn()
        .mockRejectedValue(
          Object.assign(
            new Error(
              'Unsupported file type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet. Only PDF files are allowed.'
            ),
            { statusCode: 400 }
          )
        ),
    };
    vi.mocked(getDocumentService).mockReturnValue(mockDocumentService as any);

    const xlsxRequest = mockHttpRequest({
      formData: vi.fn().mockResolvedValue(
        new Map<string, any>([
          [
            'file',
            {
              name: 'products.xlsx',
              type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              arrayBuffer: vi.fn().mockResolvedValue(Buffer.from('excel data')),
            },
          ],
          ['vendorName', 'BETTER_LIVING_11_25'],
        ])
      ),
    });
    const context = mockInvocationContext();

    const response = await uploadHandler(xlsxRequest as any, context as any);

    expect(response.status).toBe(400);
    expect(response.jsonBody.error).toContain('Only PDF files are allowed');
  });

  it('should store vendor_name in database on upload', async () => {
    const request = mockHttpRequest();
    const context = mockInvocationContext();

    const response = await uploadHandler(request as any, context as any);

    expect(response.status).toBe(201);
    // Verify DocumentService.upload was called
    const mockService = vi.mocked(getDocumentService)();
    expect(mockService.upload).toHaveBeenCalled();
  });
});

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
      query: {
        get: vi.fn((key: string) => (key === 'vendorName' ? 'TEST_VENDOR_11_25' : null)),
      },
    };
    const context = mockInvocationContext();

    const response = await deleteVendorHandler(request as any, context as any);

    expect(response.status).toBe(200);
    expect(response.jsonBody.documentsDeleted).toBe(2);
    expect(response.jsonBody.blobsDeleted).toBeGreaterThanOrEqual(0);
  });

  it('should return 400 when vendorName is missing', async () => {
    const request = {
      query: {
        get: vi.fn(() => null),
      },
    };
    const context = mockInvocationContext();

    const response = await deleteVendorHandler(request as any, context as any);

    expect(response.status).toBe(400);
    expect(response.jsonBody.error).toContain('Missing vendorName');
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
      query: {
        get: vi.fn((key: string) => (key === 'vendorName' ? 'NONEXISTENT_01_26' : null)),
      },
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
      query: {
        get: vi.fn((key: string) => (key === 'vendorName' ? 'TEST_VENDOR_11_25' : null)),
      },
    };
    const context = mockInvocationContext();

    const response = await deleteVendorHandler(request as any, context as any);

    // Should still succeed even if some blobs fail
    expect(response.status).toBe(200);
    expect(response.jsonBody.documentsDeleted).toBe(1);
  });
});

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
      json: vi.fn().mockResolvedValue({ documentId: 'test-uuid-1234' }),
    };
    const context = mockInvocationContext();

    const response = await reprocessMappingHandler(request as any, context as any);

    expect(response.status).toBe(200);
    expect(response.jsonBody.newResultId).toBe('test-uuid-5678');
    expect(response.jsonBody.nextStep).toContain('AI mapping');
  });

  it('should return 400 when documentId is missing', async () => {
    const request = {
      json: vi.fn().mockResolvedValue({}),
    };
    const context = mockInvocationContext();

    const response = await reprocessMappingHandler(request as any, context as any);

    expect(response.status).toBe(400);
    expect(response.jsonBody.error).toContain('Missing documentId');
  });

  it('should handle database errors', async () => {
    // Mock service to throw error
    const mockDocumentService = {
      reprocess: vi.fn().mockRejectedValue(new Error('Database error')),
    };
    vi.mocked(getDocumentService).mockReturnValue(mockDocumentService as any);

    const request = {
      json: vi.fn().mockResolvedValue({ documentId: 'test-uuid-1234' }),
    };
    const context = mockInvocationContext();

    const response = await reprocessMappingHandler(request as any, context as any);

    expect(response.status).toBe(500);
  });
});

describe('Confirm Mapping Handler - Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock DocumentService
    const mockDocumentService = {
      confirmMapping: vi.fn().mockResolvedValue({
        productsExported: 2,
        vendor: 'ACME',
      }),
    };
    vi.mocked(getDocumentService).mockReturnValue(mockDocumentService as any);
  });

  it('should export products to vendor_products table', async () => {
    const request = {
      json: vi.fn().mockResolvedValue({ documentId: 'test-uuid-1234' }),
    };
    const context = mockInvocationContext();

    const response = await confirmMappingHandler(request as any, context as any);

    expect(response.status).toBe(200);
    expect(response.jsonBody.productsExported).toBe(2);
    expect(response.jsonBody.vendor).toBe('ACME');
  });

  it('should return 400 when documentId is missing', async () => {
    const request = {
      json: vi.fn().mockResolvedValue({}),
    };
    const context = mockInvocationContext();

    const response = await confirmMappingHandler(request as any, context as any);

    expect(response.status).toBe(400);
    expect(response.jsonBody.error).toContain('Missing documentId');
  });

  it('should return 404 when document not found', async () => {
    // Mock service to throw not found error
    const mockDocumentService = {
      confirmMapping: vi
        .fn()
        .mockRejectedValue(Object.assign(new Error('Document not found'), { statusCode: 404 })),
    };
    vi.mocked(getDocumentService).mockReturnValue(mockDocumentService as any);

    const request = {
      json: vi.fn().mockResolvedValue({ documentId: 'nonexistent-uuid' }),
    };
    const context = mockInvocationContext();

    const response = await confirmMappingHandler(request as any, context as any);

    expect(response.status).toBe(404);
    expect(response.jsonBody.error).toContain('Document not found');
  });

  it('should return 400 when document status is not completed', async () => {
    // Mock service to throw status error
    const mockDocumentService = {
      confirmMapping: vi.fn().mockRejectedValue(
        Object.assign(new Error("Document status must be 'completed' to confirm mapping"), {
          statusCode: 400,
        })
      ),
    };
    vi.mocked(getDocumentService).mockReturnValue(mockDocumentService as any);

    const request = {
      json: vi.fn().mockResolvedValue({ documentId: 'test-uuid-1234' }),
    };
    const context = mockInvocationContext();

    const response = await confirmMappingHandler(request as any, context as any);

    expect(response.status).toBe(400);
    expect(response.jsonBody.error).toContain("must be 'completed'");
  });

  it('should return 400 when no mapping result available', async () => {
    // Mock service to throw missing result error
    const mockDocumentService = {
      confirmMapping: vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error('No products found in mapping result'), { statusCode: 400 })
        ),
    };
    vi.mocked(getDocumentService).mockReturnValue(mockDocumentService as any);

    const request = {
      json: vi.fn().mockResolvedValue({ documentId: 'test-uuid-1234' }),
    };
    const context = mockInvocationContext();

    const response = await confirmMappingHandler(request as any, context as any);

    expect(response.status).toBe(400);
    expect(response.jsonBody.error).toContain('No products found');
  });
});
