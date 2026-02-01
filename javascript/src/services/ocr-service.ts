import { AzureKeyCredential, DocumentAnalysisClient } from '@azure/ai-form-recognizer';
import { QueueServiceClient } from '@azure/storage-queue';
import { DocumentRepository } from '../data/repositories/DocumentRepository.js';
import { getStorageService } from './storage-service.js';

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
  private storageService = getStorageService();
  private bronzeLayerContainer: string;
  private queueName: string;

  constructor(
    private documentRepo: DocumentRepository,
    endpoint: string,
    apiKey: string,
    bronzeLayerContainer: string = 'bronze-layer',
    queueName: string = 'ai-mapping-queue'
  ) {
    this.client = new DocumentAnalysisClient(endpoint, new AzureKeyCredential(apiKey));
    this.bronzeLayerContainer = bronzeLayerContainer;
    this.queueName = queueName;
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

    // Extract path - blob trigger gives full path like "uploads/vendor/file.pdf"
    const pathParts = blobPath.split('/');
    const relativePath = pathParts.length > 1 ? pathParts.slice(1).join('/') : blobPath;
    const vendorName = pathParts.length > 1 ? pathParts[1] : 'unknown';

    // Get document from database
    const documents = await this.documentRepo.findByDocumentPath(relativePath);

    if (documents.length === 0) {
      throw new Error(`Document not found in database: ${relativePath}`);
    }

    // Get the latest document (should be at index 0 due to ORDER BY reprocessing_count ASC)
    const document = documents[0];
    const documentId = document.result_id;

    // Store raw PDF in bronze-layer
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = pathParts[pathParts.length - 1];
    const rawBlobPath = `raw/${vendorName}/${timestamp}-${fileName}`;
    await this.storageService.uploadBlob(this.bronzeLayerContainer, rawBlobPath, blob);

    // Store OCR output in bronze-layer
    const ocrResult = {
      documentId,
      timestamp: new Date().toISOString(),
      content,
      tables,
      pageCount,
      tableCount,
      cost: docIntelCost,
    };
    await this.storageService.uploadToBronzeLayer(
      this.bronzeLayerContainer,
      `ocr/${documentId}.json`,
      ocrResult
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
    const queueServiceClient = QueueServiceClient.fromConnectionString(
      process.env.STORAGE_CONNECTION_STRING!
    );
    const queueClient = queueServiceClient.getQueueClient(this.queueName);
    await queueClient.createIfNotExists();

    await queueClient.sendMessage(Buffer.from(JSON.stringify({ documentId })).toString('base64'));
  }

  /**
   * Mark document as failed in database
   */
  async markAsFailed(blobPath: string, errorMessage: string): Promise<void> {
    const pathParts = blobPath.split('/');
    const relativePath = pathParts.length > 1 ? pathParts.slice(1).join('/') : blobPath;

    const documents = await this.documentRepo.findByDocumentPath(relativePath);
    if (documents.length > 0) {
      await this.documentRepo.updateStatus(documents[0].result_id, 'failed', errorMessage);
    }
  }
}

// Singleton instance
let ocrServiceInstance: OCRService | null = null;

/**
 * Get or create singleton OCRService instance
 */
export async function getOCRService(): Promise<OCRService> {
  if (!ocrServiceInstance) {
    const endpoint = process.env.DOCUMENT_INTELLIGENCE_ENDPOINT;
    const apiKey = process.env.DOCUMENT_INTELLIGENCE_KEY;
    if (!endpoint || !apiKey) {
      throw new Error(
        'Missing Document Intelligence configuration (DOCUMENT_INTELLIGENCE_ENDPOINT or DOCUMENT_INTELLIGENCE_KEY)'
      );
    }
    const { getConnectionPool } = await import('../utils/database.js');
    const { DocumentRepository } = await import('../data/repositories/DocumentRepository.js');
    const pool = await getConnectionPool();
    const documentRepo = new DocumentRepository(pool);
    ocrServiceInstance = new OCRService(documentRepo, endpoint, apiKey);
  }
  return ocrServiceInstance;
}
