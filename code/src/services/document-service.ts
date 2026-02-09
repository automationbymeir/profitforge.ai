import { DocumentRepository } from '../data/repositories/DocumentRepository.js';
import { StorageService } from '../data/storage.js';
import { ProcessingStatus } from '../functions/http/common/models/document.js';
import { QueueService } from '../functions/infra-adapters/queues.js';
import { getStorageConnectionString } from '../utils/config.js';

export interface UploadResult {
  documentName: string;
  vendorName: string;
  filePath: string;
  status: string;
}

export interface DocumentInfo {
  resultId: string;
  documentName: string;
  documentPath: string;
  vendorName: string;
  processingStatus: string;
  exportStatus?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeleteResult {
  documentsDeleted: number;
  blobsDeleted: number;
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
  private storageService: StorageService;
  private queueService: QueueService;

  constructor(
    documentRepo: DocumentRepository,
    storageService: StorageService,
    queueService: QueueService,
    documentsContainer: string = 'uploads'
  ) {
    this.documentRepo = documentRepo;
    this.storageService = storageService;
    this.queueService = queueService;
    this.documentsContainer = documentsContainer;
  }

  /**
   * Upload a document with vendor name
   * ONLY uploads blob to storage - blob trigger will create run record
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
    // Blob trigger will handle creating run record and queuing OCR
    await this.storageService.uploadBlob(this.documentsContainer, filePath, fileBuffer, file.type);

    return {
      documentName: file.name,
      vendorName,
      filePath,
      status: 'pending',
    };
  }

  /**
   * Delete all processing runs and blobs for a vendor
   * This is a complete vendor deletion - use with caution
   */
  async deleteDocument(vendorName: string): Promise<DeleteResult> {
    // Get all runs for this vendor before deletion
    // const documents = await this.documentRepo.findByVendor(vendorName);

    // if (documents.length === 0) {
    //   throw Object.assign(new Error('Vendor not found'), {
    //     statusCode: 404,
    //     details: {
    //       message: `No documents found for vendor ${vendorName}`,
    //     },
    //   });
    // }

    // Delete all blobs for this vendor (PDFs and OCR cache)
    let blobsDeleted = 0;
    const vendorPrefix = `${vendorName}/`;

    try {
      const blobs = await this.storageService.listBlobs(this.documentsContainer, vendorPrefix);
      for (const blobName of blobs) {
        await this.storageService.deleteBlob(this.documentsContainer, blobName);
        blobsDeleted++;
      }
    } catch (error) {
      console.warn(`⚠️ Error deleting blobs for vendor ${vendorName}:`, error);
    }

    // Delete all database records for this vendor
    const documentsDeleted = await this.documentRepo.deleteByVendor(vendorName);

    return {
      documentsDeleted,
      blobsDeleted,
    };
  }

  /**
   * Delete all runs and blobs for a vendor (alias for deleteDocument)
   * Used by tests and cleanup utilities
   */
  async deleteByVendorName(vendorName: string): Promise<DeleteResult> {
    return this.deleteDocument(vendorName);
  }

  /**
   * Get full document record by ID
   */
  async getDocument(
    resultId: string
  ): Promise<import('../functions/http/common/models/document.js').Document> {
    const document = await this.documentRepo.findById(resultId);

    if (!document) {
      const error = new Error('Document not found') as Error & { statusCode: number };
      error.statusCode = 404;
      throw error;
    }

    return document;
  }

  /**
   * Get latest processing run for a vendor
   */
  async getLatestRunByVendor(
    vendorName: string
  ): Promise<import('../functions/http/common/models/document.js').Document | null> {
    return await this.documentRepo.findLatestByVendor(vendorName);
  }

  /**
   * Get results with optional filtering
   */
  async getResults(filters?: {
    vendorName?: string;
    documentPath?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<DocumentInfo[]> {
    let documents;

    if (filters?.documentPath) {
      // Get all runs for this document path
      documents = await this.documentRepo.findByDocumentPath(filters.documentPath);
    } else {
      // Use standard query filters
      documents = await this.documentRepo.query({
        vendor_name: filters?.vendorName,
        processing_status: filters?.status as ProcessingStatus,
        limit: filters?.limit,
        offset: filters?.offset,
      });
    }

    return documents.map((doc) => ({
      resultId: doc.result_id,
      documentName: doc.document_name,
      documentPath: doc.document_path,
      vendorName: doc.vendor_name,
      processingStatus: doc.processing_status,
      exportStatus: doc.export_status,
      createdAt: doc.created_at,
      updatedAt: doc.updated_at,
    }));
  }

  /**
   * Get vendor products for a specific vendor
   *
   * Used for testing and verification of exported products.
   *
   * @param vendorName - Vendor name to query
   * @returns Array of vendor product records
   */
  async getVendorProducts(vendorName: string): Promise<string[]> {
    return await this.documentRepo.getVendorProducts(vendorName);
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
  const storageService = new StorageService(getStorageConnectionString());
  const queueService = new QueueService(getStorageConnectionString());
  const containerName = process.env.STORAGE_CONTAINER_DOCUMENTS || 'uploads';

  return new DocumentService(documentRepo, storageService, queueService, containerName);
}
