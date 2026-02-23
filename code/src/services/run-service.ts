import { DocumentRepository } from '../data/repositories/DocumentRepository.prisma.js';
import {
  CreateVendorProductInput,
  VendorProductRepository,
} from '../data/repositories/VendorProductRepository.prisma.js';
import { QueueService } from '../functions/infra-adapters/queues.js';
import { Product } from '../utils/models/product.js';
import { FieldMapper } from './field-mapper.js';
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
  mappingStats?: {
    exactMatches: number;
    fuzzyMatches: number;
    defaultValues: number;
    missingFields: number;
    avgConfidence: number;
  };
  warnings?: string[];
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
  private fieldMapper: FieldMapper;

  constructor(
    documentRepo: DocumentRepository,
    vendorProductRepo: VendorProductRepository,
    queueService: QueueService,
    storageService: StorageService,
    fieldMapper: FieldMapper
  ) {
    this.documentRepo = documentRepo;
    this.vendorProductRepo = vendorProductRepo;
    this.queueService = queueService;
    this.storageService = storageService;
    this.fieldMapper = fieldMapper;
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
   * @param aiPrompt - Optional custom AI prompt
   */
  async createAIRun(
    vendorName: string,
    _aiModel?: string,
    aiPrompt?: string
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
      ai_model_requested: _aiModel || null,
      ai_prompt_requested: aiPrompt || null,
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

    if (products.length === 0) {
      throw Object.assign(new Error('No products to export'), {
        statusCode: 400,
        details: {
          message: 'No products found in AI mapping result',
        },
      });
    }

    // OPTIMIZATION: Map headers once from first product
    // All products from same AI extraction share the same field names
    const firstProduct = products[0] as Product;
    const sourceFieldNames = Object.keys(firstProduct);
    const headerMapping = this.fieldMapper.mapHeaders(sourceFieldNames);

    // Validate header mapping before processing all products
    if (headerMapping.errors.length > 0) {
      throw Object.assign(new Error('Field mapping validation failed'), {
        statusCode: 400,
        details: {
          message: 'Unable to map required fields from AI output to database schema',
          errors: headerMapping.errors,
          sourceFields: sourceFieldNames,
        },
      });
    }

    // Use FieldMapper to map products with intelligent field matching
    const contextData = {
      vendor_id: document.vendor_name,
      vendor_name: document.vendor_name,
      source_document_id: documentId,
      source_document_name: document.document_name,
    };

    // Apply header mapping to all products (fast!)
    const productsToInsert: CreateVendorProductInput[] = products.map((product: Product) =>
      this.fieldMapper.applyMapping(product, headerMapping, contextData)
    ) as CreateVendorProductInput[];

    const insertedCount = await this.vendorProductRepo.createBulk(productsToInsert);

    // Calculate mapping statistics (only need decisions from header mapping)
    const stats = this.fieldMapper.getMappingStats(headerMapping.decisions);

    // Update export status
    await this.documentRepo.updateExportStatus(documentId, 'confirmed');

    return {
      documentId,
      vendor: document.vendor_name,
      productsExported: insertedCount,
      mappingStats: {
        exactMatches: stats.exact,
        fuzzyMatches: stats.fuzzy,
        defaultValues: stats.default,
        missingFields: stats.missing,
        avgConfidence: Math.round(stats.avgConfidence * 100) / 100,
      },
      warnings: headerMapping.warnings.length > 0 ? headerMapping.warnings : undefined,
    };
  }
}

// Factory function for RunService
export async function createRunService(): Promise<RunService> {
  const { getPrismaClient } = await import('../data/prisma-client.js');
  const { getStorageConnectionString } = await import('../utils/config.js');
  const { DocumentRepository } = await import('../data/repositories/DocumentRepository.prisma.js');
  const { VendorProductRepository } =
    await import('../data/repositories/VendorProductRepository.prisma.js');
  const { QueueService } = await import('../functions/infra-adapters/queues.js');
  const { StorageService } = await import('../data/storage.js');
  const { createFieldMapper } = await import('./field-mapper.js');

  const prisma = getPrismaClient();
  const documentRepo = new DocumentRepository(prisma);
  const vendorProductRepo = new VendorProductRepository(prisma);
  const queueService = new QueueService(getStorageConnectionString());
  const storageService = new StorageService(getStorageConnectionString());
  const fieldMapper = createFieldMapper();

  return new RunService(documentRepo, vendorProductRepo, queueService, storageService, fieldMapper);
}
