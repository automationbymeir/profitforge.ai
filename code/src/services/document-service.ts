import { DocumentRepository } from '../data/repositories/DocumentRepository.js';
import { VendorProductRepository } from '../data/repositories/VendorProductRepository.js';
import { StorageService } from '../data/storage.js';
import { QueueService } from '../functions/infra-adapters/queues.js';
import { ProcessingStatus } from '../models/document.js';
import { Product } from '../models/product.js';
import { getStorageConnectionString } from '../utils/config.js';

export interface UploadResult {
  resultId: string;
  documentName: string;
  vendorName: string;
  filePath: string;
  status: string;
}

export interface DocumentInfo {
  resultId: string;
  documentName: string;
  documentPath: string;
  vendor_name: string;
  processingStatus: string;
  exportStatus?: string;
}

export interface ReprocessResult {
  originalDocumentId: string;
  newResultId: string;
  version: number;
  parentDocumentId: string;
}

export interface DeleteResult {
  documentsDeleted: number;
  blobsDeleted: number;
}

export interface ConfirmResult {
  documentId: string;
  vendor: string;
  productsExported: number;
}

/**
 * DocumentService - Business logic for document lifecycle management
 *
 * Handles:
 * - Document upload with vendor validation
 * - Document deletion
 * - Reprocessing (creating new versions)
 * - Export confirmation to production
 * - Result retrieval and querying
 */
export class DocumentService {
  private documentsContainer: string;
  private documentRepo: DocumentRepository;
  private vendorProductRepo: VendorProductRepository;
  private storageService: StorageService;
  private queueService: QueueService;

  constructor(
    documentRepo: DocumentRepository,
    vendorProductRepo: VendorProductRepository,
    storageService: StorageService,
    queueService: QueueService,
    documentsContainer: string = 'uploads'
  ) {
    this.documentRepo = documentRepo;
    this.vendorProductRepo = vendorProductRepo;
    this.storageService = storageService;
    this.queueService = queueService;
    this.documentsContainer = documentsContainer;
  }

  /**
   * Upload a document with vendor name
   */
  async upload(file: File, vendorName: string): Promise<UploadResult> {
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const filePath = `${vendorName}/${file.name}`;

    // Check for duplicate vendor (one-to-one mapping enforcement - business rule)
    const existingDocs = await this.documentRepo.findByVendor(vendorName);

    if (existingDocs.length > 0) {
      const existingDoc = existingDocs[0];
      throw Object.assign(new Error('Vendor already exists'), {
        statusCode: 409,
        details: {
          message: `A document already exists for vendor ${vendorName}. Please delete the existing document first.`,
          existingDocument: {
            resultId: existingDoc.result_id,
            documentName: existingDoc.document_name,
            status: existingDoc.processing_status,
          },
        },
      });
    }

    // Upload to blob storage with correct content type
    await this.storageService.uploadBlob(this.documentsContainer, filePath, fileBuffer, file.type);

    // Register in database
    const resultId = await this.documentRepo.create({
      vendor_name: vendorName,
      document_name: file.name,
      document_path: filePath,
      document_type: file.type,
      processing_status: 'pending',
      document_size_bytes: file.size,
    });

    // Queue OCR processing (replaces blob trigger)
    await this.queueService.queueOCRProcessing(resultId, filePath);

    return {
      resultId,
      documentName: file.name,
      vendorName,
      filePath,
      status: 'pending',
    };
  }

  /**
   * Delete a specific document by ID
   */
  async deleteDocument(documentId: string): Promise<void> {
    // Get document info
    const document = await this.documentRepo.findById(documentId);
    if (!document) {
      return;
    }
    try {
      await this.storageService.deleteBlob(this.documentsContainer, document.document_path);
    } catch (error) {
      console.warn(`Failed to delete blob ${document.document_path}:`, error);
    }
    // Delete database record
    try {
      await this.documentRepo.deleteById(document.result_id);
    } catch (error) {
      console.warn(`Failed to delete document ${document.result_id}:`, error);
    }

    return;
  }

