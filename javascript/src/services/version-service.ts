import { DocumentRepository } from '../data/repositories/DocumentRepository.js';

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
  constructor(private documentRepo: DocumentRepository) {}

  /**
   * Get version history for a document
   */
  async getHistory(documentId: string): Promise<VersionHistoryResult> {
    // Get the document to find its root parent
    const document = await this.documentRepo.findById(documentId);

    if (!document) {
      const error = new Error('Document not found') as Error & { statusCode: number };
      error.statusCode = 404;
      throw error;
    }

    const rootParentId = document.parent_document_id || document.result_id;

    // Get all versions in the chain
    const versions = await this.documentRepo.findByDocumentPath(rootParentId);

    return {
      rootDocumentId: rootParentId,
      currentDocumentId: documentId,
      totalVersions: versions.length,
      versions: versions.map((doc) => ({
        resultId: doc.result_id,
        documentName: doc.document_name,
        vendorName: doc.vendor_name,
        processingStatus: doc.processing_status,
        exportStatus: doc.export_status,
        reprocessingCount: doc.reprocessing_count,
        parentDocumentId: doc.parent_document_id,
        productCount: doc.product_count ?? 0,
        aiConfidenceScore: doc.ai_confidence_score ?? 0,
        aiCompletenessScore: doc.ai_completeness_score ?? 0,
        aiModelCostUsd: doc.ai_model_cost_usd ?? 0,
        docIntelCostUsd: doc.doc_intel_cost_usd ?? 0,
        createdAt: doc.created_at,
        processingCompletedAt: null,
        exportedAt: null,
      })),
    };
  }

  /**
   * Delete a specific version (run)
   */
  async deleteRun(documentId: string): Promise<DeleteRunResult> {
    // Check if this is a reprocessed version (has parent_document_id)
    const document = await this.documentRepo.findById(documentId);

    if (!document) {
      const error = new Error('Document not found') as Error & { statusCode: number };
      error.statusCode = 404;
      throw error;
    }

    if (!document.parent_document_id) {
      const error = new Error(
        'Cannot delete root document. Use deleteDocument to delete the entire document with all versions.'
      ) as Error & { statusCode: number };
      error.statusCode = 400;
      throw error;
    }

    // Delete the specific run
    await this.documentRepo.deleteById(documentId);

    return {
      documentId,
      version: document.reprocessing_count,
    };
  }
}

// Singleton instance
let versionServiceInstance: VersionService | null = null;

/**
 * Get or create singleton VersionService instance
 */
export async function getVersionService(): Promise<VersionService> {
  if (!versionServiceInstance) {
    const { getConnectionPool } = await import('../utils/database.js');
    const { DocumentRepository } = await import('../data/repositories/DocumentRepository.js');
    const pool = await getConnectionPool();
    const documentRepo = new DocumentRepository(pool);
    versionServiceInstance = new VersionService(documentRepo);
  }
  return versionServiceInstance;
}
