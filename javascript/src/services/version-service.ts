import sql from 'mssql';
import { withDatabase } from '../utils/database.js';

export interface VersionInfo {
  resultId: string;
  documentName: string;
  vendorName: string;
  processingStatus: string;
  exportStatus: string;
  reprocessingCount: number;
  parentDocumentId: string | null;
  productCount: number;
  aiConfidenceScore: number;
  aiCompletenessScore: number;
  aiModelCostUsd: number;
  docIntelCostUsd: number;
  createdAt: Date;
  processingCompletedAt: Date | null;
  exportedAt: Date | null;
}

export interface VersionHistoryResult {
  rootDocumentId: string;
  currentDocumentId: string;
  totalVersions: number;
  versions: VersionInfo[];
}

export interface DeleteRunResult {
  documentId: string;
  version: number;
}

/**
 * VersionService - Business logic for document version management
 *
 * Handles:
 * - Version history retrieval
 * - Specific version deletion
 * - Version lineage tracking
 */
export class VersionService {
  /**
   * Get version history for a document
   */
  async getHistory(documentId: string): Promise<VersionHistoryResult> {
    return withDatabase(async (pool) => {
      // First, get the document to find its root parent
      const rootResult = await pool.request().input('documentId', sql.UniqueIdentifier, documentId)
        .query(`
          SELECT 
            result_id,
            parent_document_id,
            reprocessing_count
          FROM vvocr.document_processing_results
          WHERE result_id = @documentId
        `);

      if (rootResult.recordset.length === 0) {
        const error = new Error('Document not found') as Error & { statusCode: number };
        error.statusCode = 404;
        throw error;
      }

      const doc = rootResult.recordset[0];
      const rootParentId = doc.parent_document_id || doc.result_id;

      // Get all versions in the chain
      const versionsResult = await pool
        .request()
        .input('rootParentId', sql.UniqueIdentifier, rootParentId).query(`
          SELECT 
            result_id,
            document_name,
            vendor_name,
            processing_status,
            export_status,
            reprocessing_count,
            parent_document_id,
            product_count,
            ai_confidence_score,
            ai_completeness_score,
            ai_model_cost_usd,
            doc_intel_cost_usd,
            created_at,
            processing_completed_at,
            exported_at
          FROM vvocr.document_processing_results
          WHERE result_id = @rootParentId OR parent_document_id = @rootParentId
          ORDER BY reprocessing_count ASC
        `);

      return {
        rootDocumentId: rootParentId,
        currentDocumentId: documentId,
        totalVersions: versionsResult.recordset.length,
        versions: versionsResult.recordset.map((row) => ({
          resultId: row.result_id,
          documentName: row.document_name,
          vendorName: row.vendor_name,
          processingStatus: row.processing_status,
          exportStatus: row.export_status,
          reprocessingCount: row.reprocessing_count,
          parentDocumentId: row.parent_document_id,
          productCount: row.product_count,
          aiConfidenceScore: row.ai_confidence_score,
          aiCompletenessScore: row.ai_completeness_score,
          aiModelCostUsd: row.ai_model_cost_usd,
          docIntelCostUsd: row.doc_intel_cost_usd,
          createdAt: row.created_at,
          processingCompletedAt: row.processing_completed_at,
          exportedAt: row.exported_at,
        })),
      };
    });
  }

  /**
   * Delete a specific version (run)
   */
  async deleteRun(documentId: string): Promise<DeleteRunResult> {
    return withDatabase(async (pool) => {
      // Check if this is a reprocessed version (has parent_document_id)
      const checkResult = await pool.request().input('documentId', sql.UniqueIdentifier, documentId)
        .query(`
          SELECT 
            result_id,
            parent_document_id,
            reprocessing_count,
            document_name
          FROM vvocr.document_processing_results
          WHERE result_id = @documentId
        `);

      if (checkResult.recordset.length === 0) {
        const error = new Error('Document not found') as Error & { statusCode: number };
        error.statusCode = 404;
        throw error;
      }

      const doc = checkResult.recordset[0];

      if (!doc.parent_document_id) {
        const error = new Error(
          'Cannot delete root document. Use deleteDocument to delete the entire document with all versions.'
        ) as Error & { statusCode: number };
        error.statusCode = 400;
        throw error;
      }

      // Delete the specific run
      await pool.request().input('documentId', sql.UniqueIdentifier, documentId).query(`
          DELETE FROM vvocr.document_processing_results
          WHERE result_id = @documentId
        `);

      return {
        documentId,
        version: doc.reprocessing_count,
      };
    });
  }
}

// Singleton instance
let versionServiceInstance: VersionService | null = null;

/**
 * Get or create singleton VersionService instance
 */
export function getVersionService(): VersionService {
  if (!versionServiceInstance) {
    versionServiceInstance = new VersionService();
  }
  return versionServiceInstance;
}
