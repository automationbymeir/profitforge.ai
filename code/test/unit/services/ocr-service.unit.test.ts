import { beforeEach, describe, vi } from 'vitest';
import type { DocumentRepository } from '../../../src/data/repositories/DocumentRepository.prisma.js';
import { OCRService } from '../../../src/services/ocr-service.js';
import type { Document } from '../../../src/utils/models/document.js';
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
      doc_intel_cost_usd: null,
      doc_intel_confidence_score: null,
      ai_mapping_result: null,
      ai_model_used: null,
      ai_model_cost_usd: null,
      ai_confidence_score: null,
      ai_completeness_score: null,
      created_at: new Date(),
      updated_at: new Date(),
      document_size_bytes: 0,
      exported_at: null,
      processing_started_at: new Date(),
      doc_intel_prompt_used: null,
      ai_model_requested: null,
      ai_prompt_requested: null,
      ai_prompt_used: null,
      grading_results: null,
      grading_analysis: null,
      graded_at: null,
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
});