  /**
   * Delete all documents for a specific vendor
   */
  async deleteByVendorName(vendorName: string): Promise<void> {
    // Get all documents for vendor
    const documents = await this.documentRepo.findByVendor(vendorName);

    if (documents.length === 0) {
      return;
    }
    // Delete all documents in parallel
    await Promise.all(
      documents.map(async (document) => {
        this.deleteDocument(document.result_id);
      })
    );
  }

  /**
   * Reprocess a document (create new version for AI remapping)
   */
  async reprocess(documentId: string): Promise<ReprocessResult> {
    // Get existing record
    const existing = await this.documentRepo.findById(documentId);

    if (!existing) {
      const error = new Error('Document not found') as Error & { statusCode: number };
      error.statusCode = 404;
      throw error;
    }

    // Find root parent
    const rootParentId = existing.parent_document_id || documentId;
    const newVersion = (existing.reprocessing_count || 0) + 1;

    // Create new immutable record using repository
    const newDocumentId = await this.documentRepo.createReprocessingVersion(
      documentId,
      rootParentId
    );

    return {
      originalDocumentId: documentId,
      newResultId: newDocumentId,
      version: newVersion,
      parentDocumentId: rootParentId,
    };
  }

  /**
   * Confirm mapping and export products to production
   */
  async confirmMapping(documentId: string): Promise<ConfirmResult> {
    // Retrieve document and mapping result
    const document = await this.documentRepo.findById(documentId);

    if (!document) {
      const error = new Error('Document not found') as Error & { statusCode: number };
      error.statusCode = 404;
      throw error;
    }

    if (document.processing_status !== 'completed') {
      const error = new Error(
        `Document status is '${document.processing_status}'. Must be 'completed' to confirm.`
      ) as Error & { statusCode: number };
      error.statusCode = 400;
      throw error;
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
      const error = new Error('No mapping result available to export') as Error & {
        statusCode: number;
      };
      error.statusCode = 400;
      throw error;
    }

    const mappingData = JSON.parse(document.ai_mapping_result);
    const products = mappingData.products || [];

    if (products.length === 0) {
      const error = new Error('No products found in mapping result') as Error & {
        statusCode: number;
      };
      error.statusCode = 400;
      throw error;
    }

    // Insert products into production table using repository
    const productsToInsert = products.map((product: Product) => ({
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

  /**
   * Get processing status for a document
   */
  async getProcessStatus(resultId: string): Promise<ProcessingStatus> {
    const document = await this.documentRepo.findById(resultId);

    if (!document) {
      const error = new Error('Document not found') as Error & { statusCode: number };
      error.statusCode = 404;
      throw error;
    }

    return document.processing_status;
  }

  /**
   * Get full document record by ID
   */
  async getDocument(resultId: string): Promise<import('../models/document.js').Document> {
    const document = await this.documentRepo.findById(resultId);

    if (!document) {
      const error = new Error('Document not found') as Error & { statusCode: number };
      error.statusCode = 404;
      throw error;
    }

    return document;
  }

  /**
   * Get results with optional filtering
   */
  async getResults(filters?: {
    vendorName?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<DocumentInfo[]> {
    const documents = await this.documentRepo.query({
      vendor_name: filters?.vendorName,
      processing_status: filters?.status as ProcessingStatus,
      limit: filters?.limit,
      offset: filters?.offset,
    });

    return documents.map((doc) => ({
      resultId: doc.result_id,
      documentName: doc.document_name,
      documentPath: doc.document_path,
      vendor_name: doc.vendor_name,
      processingStatus: doc.processing_status,
      exportStatus: doc.export_status,
    }));
  }
}

/**
 * Create a DocumentService instance
 *
 * For testing: inject dependencies via constructor
 * For production: use this factory to create with real dependencies
 */
export async function createDocumentService(): Promise<DocumentService> {
  const { getConnectionPool } = await import('../utils/database.js');
  const pool = await getConnectionPool();

  const documentRepo = new DocumentRepository(pool);
  const vendorProductRepo = new VendorProductRepository(pool);
  const storageService = new StorageService(getStorageConnectionString());
  const queueService = new QueueService(getStorageConnectionString());
  const containerName = process.env.STORAGE_CONTAINER_DOCUMENTS || 'uploads';

  return new DocumentService(
    documentRepo,
    vendorProductRepo,
    storageService,
    queueService,
    containerName
  );
}
