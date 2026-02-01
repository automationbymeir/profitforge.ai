import { DocumentRepository } from '../data/repositories/DocumentRepository.js';
import { VendorProductRepository } from '../data/repositories/VendorProductRepository.js';
import { ProcessingStatus } from '../models/document.js';
import { Product } from '../models/product.js';
import { incrementDailyUploadCount, incrementIpUploadCount } from '../utils/usageTracker.js';
import { getVendorFileName, validateVendorName } from '../utils/validations.js';
import { getStorageService } from './storage-service.js';

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
  private storageService = getStorageService();
  private documentsContainer: string;
  private documentRepo: DocumentRepository;
  private vendorProductRepo: VendorProductRepository;

  constructor(
    documentRepo: DocumentRepository,
    vendorProductRepo: VendorProductRepository,
    documentsContainer: string = 'uploads'
  ) {
    this.documentRepo = documentRepo;
    this.vendorProductRepo = vendorProductRepo;
    this.documentsContainer = documentsContainer;
  }

  /**
   * Get vendor path for blob storage
   */
  private getVendorPath(vendorName: string): string {
    return vendorName;
  }

  /**
   * Validate file size against configured limit
   */
  private validateFileSize(fileSize: number): boolean {
    const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '0');
    const maxBytes = MAX_FILE_SIZE_MB * 1024 * 1024;
    return fileSize > maxBytes ? false : true;
  }

  /**
   * Upload a document with vendor name
   */
  async upload(
    file: File,
    vendorName: string,
    clientIp: string = 'unknown'
  ): Promise<UploadResult> {
    // Validate vendor name
    const vendorValidation = validateVendorName(vendorName);
    if (!vendorValidation.valid) {
      const error = new Error(`Invalid vendor name format: ${vendorValidation.error}`) as Error & {
        statusCode: number;
      };
      error.statusCode = 400;
      throw error;
    }

    // Validate file type
    const ALLOWED_FILE_TYPES = ['application/pdf'];
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      const error = new Error(
        `Unsupported file type: ${file.type}. Only PDF files are allowed.`
      ) as Error & { statusCode: number };
      error.statusCode = 400;
      throw error;
    }

    // Validate file size (demo mode only)
    if (process.env.IS_DEMO_MODE === 'true' && !this.validateFileSize(file.size)) {
      const error = new Error(
        `File size exceeds limit of ${process.env.MAX_FILE_SIZE_MB}MB (demo environment)`
      ) as Error & { statusCode: number };
      error.statusCode = 400;
      throw error;
    }

    // Get standardized file name
    const standardFileName = getVendorFileName(vendorName);
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const filePath = `${this.getVendorPath(vendorName)}/${standardFileName}`;

    // Check for duplicate vendor (one-to-one mapping enforcement)
    const existingDocs = await this.documentRepo.findByVendor(vendorName);

    if (existingDocs.length > 0) {
      const existingDoc = existingDocs[0];
      const error = new Error('Vendor already exists') as Error & {
        statusCode: number;
        details: unknown;
      };
      error.statusCode = 409;
      error.details = {
        message: `A document already exists for vendor ${vendorName}. Please delete the existing document first.`,
        existingDocument: {
          resultId: existingDoc.result_id,
          documentName: existingDoc.document_name,
          status: existingDoc.processing_status,
        },
      };
      throw error;
    }

    // Upload to blob storage
    await this.storageService.uploadBlob(this.documentsContainer, filePath, fileBuffer);

    // Register in database
    const resultId = await this.documentRepo.create({
      vendor_name: vendorName,
      document_name: standardFileName,
      document_path: filePath,
      document_type: file.type,
      processing_status: 'pending',
      document_size_bytes: file.size,
    });

    // Increment usage counters
    await incrementDailyUploadCount();
    await incrementIpUploadCount(clientIp);

    return {
      resultId,
      documentName: standardFileName,
      vendorName,
      filePath,
      status: 'pending',
    };
  }

  /**
   * Delete a specific document by ID
   */
  async deleteDocument(documentId: string): Promise<DeleteResult> {
    // Get document info
    const document = await this.documentRepo.findById(documentId);

    if (!document) {
      const error = new Error('Document not found') as Error & { statusCode: number };
      error.statusCode = 404;
      throw error;
    }

    // Delete blob
    let blobsDeleted = 0;
    try {
      await this.storageService.deleteBlob(this.documentsContainer, document.document_path);
      blobsDeleted = 1;
    } catch (error) {
      console.warn(`Failed to delete blob ${document.document_path}:`, error);
    }

    // Delete database record
    const documentsDeleted = await this.documentRepo.deleteById(documentId);

    return {
      documentsDeleted,
      blobsDeleted,
    };
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

// Singleton instance
let documentServiceInstance: DocumentService | null = null;

/**
 * Get or create singleton DocumentService instance
 */
export async function getDocumentService(): Promise<DocumentService> {
  if (!documentServiceInstance) {
    // Import withDatabase here to avoid circular dependency issues
    const { getConnectionPool } = await import('../utils/database.js');
    const pool = await getConnectionPool();

    const documentRepo = new DocumentRepository(pool);
    const vendorProductRepo = new VendorProductRepository(pool);
    const containerName = process.env.STORAGE_CONTAINER_DOCUMENTS || 'uploads';

    documentServiceInstance = new DocumentService(documentRepo, vendorProductRepo, containerName);
  }
  return documentServiceInstance;
}
