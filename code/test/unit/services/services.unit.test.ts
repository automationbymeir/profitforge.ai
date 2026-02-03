import OpenAI from 'openai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentRepository } from '../../../src/data/repositories/DocumentRepository.js';
import type { VendorProductRepository } from '../../../src/data/repositories/VendorProductRepository.js';
import type { Document } from '../../../src/models/document.js';
import { AIService, getAIService } from '../../../src/services/ai-service.js';
import { DocumentService } from '../../../src/services/document-service.js';
import { getStorageService } from '../../../src/services/storage-service.js';
import { VendorService } from '../../../src/services/vendor-service.js';
import { mockOpenAI, mockStorageService } from '../setup/mocks.js';

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
  let storageService: ReturnType<typeof mockStorageService>;
  let openAI: ReturnType<typeof mockOpenAI>;
  let mockDocumentRepo: DocumentRepository;
  let mockVendorProductRepo: VendorProductRepository;

  beforeEach(() => {
    vi.clearAllMocks();

    // Use consolidated mocks
    storageService = mockStorageService();
    vi.mocked(getStorageService).mockReturnValue(storageService as any);

    // Use default mockOpenAI which includes column mapping
    openAI = mockOpenAI();
    vi.mocked(OpenAI).mockImplementation(() => openAI as any);

    // Create mock repositories with vi.fn() for all methods used by services
    mockDocumentRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByVendor: vi.fn(),
      findByDocumentPath: vi.fn(),
      deleteById: vi.fn(),
      deleteByVendor: vi.fn(),
      query: vi.fn(),
      updateStatus: vi.fn(),
      updateExportStatus: vi.fn(),
      updateOcrResults: vi.fn(),
      updateAiMapping: vi.fn(),
      createReprocessingVersion: vi.fn(),
    } as unknown as DocumentRepository;

    mockVendorProductRepo = {
      createBulk: vi.fn(),
      findByVendor: vi.fn(),
    } as unknown as VendorProductRepository;
  });

  describe('DocumentService', () => {
    let documentService: DocumentService;

    beforeEach(() => {
      documentService = new DocumentService(mockDocumentRepo, mockVendorProductRepo);
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

        // Use the already-created spies and set return values
        vi.mocked(mockDocumentRepo.findByVendor).mockResolvedValue([]);
        vi.mocked(mockDocumentRepo.create).mockResolvedValue('test-uuid');

        const result = await documentService.upload(file, 'TESTVENDOR_01_26');

        expect(result.resultId).toBe('test-uuid');
        expect(result.vendorName).toBe('TESTVENDOR_01_26');
        expect(storageService.uploadBlob).toHaveBeenCalled();
        expect(mockDocumentRepo.findByVendor).toHaveBeenCalledWith('TESTVENDOR_01_26');
        expect(mockDocumentRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({
            vendor_name: 'TESTVENDOR_01_26',
            document_name: 'TESTVENDOR_01_26.pdf', // Standardized filename
            processing_status: 'pending',
          })
        );
      });
    });

    describe('deleteDocument', () => {
      it('should throw 404 when document not found', async () => {
        // Use the already-created spy and set return value
        vi.mocked(mockDocumentRepo.findById).mockResolvedValue(null);

        const error = await documentService.deleteDocument('nonexistent-uuid').catch((e) => e);

        expect(error.message).toContain('not found');
        expect(error.statusCode).toBe(404);
        expect(mockDocumentRepo.findById).toHaveBeenCalledWith('nonexistent-uuid');
      });
    });

    describe('getResults', () => {
      it('should return empty array when no documents found', async () => {
        // Use the already-created spy and set return value
        vi.mocked(mockDocumentRepo.query).mockResolvedValue([]);

        const result = await documentService.getResults();

        expect(result).toHaveLength(0);
        expect(mockDocumentRepo.query).toHaveBeenCalled();
      });

      it('should filter results by vendorName', async () => {
        const mockDocument: Document = {
          result_id: 'uuid-1',
          document_name: 'file.pdf',
          document_path: 'ACME_01_26/file.pdf',
          document_type: 'application/pdf',
          vendor_name: 'ACME_01_26',
          processing_status: 'completed',
          export_status: 'not_exported',
          reprocessing_count: 0,
          parent_document_id: null,
          doc_intel_page_count: 5,
          doc_intel_table_count: 2,
          doc_intel_cost_usd: 0.5,
          doc_intel_confidence_score: null,
          ai_mapping_result: '[]',
          ai_model_used: 'gpt-4o',
          ai_model_cost_usd: 1.0,
          ai_confidence_score: 0.95,
          ai_completeness_score: 0.9,
          product_count: 0,
          created_at: new Date(),
          updated_at: new Date(),
        };

        // Use the already-created spy and set return value
        vi.mocked(mockDocumentRepo.query).mockResolvedValue([mockDocument]);

        const result = await documentService.getResults({ vendorName: 'ACME_01_26' });

        expect(result).toHaveLength(1);
        expect(mockDocumentRepo.query).toHaveBeenCalledWith(
          expect.objectContaining({
            vendor_name: 'ACME_01_26',
          })
        );
      });
    });
  });

  describe('VendorService', () => {
    let vendorService: VendorService;

    beforeEach(() => {
      vendorService = new VendorService(mockDocumentRepo);
    });

    describe('deleteVendor', () => {
      it('should throw 404 when vendor has no documents', async () => {
        // Spy on repository method
        vi.spyOn(mockDocumentRepo, 'findByVendor').mockResolvedValue([]);

        const error = await vendorService.deleteVendor('NONEXISTENT').catch((e) => e);

        expect(error.message).toContain('No documents found for vendor');
        expect(error.statusCode).toBe(404);
        expect(mockDocumentRepo.findByVendor).toHaveBeenCalledWith('NONEXISTENT');
      });

      it('should delete all documents for vendor', async () => {
        const mockDocuments: Document[] = [
          {
            result_id: 'uuid-1',
            document_name: 'file1.pdf',
            document_path: 'ACME/file1.pdf',
            document_type: 'application/pdf',
            vendor_name: 'ACME',
            processing_status: 'completed',
            export_status: 'not_exported',
            reprocessing_count: 0,
            parent_document_id: null,
            doc_intel_page_count: 5,
            doc_intel_table_count: 2,
            doc_intel_cost_usd: 0.1,
            doc_intel_confidence_score: null,
            ai_mapping_result: null,
            ai_model_used: null,
            ai_model_cost_usd: null,
            ai_confidence_score: null,
            ai_completeness_score: null,
            product_count: null,
            created_at: new Date(),
            updated_at: new Date(),
          },
          {
            result_id: 'uuid-2',
            document_name: 'file2.pdf',
            document_path: 'ACME/file2.pdf',
            document_type: 'application/pdf',
            vendor_name: 'ACME',
            processing_status: 'completed',
            export_status: 'not_exported',
            reprocessing_count: 0,
            parent_document_id: null,
            doc_intel_page_count: 3,
            doc_intel_table_count: 1,
            doc_intel_cost_usd: 0.05,
            doc_intel_confidence_score: null,
            ai_mapping_result: null,
            ai_model_used: null,
            ai_model_cost_usd: null,
            ai_confidence_score: null,
            ai_completeness_score: null,
            product_count: null,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ];

        // Spy on repository methods
        vi.spyOn(mockDocumentRepo, 'findByVendor').mockResolvedValue(mockDocuments);
        vi.spyOn(mockDocumentRepo, 'deleteByVendor').mockResolvedValue(2);

        const result = await vendorService.deleteVendor('ACME');

        expect(result.vendorName).toBe('ACME');
        expect(result.documentsDeleted).toBe(2);
        expect(mockDocumentRepo.findByVendor).toHaveBeenCalledWith('ACME');
        expect(mockDocumentRepo.deleteByVendor).toHaveBeenCalledWith('ACME');
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
        expect(openAI.chat.completions.create).toHaveBeenCalledWith(
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
        expect(result.qualityMetrics.productsWithName).toBe(2); // Only 2 products extracted (SKU required)
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
