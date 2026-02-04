import { AzureKeyCredential, DocumentAnalysisClient } from '@azure/ai-form-recognizer';
import { BlobServiceClient } from '@azure/storage-blob';
import { DocumentRepository } from '../data/repositories/DocumentRepository.js';
import { StorageService } from '../data/storage.js';
import type { QueueService } from '../functions/infra-adapters/queues.js';
import { getStorageConnectionString } from '../utils/config.js';

export interface OCRResult {
  documentId: string;
  content: string;
  tables: unknown[];
  pageCount: number;
  tableCount: number;
  cost: number;
  processingDuration: number;
}

/**
 * OCRService - Business logic for document OCR processing
 *
 * Handles:
 * - Azure Document Intelligence integration
 * - Text and table extraction
 * - Bronze-layer storage of raw documents and OCR results
 * - Database updates
 * - AI mapping queue management
 */
export class OCRService {
  private client: DocumentAnalysisClient;
  private storageService: StorageService;
  private queueService: QueueService;

  constructor(
    private documentRepo: DocumentRepository,
    storageService: StorageService,
    queueService: QueueService,
    endpoint: string,
    apiKey: string
  ) {
    this.storageService = storageService;
    this.queueService = queueService;
    this.client = new DocumentAnalysisClient(endpoint, new AzureKeyCredential(apiKey));
  }

  /**
   * Process a document with OCR
   */
  async processDocument(
    blob: Buffer,
    blobPath: string,
    startTime: number = Date.now()
  ): Promise<OCRResult> {
    // Start analysis (using prebuilt-layout for tables and structure)
    const poller = await this.client.beginAnalyzeDocument('prebuilt-layout', blob);
    const { content, tables, pages } = await poller.pollUntilDone();

    const pageCount = pages?.length || 0;
    const tableCount = tables?.length || 0;

    // Calculate cost: $1.50 per 1,000 pages
    const docIntelCost = (pageCount / 1000) * 1.5;

    // blobPath is the document path within the container (e.g., "VENDOR_NAME/file.pdf")
    const documentPath = blobPath;

    // Get document from database
    const documents = await this.documentRepo.findByDocumentPath(documentPath);

    if (documents.length === 0) {
      throw new Error(`Document not found in database: ${documentPath}`);
    }

    // Get the latest document (should be at index 0 due to ORDER BY reprocessing_count ASC)
    const document = documents[0];
    const documentId = document.result_id;

    // Store OCR output as `ocr.json` in the same folder as the original PDF
    const pathParts = blobPath.split('/');
    const folderParts = pathParts.length > 1 ? pathParts.slice(0, pathParts.length - 1) : [];
    const ocrBlobPath = folderParts.length > 0 ? `${folderParts.join('/')}/ocr.json` : 'ocr.json';

    const ocrResult = {
      documentId,
      timestamp: new Date().toISOString(),
      content,
      tables,
      pageCount,
      tableCount,
      cost: docIntelCost,
    };

    const documentsContainer = process.env.STORAGE_CONTAINER_DOCUMENTS || 'uploads';
    const jsonBuffer = Buffer.from(JSON.stringify(ocrResult, null, 2));
    await this.storageService.uploadBlob(
      documentsContainer,
      ocrBlobPath,
      jsonBuffer,
      'application/json'
    );

    // Update database with OCR results
    const processingDuration = Date.now() - startTime;

    await this.documentRepo.updateOcrResults({
      result_id: documentId,
      doc_intel_extracted_text: content,
      doc_intel_structured_data: JSON.stringify({ tables }),
      doc_intel_confidence_score: null,
      doc_intel_page_count: pageCount,
      doc_intel_table_count: tableCount,
      doc_intel_cost_usd: docIntelCost,
      doc_intel_prompt_used: null,
    });

    // Note: processing_status update to 'ocr_complete' happens inside updateOcrResults
    // TODO: Add processing_started_at and processing_duration_ms to UpdateOcrResultsInput

    return {
      documentId,
      content,
      tables: tables || [],
      pageCount,
      tableCount,
      cost: docIntelCost,
      processingDuration,
    };
  }

  /**
   * Queue AI mapping for a document
   */
  async queueAIMapping(documentId: string): Promise<void> {
    await this.queueService.queueAIMapping(documentId);
  }

  /**
   * Process document from queue message (downloads blob, runs OCR, queues AI)
   */
  async processDocumentFromQueue(documentId: string, blobPath: string): Promise<OCRResult> {
    const startTime = Date.now();

    // Download blob from storage
    const documentsContainer = process.env.STORAGE_CONTAINER_DOCUMENTS || 'uploads';
    const blobServiceClient = BlobServiceClient.fromConnectionString(getStorageConnectionString());
    const containerClient = blobServiceClient.getContainerClient(documentsContainer);
    const blobClient = containerClient.getBlobClient(blobPath);

    const downloadResponse = await blobClient.download();
    if (!downloadResponse.readableStreamBody) {
      throw new Error(`Failed to download blob: ${blobPath}`);
    }
    const blob = await this.streamToBuffer(downloadResponse.readableStreamBody);

    // Process with existing logic
    const result = await this.processDocument(blob, blobPath, startTime);

    // Queue AI mapping
    try {
      await this.queueAIMapping(result.documentId);
    } catch (queueError: unknown) {
      const errorMessage = queueError instanceof Error ? queueError.message : String(queueError);
      console.warn(`⚠️ Failed to queue AI mapping: ${errorMessage}`);
    }

    return result;
  }

  /**
   * Helper to convert stream to buffer
   */
  private async streamToBuffer(readableStream: NodeJS.ReadableStream): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      readableStream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      readableStream.on('end', () => resolve(Buffer.concat(chunks)));
      readableStream.on('error', reject);
    });
  }

  /**
   * Mark document as failed in database
   */
  async markAsFailed(blobPath: string, errorMessage: string): Promise<void> {
    const documents = await this.documentRepo.findByDocumentPath(blobPath);
    if (documents.length > 0) {
      await this.documentRepo.updateStatus(documents[0].result_id, 'failed', errorMessage);
    }
  }
}

/**
 * Create an OCRService instance
 *
 * For testing: inject dependencies via constructor
 * For production: use this factory to create with real dependencies
 */
export async function createOCRService(): Promise<OCRService> {
  const endpoint = process.env.DOCUMENT_INTELLIGENCE_ENDPOINT;
  const apiKey = process.env.DOCUMENT_INTELLIGENCE_KEY;
  if (!endpoint || !apiKey) {
    throw new Error(
      'Missing Document Intelligence configuration (DOCUMENT_INTELLIGENCE_ENDPOINT or DOCUMENT_INTELLIGENCE_KEY)'
    );
  }
  const { getConnectionPool } = await import('../utils/database.js');
  const { DocumentRepository } = await import('../data/repositories/DocumentRepository.js');
  const { QueueService } = await import('../functions/infra-adapters/queues.js');
  const pool = await getConnectionPool();
  const documentRepo = new DocumentRepository(pool);
  const storageService = new StorageService(getStorageConnectionString());
  const queueService = new QueueService(getStorageConnectionString());
  return new OCRService(documentRepo, storageService, queueService, endpoint, apiKey);
}
