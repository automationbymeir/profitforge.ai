import { DocumentRepository } from '../data/repositories/DocumentRepository.js';
import { VendorProductRepository } from '../data/repositories/VendorProductRepository.js';
import { Product } from '../functions/http/common/models/product.js';
import { QueueService } from '../functions/infra-adapters/queues.js';
import { StorageService } from './index.js';

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

  constructor(
    documentRepo: DocumentRepository,
    vendorProductRepo: VendorProductRepository,
    queueService: QueueService,
    storageService: StorageService
  ) {
    this.documentRepo = documentRepo;
    this.vendorProductRepo = vendorProductRepo;
    this.queueService = queueService;
    this.storageService = storageService;
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
   * @param _aiModel - Optional custom AI model (reserved for future use)
   * @param _aiPrompt - Optional custom AI prompt (reserved for future use)
   */
  async createAIRun(
    vendorName: string,
    _aiModel?: string,
    _aiPrompt?: string
  ): Promise<CreateAIRunResult> {
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

    // Queue AI mapping (queue expects just the resultId string)
    // Note: custom aiModel/aiPrompt parameters would be handled by queue handler
    // For now, we queue with just the resultId - custom params can be added later
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
