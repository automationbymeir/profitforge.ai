import sql from 'mssql';
import { withDatabase } from '../utils/database.js';
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

  constructor(documentsContainer: string = 'uploads') {
    this.documentsContainer = documentsContainer;
  }

  /**
   * Delete all documents for a vendor
   */
  async deleteVendor(vendorName: string): Promise<VendorDeleteResult> {
    return withDatabase(async (pool) => {
      // Get all documents for vendor
      const result = await pool.request().input('vendorName', sql.NVarChar, vendorName).query(`
          SELECT result_id, document_path 
          FROM vvocr.document_processing_results 
          WHERE vendor_name = @vendorName
        `);

      const documents = result.recordset;

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
      const deleteResult = await pool.request().input('vendorName', sql.NVarChar, vendorName)
        .query(`
          DELETE FROM vvocr.document_processing_results 
          WHERE vendor_name = @vendorName
        `);

      return {
        vendorName,
        documentsDeleted: deleteResult.rowsAffected[0] || 0,
        blobsDeleted,
      };
    });
  }
}

// Singleton instance
let vendorServiceInstance: VendorService | null = null;

/**
 * Get or create singleton VendorService instance
 */
export function getVendorService(): VendorService {
  if (!vendorServiceInstance) {
    const containerName = process.env.STORAGE_CONTAINER_DOCUMENTS || 'uploads';
    vendorServiceInstance = new VendorService(containerName);
  }
  return vendorServiceInstance;
}
