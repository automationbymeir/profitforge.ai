import { AzureKeyCredential, DocumentAnalysisClient } from '@azure/ai-form-recognizer';
import { DocumentRepository } from '../data/repositories/DocumentRepository.prisma.js';
import { StorageService } from '../data/storage.js';
import type { QueueService } from '../functions/infra-adapters/queues.js';
import { getStorageConnectionString } from '../utils/config.js';

export interface OCRResult {
  documentId: string;
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
  private documentRepo: DocumentRepository;

  constructor(
    documentRepo: DocumentRepository,
    storageService: StorageService,
    queueService: QueueService,
    endpoint: string,
    apiKey: string
  ) {
    this.documentRepo = documentRepo;
    this.storageService = storageService;
    this.queueService = queueService;
    this.client = new DocumentAnalysisClient(endpoint, new AzureKeyCredential(apiKey));
  }

  /**
   * Process document from queue message (downloads blob, runs OCR, queues AI)
   */
  async processDocumentFromQueue(documentId: string, blobPath: string): Promise<OCRResult> {
    const documentsContainer = process.env.STORAGE_CONTAINER_DOCUMENTS || 'uploads';

    try {
      // Get existing run details
      const run = await this.documentRepo.findById(documentId);
      if (!run) {
        throw new Error(`Run not found: ${documentId}`);
      }
      const ocrCachePath = `${run.vendor_name}/ocr-azure-doc-intelligence.json`;

      let ocrMetadata: {
        cost: number;
        confidenceScore?: number;
        ocrStartTime: number;
        ocrEndTime: number;
      };

      // Check if OCR results already cached in blob storage
      const cachedOCR = await this.storageService.checkOCRCache(documentsContainer, ocrCachePath);

      if (cachedOCR) {
        console.log(`✅ Using cached OCR results from: ${ocrCachePath}`);
        ocrMetadata = {
          cost: cachedOCR.cost,
          confidenceScore: cachedOCR.confidenceScore,
          ocrStartTime: cachedOCR.ocrStartTime,
          ocrEndTime: cachedOCR.ocrEndTime,
        };
      } else {
        // Download PDF from blob storage
        const pdfBuffer = await this.storageService.downloadPdfForOCR(documentsContainer, blobPath);

        // Run OCR analysis
        const ocrStartTime = Date.now();
        const poller = await this.client.beginAnalyzeDocument('prebuilt-layout', pdfBuffer);
        const ocrResponse = await poller.pollUntilDone();
        const ocrEndTime = Date.now();
        // Calculate metrics
        const pageCount = ocrResponse?.pages?.length || 0;
        const docIntelCost = (pageCount / 1000) * 1.5; // $1.50 per 1,000 pages

        // Calculate average confidence score from pages
        let avgConfidence: number | undefined;
        if (ocrResponse?.pages && ocrResponse.pages.length > 0) {
          const confidenceScores = ocrResponse.pages
            .map((page) => (page as { confidence?: number }).confidence)
            .filter((conf): conf is number => conf !== undefined);
          if (confidenceScores.length > 0) {
            avgConfidence =
              confidenceScores.reduce((sum, conf) => sum + conf, 0) / confidenceScores.length;
          }
        }

        // Upload OCR results to blob cache
        await this.storageService.uploadOCRResults(documentsContainer, ocrCachePath, ocrResponse, {
          ocrStartTime,
          ocrEndTime,
          processingCost: docIntelCost,
          confidenceScore: avgConfidence,
        });

        ocrMetadata = {
          cost: docIntelCost,
          confidenceScore: avgConfidence,
          ocrStartTime,
          ocrEndTime,
        };
      }

      // Update database with OCR metadata and set status to ocr_complete
      await this.documentRepo.updateOcrResults({
        result_id: documentId,
        doc_intel_confidence_score: ocrMetadata.confidenceScore || null,
        doc_intel_cost_usd: ocrMetadata.cost,
        doc_intel_prompt_used: 'prebuilt-layout',
      });

      // Queue AI mapping
      try {
        await this.queueService.queueAIMapping(documentId);
      } catch (queueError: unknown) {
        const errorMessage = queueError instanceof Error ? queueError.message : String(queueError);
        console.error(`❌ Failed to queue AI mapping: ${errorMessage}`);
        throw new Error(`Failed to queue AI mapping: ${errorMessage}`);
      }

      return {
        documentId,
        processingDuration: ocrMetadata.ocrEndTime - ocrMetadata.ocrStartTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ OCR processing failed for ${documentId}: ${errorMessage}`);

      // Update document status to failed
      try {
        await this.documentRepo.updateStatus(documentId, 'failed', errorMessage);
      } catch (updateError) {
        console.error(`❌ Failed to update error status: ${updateError}`);
      }

      throw error;
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
  const { getPrismaClient } = await import('../data/prisma-client.js');
  const { DocumentRepository } = await import('../data/repositories/DocumentRepository.prisma.js');
  const { QueueService } = await import('../functions/infra-adapters/queues.js');
  const prisma = getPrismaClient();
  const documentRepo = new DocumentRepository(prisma);
  const storageService = new StorageService(getStorageConnectionString());
  const queueService = new QueueService(getStorageConnectionString());
  return new OCRService(documentRepo, storageService, queueService, endpoint, apiKey);
}
