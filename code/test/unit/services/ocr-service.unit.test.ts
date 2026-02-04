import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentRepository } from '../../../src/data/repositories/DocumentRepository.js';
import type { Document } from '../../../src/models/document.js';
import { OCRService } from '../../../src/services/ocr-service.js';
import { mockStorageService } from '../setup/mocks.js';

// Mock dependencies
vi.mock('@azure/ai-document-intelligence');

describe('OCRService - Unit Tests', () => {
  let ocrService: OCRService;
  let mockDocumentRepo: DocumentRepository;
  let storageService: ReturnType<typeof mockStorageService>;
  let mockDocumentIntelligence: unknown;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Create mock DocumentRepository
    mockDocumentRepo = {
      findByDocumentPath: vi.fn(),
      updateOcrResults: vi.fn(),
      updateStatus: vi.fn(),
    } as unknown as DocumentRepository;

    // Use consolidated StorageService mock
    storageService = mockStorageService({
      uploadBlob: vi
        .fn()
        .mockResolvedValue({ url: 'https://test.blob.core.windows.net/bronze/file.pdf' }),
      uploadToBronzeLayer: vi
        .fn()
        .mockResolvedValue({ url: 'https://test.blob.core.windows.net/bronze/ocr.json' }),
    });

    // Mock Document Intelligence client
    mockDocumentIntelligence = {
      beginAnalyzeDocument: vi.fn().mockResolvedValue({
        pollUntilDone: vi.fn().mockResolvedValue({
          content: 'Product Name: Widget A\nSKU: W001',
          pages: [
            {
              pageNumber: 1,
              lines: [{ content: 'Product Name: Widget A' }, { content: 'SKU: W001' }],
            },
          ],
          tables: [
            {
              rowCount: 2,
              columnCount: 3,
              cells: [
                { rowIndex: 0, columnIndex: 0, content: 'Name' },
                { rowIndex: 0, columnIndex: 1, content: 'SKU' },
                { rowIndex: 0, columnIndex: 2, content: 'Price' },
                { rowIndex: 1, columnIndex: 0, content: 'Widget A' },
                { rowIndex: 1, columnIndex: 1, content: 'W001' },
                { rowIndex: 1, columnIndex: 2, content: '$19.99' },
              ],
            },
          ],
        }),
      }),
    };

    // Mock findByDocumentPath to return document
    const mockDocument: Document = {
      result_id: 'test-document-uuid',
      document_name: 'document.pdf',
      document_path: 'test/document.pdf',
      document_type: 'application/pdf',
      vendor_name: 'TEST',
      processing_status: 'pending',
      export_status: 'not_exported',
      reprocessing_count: 0,
      parent_document_id: null,
      doc_intel_page_count: null,
      doc_intel_table_count: null,
      doc_intel_cost_usd: null,
      doc_intel_confidence_score: null,
      ai_mapping_result: null,
      ai_model_used: null,
      ai_model_cost_usd: null,
      ai_confidence_score: null,
      ai_completeness_score: null,
      product_count: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    vi.mocked(mockDocumentRepo.findByDocumentPath).mockResolvedValue([mockDocument]);
    vi.mocked(mockDocumentRepo.updateOcrResults).mockResolvedValue(1);

    // Mock QueueService
    const mockQueueService = {
      sendMessage: vi.fn().mockResolvedValue(undefined),
    };

    ocrService = new OCRService(
      mockDocumentRepo,
      storageService as any,
      mockQueueService as any,
      'https://test.cognitiveservices.azure.com',
      'test-key'
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ocrService as any).client = mockDocumentIntelligence;
  });

  describe('processDocument', () => {
    it('should process document and extract text/tables', async () => {
      const blobContent = Buffer.from('test pdf content');
      const blobPath = 'test/document.pdf';

      const result = await ocrService.processDocument(blobContent, blobPath);

      expect(result).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((mockDocumentIntelligence as any).beginAnalyzeDocument).toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((storageService as any).uploadBlob).toHaveBeenCalled();
    });

    it('should calculate token usage and costs', async () => {
      const blobContent = Buffer.from('test pdf content');
      const blobPath = 'test/document.pdf';

      const result = await ocrService.processDocument(blobContent, blobPath);

      expect(result).toBeDefined();
      expect(result.cost).toBeGreaterThan(0);
    });

    it('should upload OCR result to storage', async () => {
      const blobContent = Buffer.from('test pdf content');
      const blobPath = 'test/document.pdf';

      await ocrService.processDocument(blobContent, blobPath);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((storageService as any).uploadBlob).toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockDocumentIntelligence as any).beginAnalyzeDocument.mockRejectedValueOnce(
        new Error('API rate limit exceeded')
      );

      const blobContent = Buffer.from('test pdf content');
      const blobPath = 'test/document.pdf';

      await expect(ocrService.processDocument(blobContent, blobPath)).rejects.toThrow(
        'API rate limit exceeded'
      );
    });

    it('should update document status to completed', async () => {
      const blobContent = Buffer.from('test pdf content');
      const blobPath = 'test/document.pdf';

      await ocrService.processDocument(blobContent, blobPath);

      // Verify OCR results were updated in database
      expect(mockDocumentRepo.updateOcrResults).toHaveBeenCalled();
      expect(mockDocumentRepo.updateOcrResults).toHaveBeenCalledWith(
        expect.objectContaining({
          result_id: 'test-document-uuid',
          doc_intel_page_count: 1,
          doc_intel_table_count: 1,
        })
      );
    });

    it('should extract tables correctly', async () => {
      const blobContent = Buffer.from('test pdf content');
      const blobPath = 'test/document.pdf';

      const result = await ocrService.processDocument(blobContent, blobPath);

      expect(result.tables).toBeDefined();
      expect(result.tables.length).toBeGreaterThan(0);
    });

    it('should handle documents with no tables', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockDocumentIntelligence as any).beginAnalyzeDocument.mockResolvedValueOnce({
        pollUntilDone: vi.fn().mockResolvedValue({
          pages: [
            {
              pageNumber: 1,
              lines: [{ content: 'Simple text document' }],
            },
          ],
          tables: [],
        }),
      });

      const blobContent = Buffer.from('test pdf content');
      const blobPath = 'test/document.pdf';

      const result = await ocrService.processDocument(blobContent, blobPath);

      expect(result.tables).toHaveLength(0);
      expect(result.pageCount).toBeGreaterThan(0);
    });
  });
});
