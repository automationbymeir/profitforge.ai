import sql from 'mssql';
import OpenAI from 'openai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AIService, getAIService } from '../../../src/services/ai-service.js';
import { DocumentService, getDocumentService } from '../../../src/services/document-service.js';
import { getStorageService } from '../../../src/services/storage-service.js';
import { VendorService, getVendorService } from '../../../src/services/vendor-service.js';

// Mock dependencies
vi.mock('openai');
vi.mock('../../../src/services/storage-service.js');
vi.mock('../../../src/utils/database.js', () => ({
  withDatabase: vi.fn((callback) => {
    const mockPool = {
      request: vi.fn().mockReturnThis(),
      input: vi.fn().mockReturnThis(),
      query: vi.fn(),
      close: vi.fn(),
    };
    return callback(mockPool);
  }),
}));

describe('Service Layer - Unit Tests', () => {
  let mockStorageService: any;
  let mockOpenAI: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock storage service
    mockStorageService = {
      uploadBlob: vi.fn().mockResolvedValue('https://storage/uploads/vendor/file.pdf'),
      deleteBlob: vi.fn().mockResolvedValue(undefined),
      uploadBronzeLayer: vi.fn().mockResolvedValue(undefined),
      uploadToBronzeLayer: vi.fn().mockResolvedValue(undefined),
      uploadTextToBronzeLayer: vi.fn().mockResolvedValue(undefined),
      downloadBlob: vi.fn().mockResolvedValue('Mock OCR text content'),
    };
    vi.mocked(getStorageService).mockReturnValue(mockStorageService);

    // Setup mock OpenAI client
    mockOpenAI = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    columnMapping: {
                      '0-0': 'name',
                      '0-1': 'sku',
                      '0-2': 'price',
                    },
                  }),
                },
              },
            ],
            usage: {
              prompt_tokens: 100,
              completion_tokens: 50,
              total_tokens: 150,
            },
          }),
        },
      },
    };
    vi.mocked(OpenAI).mockImplementation(() => mockOpenAI);
  });

  describe('DocumentService', () => {
    let documentService: DocumentService;

    beforeEach(() => {
      documentService = new DocumentService();
    });

    describe('upload', () => {
      it('should reject invalid vendor name format', async () => {
        const file = {
          name: 'test.pdf',
          type: 'application/pdf',
          size: 1024,
          arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(10)),
        } as unknown as File;

        const error = await documentService.upload(file, 'invalid vendor!').catch((e) => e);

        expect(error.message).toContain('Invalid vendor name format');
        expect(error.statusCode).toBe(400);
      });

      it('should reject non-PDF file types', async () => {
        const file = {
          name: 'test.txt',
          type: 'text/plain',
          size: 1024,
          arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(10)),
        } as unknown as File;

        const error = await documentService.upload(file, 'TESTVENDOR_01_26').catch((e) => e);

        expect(error.message).toContain('Unsupported file type');
        expect(error.statusCode).toBe(400);
      });

      it('should successfully upload valid PDF file', async () => {
        const file = {
          name: 'test.pdf',
          type: 'application/pdf',
          size: 1024,
          arrayBuffer: vi.fn().mockResolvedValue(Buffer.from('PDF content')),
        } as unknown as File;

        const { withDatabase } = await import('../../../src/utils/database.js');
        const mockPool = {
          request: vi.fn().mockReturnThis(),
          input: vi.fn().mockReturnThis(),
          query: vi
            .fn()
            .mockResolvedValueOnce({ recordset: [] }) // Check for existing vendor - none found
            .mockResolvedValueOnce({ recordset: [{ result_id: 'test-uuid' }] }), // Insert result
        } as unknown as any;
        vi.mocked(withDatabase).mockImplementation((callback) => callback(mockPool));

        const result = await documentService.upload(file, 'TESTVENDOR_01_26');

        expect(result.resultId).toBe('test-uuid');
        expect(result.vendorName).toBe('TESTVENDOR_01_26');
        expect(mockStorageService.uploadBlob).toHaveBeenCalled();
      });
    });

    describe('deleteDocument', () => {
      it('should throw 404 when document not found', async () => {
        const { withDatabase } = await import('../../../src/utils/database.js');
        const mockPool: any = {
          request: vi.fn().mockReturnThis(),
          input: vi.fn().mockReturnThis(),
          query: vi.fn().mockResolvedValue({ recordset: [] }),
        };
        vi.mocked(withDatabase).mockImplementation((callback) => callback(mockPool));

        const error = await documentService.deleteDocument('nonexistent-uuid').catch((e) => e);

        expect(error.message).toContain('not found');
        expect(error.statusCode).toBe(404);
      });
    });

    describe('getResults', () => {
      it('should return empty array when no documents found', async () => {
        const { withDatabase } = await import('../../../src/utils/database.js');
        const mockPool = {
          request: vi.fn().mockReturnThis(),
          input: vi.fn().mockReturnThis(),
          query: vi.fn().mockResolvedValue({ recordset: [] }),
        } as unknown as any;
        vi.mocked(withDatabase).mockImplementation((callback) => callback(mockPool));

        const result = await documentService.getResults();

        expect(result).toHaveLength(0);
      });

      it('should filter results by vendorName', async () => {
        const { withDatabase } = await import('../../../src/utils/database.js');
        const mockPool = {
          request: vi.fn().mockReturnThis(),
          input: vi.fn().mockReturnThis(),
          query: vi.fn().mockResolvedValue({
            recordset: [
              {
                result_id: 'uuid-1',
                vendor_name: 'ACME_01_26',
                document_path: 'uploads/ACME_01_26/file.pdf',
                processing_status: 'completed',
                products_json: '[]',
                ocr_cost: 0.5,
                ai_cost: 1.0,
                created_at: new Date(),
              },
            ],
          }),
        } as unknown as any;
        vi.mocked(withDatabase).mockImplementation((callback) => callback(mockPool));

        const result = await documentService.getResults({ vendorName: 'ACME_01_26' });

        expect(result).toHaveLength(1);
        expect(mockPool.input).toHaveBeenCalledWith('vendorName', sql.NVarChar, 'ACME_01_26');
      });
    });

    describe('singleton pattern', () => {
      it('should return same instance on multiple calls', () => {
        const instance1 = getDocumentService();
        const instance2 = getDocumentService();
        expect(instance1).toBe(instance2);
      });
    });
  });

  describe('VendorService', () => {
    let vendorService: VendorService;

    beforeEach(() => {
      vendorService = new VendorService();
    });

    describe('deleteVendor', () => {
      it('should throw 404 when vendor has no documents', async () => {
        const { withDatabase } = await import('../../../src/utils/database.js');
        const mockPool = {
          request: vi.fn().mockReturnThis(),
          input: vi.fn().mockReturnThis(),
          query: vi.fn().mockResolvedValue({ recordset: [] }),
        } as unknown as any;
        vi.mocked(withDatabase).mockImplementation((callback) => callback(mockPool));

        const error = await vendorService.deleteVendor('NONEXISTENT').catch((e) => e);

        expect(error.message).toContain('No documents found for vendor');
        expect(error.statusCode).toBe(404);
      });

      it('should delete all documents for vendor', async () => {
        const { withDatabase } = await import('../../../src/utils/database.js');
        const mockDocuments = [
          { result_id: 'uuid-1', document_path: 'uploads/ACME/file1.pdf' },
          { result_id: 'uuid-2', document_path: 'uploads/ACME/file2.pdf' },
        ];
        const mockPool = {
          request: vi.fn().mockReturnThis(),
          input: vi.fn().mockReturnThis(),
          query: vi
            .fn()
            .mockResolvedValueOnce({ recordset: mockDocuments })
            .mockResolvedValueOnce({ rowsAffected: [2] }),
        } as unknown as any;
        vi.mocked(withDatabase).mockImplementation((callback) => callback(mockPool));

        const result = await vendorService.deleteVendor('ACME');

        expect(result.vendorName).toBe('ACME');
        expect(result.documentsDeleted).toBe(2);
        expect(mockPool.input).toHaveBeenCalledWith('vendorName', sql.NVarChar, 'ACME');
      });
    });

    describe('singleton pattern', () => {
      it('should return same instance on multiple calls', () => {
        const instance1 = getVendorService();
        const instance2 = getVendorService();
        expect(instance1).toBe(instance2);
      });
    });
  });

  describe('AIService', () => {
    let aiService: AIService;

    beforeEach(() => {
      aiService = new AIService('test-endpoint', 'test-api-key');
    });

    describe('mapProducts', () => {
      it('should throw 404 when document not found', async () => {
        const { withDatabase } = await import('../../../src/utils/database.js');
        const mockPool = {
          request: vi.fn().mockReturnThis(),
          input: vi.fn().mockReturnThis(),
          query: vi.fn().mockResolvedValue({ recordset: [] }),
        } as unknown as any;
        vi.mocked(withDatabase).mockImplementation((callback) => callback(mockPool));

        const error = await aiService.mapProducts('nonexistent-uuid').catch((e) => e);

        expect(error.message).toContain('not found');
        expect(error.statusCode).toBe(404);
      });

      it('should throw 400 when OCR processing not complete', async () => {
        const { withDatabase } = await import('../../../src/utils/database.js');
        const mockPool = {
          request: vi.fn().mockReturnThis(),
          input: vi.fn().mockReturnThis(),
          query: vi.fn().mockResolvedValue({
            recordset: [
              {
                result_id: 'test-uuid',
                vendor_name: 'TESTVENDOR',
                processing_status: 'processing', // Not ocr_complete or completed
                ocr_text_path: null,
              },
            ],
          }),
        } as unknown as any;
        vi.mocked(withDatabase).mockImplementation((callback) => callback(mockPool));

        const error = await aiService.mapProducts('test-uuid').catch((e) => e);

        expect(error.message).toContain('ocr_complete');
        expect(error.statusCode).toBe(400);
      });

      it('should successfully map products using OpenAI', async () => {
        const mockTable = {
          cells: [
            // Header row
            { kind: 'columnHeader', content: 'Product Name', rowIndex: 0, columnIndex: 0 },
            { kind: 'columnHeader', content: 'SKU', rowIndex: 0, columnIndex: 1 },
            { kind: 'columnHeader', content: 'Price', rowIndex: 0, columnIndex: 2 },
            // Data rows
            { kind: 'content', content: 'Product 1', rowIndex: 1, columnIndex: 0 },
            { kind: 'content', content: 'SKU-1', rowIndex: 1, columnIndex: 1 },
            { kind: 'content', content: '10.99', rowIndex: 1, columnIndex: 2 },
            { kind: 'content', content: 'Product 2', rowIndex: 2, columnIndex: 0 },
            { kind: 'content', content: 'SKU-2', rowIndex: 2, columnIndex: 1 },
            { kind: 'content', content: '20.99', rowIndex: 2, columnIndex: 2 },
          ],
        };

        const { withDatabase } = await import('../../../src/utils/database.js');
        const mockPool = {
          request: vi.fn().mockReturnThis(),
          input: vi.fn().mockReturnThis(),
          query: vi
            .fn()
            .mockResolvedValueOnce({
              recordset: [
                {
                  result_id: 'test-uuid',
                  vendor_name: 'TESTVENDOR',
                  processing_status: 'ocr_complete',
                  ocr_text_path: 'bronze-layer/TESTVENDOR/ocr-text.txt',
                  doc_intel_structured_data: JSON.stringify({ tables: [mockTable] }),
                  doc_intel_extracted_text: 'Sample text',
                },
              ],
            })
            .mockResolvedValueOnce({ rowsAffected: [1] }),
        } as unknown as any;
        vi.mocked(withDatabase).mockImplementation((callback) => callback(mockPool));

        const result = await aiService.mapProducts('test-uuid');

        expect(result.documentId).toBe('test-uuid');
        expect(result.vendor).toBe('TESTVENDOR');
        expect(result.products).toHaveLength(2);
        expect(result.productCount).toBe(2);
        expect(result.usage.totalTokens).toBe(150);
        expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith(
          expect.objectContaining({
            model: 'gpt-4o',
            response_format: { type: 'json_object' },
          })
        );
      });

      it('should calculate quality metrics correctly', async () => {
        const mockTable = {
          cells: [
            // Header row
            { kind: 'columnHeader', content: 'Product Name', rowIndex: 0, columnIndex: 0 },
            { kind: 'columnHeader', content: 'SKU', rowIndex: 0, columnIndex: 1 },
            { kind: 'columnHeader', content: 'Price', rowIndex: 0, columnIndex: 2 },
            { kind: 'columnHeader', content: 'Unit', rowIndex: 0, columnIndex: 3 },
            // Data rows - varying completeness for testing quality metrics
            { kind: 'content', content: 'Product 1', rowIndex: 1, columnIndex: 0 },
            { kind: 'content', content: 'SKU-1', rowIndex: 1, columnIndex: 1 },
            { kind: 'content', content: '10.99', rowIndex: 1, columnIndex: 2 },
            { kind: 'content', content: 'EA', rowIndex: 1, columnIndex: 3 },
            { kind: 'content', content: 'Product 2', rowIndex: 2, columnIndex: 0 },
            { kind: 'content', content: '', rowIndex: 2, columnIndex: 1 }, // Missing SKU
            { kind: 'content', content: '20.99', rowIndex: 2, columnIndex: 2 },
            { kind: 'content', content: '', rowIndex: 2, columnIndex: 3 },
            { kind: 'content', content: 'Product 3', rowIndex: 3, columnIndex: 0 },
            { kind: 'content', content: 'SKU-3', rowIndex: 3, columnIndex: 1 },
            { kind: 'content', content: '', rowIndex: 3, columnIndex: 2 }, // Missing price
            { kind: 'content', content: '', rowIndex: 3, columnIndex: 3 },
          ],
        };

        const { withDatabase } = await import('../../../src/utils/database.js');
        const mockPool = {
          request: vi.fn().mockReturnThis(),
          input: vi.fn().mockReturnThis(),
          query: vi
            .fn()
            .mockResolvedValueOnce({
              recordset: [
                {
                  result_id: 'test-uuid',
                  vendor_name: 'TESTVENDOR',
                  processing_status: 'ocr_complete',
                  ocr_text_path: 'bronze-layer/TESTVENDOR/ocr-text.txt',
                  doc_intel_structured_data: JSON.stringify({ tables: [mockTable] }),
                  doc_intel_extracted_text: 'Sample text',
                },
              ],
            })
            .mockResolvedValueOnce({ rowsAffected: [1] }),
        } as unknown as any;
        vi.mocked(withDatabase).mockImplementation((callback) => callback(mockPool));

        const result = await aiService.mapProducts('test-uuid');

        expect(result.qualityMetrics.productsWithSKU).toBe(2);
        expect(result.qualityMetrics.productsWithPrice).toBe(2);
        expect(result.qualityMetrics.productsWithName).toBe(3);
        expect(result.qualityMetrics.productsWithUnit).toBe(1);
        expect(result.qualityMetrics.completenessScore).toBeGreaterThan(0);
      });
    });

    describe('singleton pattern', () => {
      it('should return same instance on multiple calls', () => {
        const instance1 = getAIService();
        const instance2 = getAIService();
        expect(instance1).toBe(instance2);
      });
    });
  });
});
