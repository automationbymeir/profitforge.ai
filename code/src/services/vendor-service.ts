import { DocumentRepository } from '../data/repositories/DocumentRepository.js';
import { getStorageService } from './storage-service.js';

export interface VendorDeleteResult {
  vendorName: string;
  documentsDeleted: number;
  blobsDeleted: number;
}

/**
 * VendorService - Business logic for vendor management
 *
 * Handles:
 * - Vendor validation
 * - Vendor deletion (cascade to all documents)
 */
export class VendorService {
  private storageService = getStorageService();
  private documentsContainer: string;

  constructor(
    private documentRepo: DocumentRepository,
    documentsContainer: string = 'uploads'
  ) {
    this.documentsContainer = documentsContainer;
  }

  /**
   * Delete all documents for a vendor
   */
  async deleteVendor(vendorName: string): Promise<VendorDeleteResult> {
    // Get all documents for vendor
    const documents = await this.documentRepo.findByVendor(vendorName);

    if (documents.length === 0) {
      const error = new Error(`No documents found for vendor: ${vendorName}`) as Error & {
        statusCode: number;
      };
      error.statusCode = 404;
      throw error;
    }

    // Delete blobs from storage
    let blobsDeleted = 0;
    for (const doc of documents) {
      try {
        await this.storageService.deleteBlob(this.documentsContainer, doc.document_path);
        blobsDeleted++;
      } catch (error) {
        console.warn(`Failed to delete blob ${doc.document_path}:`, error);
      }
    }

    // Delete database records
    const documentsDeleted = await this.documentRepo.deleteByVendor(vendorName);

    return {
      vendorName,
      documentsDeleted,
      blobsDeleted,
    };
  }
}

// Singleton instance
let vendorServiceInstance: VendorService | null = null;

/**
 * Get or create singleton VendorService instance
 */
export async function getVendorService(): Promise<VendorService> {
  if (!vendorServiceInstance) {
    const { getConnectionPool } = await import('../utils/database.js');
    const { DocumentRepository } = await import('../data/repositories/DocumentRepository.js');
    const pool = await getConnectionPool();
    const documentRepo = new DocumentRepository(pool);
    const containerName = process.env.STORAGE_CONTAINER_DOCUMENTS || 'uploads';
    vendorServiceInstance = new VendorService(documentRepo, containerName);
  }
  return vendorServiceInstance;
}
