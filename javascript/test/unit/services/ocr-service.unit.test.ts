import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OCRService, getOCRService } from '../../../src/services/ocr-service.js';
import { getStorageService } from '../../../src/services/storage-service.js';
import { mockStorageService } from '../setup/mocks.js';

// Mock dependencies
vi.mock('@azure/ai-document-intelligence');
vi.mock('../../../src/services/storage-service.js');
vi.mock('../../../src/utils/database.js', () => ({
  withDatabase: vi.fn(),
}));

describe('OCRService - Unit Tests', () => {
  let ocrService: OCRService;
  let storageService: ReturnType<typeof mockStorageService>;
  let mockDocumentIntelligence: unknown;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock withDatabase to return a document ID
    const { withDatabase } = await import('../../../src/utils/database.js');
    vi.mocked(withDatabase).mockImplementation(async (callback) => {
      return callback({
        request: () => ({
          input: vi.fn().mockReturnThis(),
          query: vi.fn().mockResolvedValue({
            recordset: [{ result_id: 'test-document-uuid' }],
          }),
        }),
      } as any);
    });

    // Use consolidated StorageService mock
    storageService = mockStorageService({
      uploadBlob: vi
        .fn()
        .mockResolvedValue({ url: 'https://test.blob.core.windows.net/bronze/file.pdf' }),
      uploadToBronzeLayer: vi
        .fn()
        .mockResolvedValue({ url: 'https://test.blob.core.windows.net/bronze/ocr.json' }),
    });
    vi.mocked(getStorageService).mockReturnValue(storageService as any);

    // Mock Document Intelligence client
    mockDocumentIntelligence = {
      beginAnalyzeDocument: vi.fn().mockResolvedValue({
        pollUntilDone: vi.fn().mockResolvedValue({
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

    ocrService = new OCRService(
      'https://test.cognitiveservices.azure.com',
      'test-key',
      'bronze-layer',
      'ai-mapping-queue'
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
      expect((storageService as any).uploadToBronzeLayer).toHaveBeenCalled();
    });

    it('should calculate token usage and costs', async () => {
      const blobContent = Buffer.from('test pdf content');
      const blobPath = 'test/document.pdf';

      const result = await ocrService.processDocument(blobContent, blobPath);

      expect(result).toBeDefined();
      expect(result.cost).toBeGreaterThan(0);
    });

    it('should upload OCR result to bronze layer', async () => {
      const blobContent = Buffer.from('test pdf content');
      const blobPath = 'test/document.pdf';

      await ocrService.processDocument(blobContent, blobPath);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((storageService as any).uploadToBronzeLayer).toHaveBeenCalled();
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

      // Verify database update was called (through withDatabase mock)
      const { withDatabase } = await import('../../../src/utils/database.js');
      expect(withDatabase).toHaveBeenCalled();
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

  describe('singleton pattern', () => {
    it('should return same instance on multiple calls', () => {
      const instance1 = getOCRService();
      const instance2 = getOCRService();

      expect(instance1).toBe(instance2);
    });
  });
});
