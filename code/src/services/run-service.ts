import { DocumentRepository } from '../data/repositories/DocumentRepository.js';
import { VendorProductRepository } from '../data/repositories/VendorProductRepository.js';
import { Product } from '../functions/http/common/models/product.js';
import { QueueService } from '../functions/infra-adapters/queues.js';
import { AI_PROMPT_MAX_LENGTH, SUPPORTED_AI_MODELS } from '../utils/constants.js';
import { AIService } from './ai-service.js';
import { StorageService } from './index.js';

// Cache for deployed models (refreshed periodically)
let deployedModelsCache: string[] | null = null;
let deployedModelsCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export interface CreateOCRRunResult {
  runId: string;
  vendorName: string;
  documentPath: string;
  status: string;
}

export interface CreateAIRunResult {
  runId: string;
  vendorName: string;
  status: string;
}

export interface RunInfo {
  resultId: string;
  vendorName: string;
  documentPath: string;
  documentName: string;
  processingStatus: string;
  exportStatus?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConfirmResult {
  documentId: string;
  vendor: string;
  productsExported: number;
}

/**
 * RunService - Business logic for processing run management
 *
 * Handles:
 * - Creating OCR runs (with queueing)
 * - Creating AI mapping runs (copying OCR metadata)
 * - Getting run details
 * - Deleting runs
 *
 * Works with resultId/runId but creates runs based on vendorName
 * by copying metadata from latest runs on that vendor.
 */
export class RunService {
  private documentRepo: DocumentRepository;
  private vendorProductRepo: VendorProductRepository;
  private queueService: QueueService;
  private storageService: StorageService;
  private aiService?: AIService;

  constructor(
    documentRepo: DocumentRepository,
    vendorProductRepo: VendorProductRepository,
    queueService: QueueService,
    storageService: StorageService,
    aiService?: AIService
  ) {
    this.documentRepo = documentRepo;
    this.vendorProductRepo = vendorProductRepo;
    this.queueService = queueService;
    this.storageService = storageService;
    this.aiService = aiService;
  }

  /**
   * Get list of deployed AI models (with caching)
   * Falls back to hardcoded SUPPORTED_AI_MODELS if dynamic fetch fails
   */
  private async getDeployedModels(): Promise<string[]> {
    const now = Date.now();

    // Return cached value if fresh
    if (deployedModelsCache && now - deployedModelsCacheTime < CACHE_TTL) {
      return deployedModelsCache;
    }

    // Try to fetch from Azure OpenAI if aiService available
    if (this.aiService) {
      try {
        const deployments = await this.aiService.listAvailableModels();
        deployedModelsCache = deployments.map((d) => d.deployment);
        deployedModelsCacheTime = now;
        return deployedModelsCache;
      } catch (error) {
        console.warn(
          'Failed to fetch deployed models dynamically, falling back to constants:',
          error
        );
      }
    }

    // Fallback to hardcoded list
    return [...SUPPORTED_AI_MODELS];
  }

  /**
   * Create a new OCR processing run
   * Called by blob upload trigger or manual reprocessing
   */
  async createOCRRun(vendorName: string): Promise<CreateOCRRunResult> {
    const documentPath = await this.storageService.getDocumentPathForVendor(vendorName);
    const fileName = documentPath.split('/').pop() || '';
    const fileSize = await this.storageService.getBlobSize(documentPath);
    // Create run record in database
    const resultId = await this.documentRepo.create({
      vendor_name: vendorName,
      document_name: fileName,
      document_path: documentPath,
      document_type: 'application/pdf',
      processing_status: 'pending',
      document_size_bytes: fileSize,
      export_status: 'not_exported',
      processing_started_at: new Date(),
    });

    // Queue OCR processing
    await this.queueService.queueOCRProcessing(resultId, documentPath);

    return {
      runId: resultId,
      vendorName,
      documentPath,
      status: 'pending',
    };
  }

  /**
   * Create a new AI mapping run with copied OCR metadata
   * Allows testing different AI models/prompts without re-running OCR
   *
   * @param vendorName - Vendor to reprocess
   * @param aiModel - Optional custom AI model (validated against deployed models)
   * @param aiPrompt - Optional custom AI prompt (max 10,000 chars)
   */
  async createAIRun(
    vendorName: string,
    aiModel?: string,
    aiPrompt?: string
  ): Promise<CreateAIRunResult> {
    // Validate custom AI model if provided
    if (aiModel) {
      const deployedModels = await this.getDeployedModels();
      if (!deployedModels.includes(aiModel)) {
        throw Object.assign(new Error('Invalid AI model'), {
          statusCode: 400,
          details: {
            message: `AI model '${aiModel}' is not available. Available models: ${deployedModels.join(', ')}`,
            supportedModels: deployedModels,
          },
        });
      }
    }

    // Validate custom AI prompt length if provided
    if (aiPrompt && aiPrompt.length > AI_PROMPT_MAX_LENGTH) {
      throw Object.assign(new Error('AI prompt too long'), {
        statusCode: 400,
        details: {
          message: `AI prompt exceeds maximum length of ${AI_PROMPT_MAX_LENGTH} characters (provided: ${aiPrompt.length})`,
          maxLength: AI_PROMPT_MAX_LENGTH,
        },
      });
    }

    // Get latest run for this vendor to copy OCR metadata
    const latestRun = await this.documentRepo.findLatestByVendor(vendorName);

    if (!latestRun) {
      throw Object.assign(new Error('No existing runs found for vendor'), {
        statusCode: 404,
        details: {
          message: `No processing runs found for vendor ${vendorName}. Upload a document first.`,
        },
      });
    }

    // Verify OCR processing was completed
    if (
      !latestRun.processing_status ||
      !['ocr_complete', 'completed'].includes(latestRun.processing_status)
    ) {
      throw Object.assign(new Error('OCR processing not complete'), {
        statusCode: 400,
        details: {
          message: `Cannot create AI mapping run - OCR processing not complete for vendor ${vendorName}. Current status: ${latestRun.processing_status}`,
          latestRunId: latestRun.result_id,
        },
      });
    }

    // Create new run with copied OCR metadata from latest run
    const newRunId = await this.documentRepo.create({
      vendor_name: latestRun.vendor_name,
      document_name: latestRun.document_name,
      document_path: latestRun.document_path,
      document_type: latestRun.document_type || 'application/pdf',
      processing_status: 'ocr_complete', // Skip OCR, go straight to AI
      document_size_bytes: latestRun.document_size_bytes || 0,
      export_status: 'not_exported',
      processing_started_at: new Date(),
    });

    // Copy OCR metadata to new run
    await this.documentRepo.updateOcrResults({
      result_id: newRunId,
      doc_intel_confidence_score: latestRun.doc_intel_confidence_score || null,
      doc_intel_cost_usd: latestRun.doc_intel_cost_usd || 0,
      doc_intel_prompt_used: latestRun.doc_intel_prompt_used || null,
    });

    // Store requested AI parameters (or null to use defaults)
    await this.documentRepo.updateAiParameters({
      result_id: newRunId,
      ai_model_requested: aiModel || null,
      ai_prompt_requested: aiPrompt || null,
    });

    // Queue AI mapping - handler will retrieve parameters from database
    await this.queueService.queueAIMapping(newRunId);

    return {
      runId: newRunId,
      vendorName,
      status: 'ocr_complete', // OCR metadata copied, AI mapping queued
    };
  }

  /**
   * Delete a specific processing run
   * Does NOT delete blob storage files or other runs for same vendor
   */
  async deleteRun(runId: string): Promise<void> {
    await this.documentRepo.deleteById(runId);
  }

  /**
   * Confirm mapping and export products to production for a specific run
   */
  async confirmMapping(documentId: string): Promise<ConfirmResult> {
    // Retrieve document and mapping result
    const document = await this.documentRepo.findById(documentId);

    if (!document) {
      throw Object.assign(new Error('Run not found'), {
        statusCode: 404,
        details: {
          message: `Processing run ${documentId} not found`,
        },
      });
    }

    if (document.processing_status !== 'completed') {
      throw Object.assign(new Error('Run not completed'), {
        statusCode: 400,
        details: {
          message: `Run status is '${document.processing_status}'. Must be 'completed' to confirm.`,
        },
      });
    }

    // Check if already exported (idempotency)
    if (document.export_status === 'confirmed') {
      const mappingData = JSON.parse(document.ai_mapping_result || '{}');
      const productsCount = (mappingData.products || []).length;
      return {
        documentId,
        vendor: document.vendor_name,
        productsExported: productsCount,
      };
    }

    if (!document.ai_mapping_result) {
      throw Object.assign(new Error('No mapping result available'), {
        statusCode: 400,
        details: {
          message: 'No mapping result available to export',
        },
      });
    }

    const mappingData = JSON.parse(document.ai_mapping_result);
    const products = mappingData.products || [];

    // Insert products into production table using repository
    const productsToInsert = products?.map((product: Product) => ({
      vendor_id: document.vendor_name,
      vendor_name: document.vendor_name,
      product_name: product.name,
      sku: product.sku,
      price: product.price,
      unit: product.unit || undefined,
      description: product.description || undefined,
      source_document_id: documentId,
      source_document_name: document.document_name,
    }));

    const insertedCount = await this.vendorProductRepo.createBulk(productsToInsert);

    // Update export status
    await this.documentRepo.updateExportStatus(documentId, 'confirmed');

    return {
      documentId,
      vendor: document.vendor_name,
      productsExported: insertedCount,
    };
  }
}

// Factory function for RunService
export async function createRunService(): Promise<RunService> {
  const { getConnectionPool } = await import('../utils/database.js');
  const { getStorageConnectionString } = await import('../utils/config.js');
  const { DocumentRepository } = await import('../data/repositories/DocumentRepository.js');
  const { VendorProductRepository } =
    await import('../data/repositories/VendorProductRepository.js');
  const { QueueService } = await import('../functions/infra-adapters/queues.js');
  const { StorageService } = await import('../data/storage.js');

  const pool = await getConnectionPool();
  const documentRepo = new DocumentRepository(pool);
  const vendorProductRepo = new VendorProductRepository(pool);
  const queueService = new QueueService(getStorageConnectionString());
  const storageService = new StorageService(getStorageConnectionString());

  return new RunService(documentRepo, vendorProductRepo, queueService, storageService);
}
