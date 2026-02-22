/**
 * DocumentRepository - Data Access Layer for document_processing_results table (Prisma) * 
 * Encapsulates all database operations for documents using Prisma ORM:
 * - CRUD operations
 * - Vendor-based queries
 * - Document path queries
 * - Status updates (OCR, AI mapping, export)
 * - Reprocessing version management
 *
 * @module data/repositories
 */

import { PrismaClient, document_processing_results } from '@prisma/client';
import type { Document, ExportStatus, ProcessingStatus } from '../../utils/models/document.js';

/**
 * Input for creating a new document record
 */
export interface CreateDocumentInput {
  document_name: string;
  document_path: string;
  document_size_bytes: number;
  document_type: string;
  vendor_name: string;
  processing_status: ProcessingStatus;
  export_status: ExportStatus;
  processing_started_at: Date;
  ai_model_requested?: string | null;
  ai_prompt_requested?: string | null;
}

/**
 * Input for updating OCR results
 */
export interface UpdateOcrResultsInput {
  result_id: string;
  doc_intel_confidence_score: number | null;
  doc_intel_cost_usd: number | null;
  doc_intel_prompt_used: string | null;
}

/**
 * Input for storing requested AI parameters
 */
export interface UpdateAiParametersInput {
  result_id: string;
  ai_model_requested: string | null;
  ai_prompt_requested: string | null;
}

/**
 * Input for updating AI mapping results
 */
export interface UpdateAiMappingInput {
  result_id: string;
  ai_mapping_result: string;
  ai_model_used: string;
  ai_prompt_used: string | null;
  ai_model_cost_usd: number | null;
  ai_confidence_score: number | null;
  ai_completeness_score: number | null;
  ai_prompt_tokens: number | null;
  ai_completion_tokens: number | null;
}

/**
 * Input for updating grading results
 */
export interface UpdateGradingResultsInput {
  result_id: string;
  grading_results: string;
  grading_analysis: string;
  graded_at: Date;
}

/**
 * Query filters for flexible document search
 */
export interface DocumentQueryFilters {
  result_id?: string;
  vendor_name?: string;
  processing_status?: ProcessingStatus;
  export_status?: ExportStatus;
  limit?: number;
  offset?: number;
}

/**
 * DocumentRepository - Manages all database operations for documents using Prisma
 */
export class DocumentRepository {
  constructor(private prisma: PrismaClient) {}

  /**
   * Create a new document record
   *
   * @param input - Document creation data
   * @returns The generated result_id (UUID)
   * @throws Error if vendor_name format is invalid or database operation fails
   */
  async create(input: CreateDocumentInput): Promise<string> {
    // Validation
    if (!input.vendor_name || input.vendor_name.trim().length === 0) {
      throw new Error('vendor_name is required');
    }
    if (!input.document_name || input.document_name.trim().length === 0) {
      throw new Error('document_name is required');
    }
    if (!input.document_path || input.document_path.trim().length === 0) {
      throw new Error('document_path is required');
    }

    const document = await this.prisma.document_processing_results.create({
      data: {
        document_name: input.document_name,
        document_path: input.document_path,
        document_size_bytes: BigInt(input.document_size_bytes),
        document_type: input.document_type,
        vendor_name: input.vendor_name,
        processing_status: input.processing_status || 'pending',
        export_status: input.export_status || 'not_exported',
        processing_started_at: input.processing_started_at,
        ai_model_requested: input.ai_model_requested || null,
        ai_prompt_requested: input.ai_prompt_requested || null,
      },
      select: {
        result_id: true,
      },
    });

    return document.result_id;
  }

  /**
   * Find a document by its result_id
   *
   * @param resultId - Document UUID
   * @returns Document record or null if not found
   */
  async findById(resultId: string): Promise<Document | null> {
    const document = await this.prisma.document_processing_results.findUnique({
      where: { result_id: resultId },
    });

    return document ? this.mapToDocument(document) : null;
  }

  /**
   * Get existing run by ID for processing (OCR/AI)
   * Returns full document record including ai_mapping_result
   * Throws error if run not found
   *
   * @param resultId - Document UUID
   * @returns Complete document record including ai_mapping_result
   * @throws Error if run not found
   */
  async getRunByID(resultId: string): Promise<Document> {
    const document = await this.prisma.document_processing_results.findUnique({
      where: { result_id: resultId },
    });

    if (!document) {
      throw new Error(`Run not found: ${resultId}`);
    }

    return this.mapToDocument(document);
  }

  /**
   * Get processing status for a run (for polling/testing)
   *
   * @param resultId - Document UUID
   * @returns Current processing status
   * @throws Error if run not found
   */
  async getStatus(resultId: string): Promise<ProcessingStatus> {
    try {
      const document = await this.prisma.document_processing_results.findUnique({
        where: { result_id: resultId },
        select: { processing_status: true },
      });

      if (!document) {
        throw new Error(`Run not found: ${resultId}`);
      }

      return document.processing_status as ProcessingStatus;
    } catch (err) {
      throw new Error(`Failed to get status for run: ${resultId}, Error: ${err}`);
    }
  }

  /**
   * Find all documents for a specific vendor
   *
   * @param vendorName - Vendor name (normalized)
   * @returns Array of document records (ordered by created_at DESC)
   */
  async findByVendor(vendorName: string): Promise<Document[]> {
    const documents = await this.prisma.document_processing_results.findMany({
      where: { vendor_name: vendorName },
      orderBy: { created_at: 'desc' },
    });

    return documents.map((doc) => this.mapToDocument(doc));
  }

  /**
   * Get the latest processing run for a vendor
   *
   * @param vendorName - Vendor name
   * @returns Most recent document or null if none exists
   */
  async findLatestByVendor(vendorName: string): Promise<Document | null> {
    const document = await this.prisma.document_processing_results.findFirst({
      where: { vendor_name: vendorName },
      orderBy: { created_at: 'desc' },
    });

    return document ? this.mapToDocument(document) : null;
  }

  /**
   * Find all document runs with a specific document path
   *
   * @param documentPath - Document path in blob storage
   * @returns Array of document records (ordered by created_at DESC)
   */
  async findByDocumentPath(documentPath: string): Promise<Document[]> {
    const documents = await this.prisma.document_processing_results.findMany({
      where: { document_path: documentPath },
      orderBy: { created_at: 'desc' },
    });

    return documents.map((doc) => this.mapToDocument(doc));
  }

  /**
   * Query documents with flexible filters
   * Supports filtering by result_id, vendor_name, status, pagination
   *
   * @param filters - Optional query filters
   * @returns Array of matching documents
   */
  async query(filters?: DocumentQueryFilters): Promise<Document[]> {
    const where: any = {};

    if (filters?.result_id) {
      where.result_id = filters.result_id;
    }
    if (filters?.vendor_name) {
      where.vendor_name = filters.vendor_name;
    }
    if (filters?.processing_status) {
      where.processing_status = filters.processing_status;
    }
    if (filters?.export_status) {
      where.export_status = filters.export_status;
    }

    const documents = await this.prisma.document_processing_results.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: filters?.limit,
      skip: filters?.offset,
    });

    return documents.map((doc) => this.mapToDocument(doc));
  }

  /**
   * Update OCR processing results
   * Sets processing_status to 'ocr_complete'
   *
   * @param input - OCR results data
   * @returns Number of rows affected (1 if successful)
   */
  async updateOcrResults(input: UpdateOcrResultsInput): Promise<number> {
    const result = await this.prisma.document_processing_results.updateMany({
      where: { result_id: input.result_id },
      data: {
        doc_intel_confidence_score: input.doc_intel_confidence_score,
        doc_intel_cost_usd: input.doc_intel_cost_usd,
        doc_intel_prompt_used: input.doc_intel_prompt_used,
        processing_status: 'ocr_complete',
        updated_at: new Date(),
      },
    });

    return result.count;
  }

  /**
   * Update requested AI parameters (model and prompt)
   * Stores user's requested AI configuration before processing
   *
   * @param input - AI parameters
   * @returns Number of rows affected (1 if successful)
   */
  async updateAiParameters(input: UpdateAiParametersInput): Promise<number> {
    const result = await this.prisma.document_processing_results.updateMany({
      where: { result_id: input.result_id },
      data: {
        ai_model_requested: input.ai_model_requested,
        ai_prompt_requested: input.ai_prompt_requested,
        updated_at: new Date(),
      },
    });

    return result.count;
  }

  /**
   * Update AI mapping results
   * Stores LLM response, costs, and marks processing as complete
   *
   * @param input - AI mapping data
   * @returns Number of rows affected (1 if successful)
   */
  async updateAiMapping(input: UpdateAiMappingInput): Promise<number> {
    const result = await this.prisma.document_processing_results.updateMany({
      where: { result_id: input.result_id },
      data: {
        ai_mapping_result: input.ai_mapping_result,
        ai_model_used: input.ai_model_used,
        ai_prompt_used: input.ai_prompt_used,
        ai_model_cost_usd: input.ai_model_cost_usd,
        ai_confidence_score: input.ai_confidence_score,
        ai_completeness_score: input.ai_completeness_score,
        ai_prompt_tokens: input.ai_prompt_tokens,
        ai_completion_tokens: input.ai_completion_tokens,
        processing_status: 'completed',
        processing_completed_at: new Date(),
        updated_at: new Date(),
      },
    });

    return result.count;
  }

  /**
   * Update grading results
   * Stores quality metrics and analysis
   *
   * @param input - Grading data
   * @returns Number of rows affected (1 if successful)
   */
  async updateGradingResults(input: UpdateGradingResultsInput): Promise<number> {
    const result = await this.prisma.document_processing_results.updateMany({
      where: { result_id: input.result_id },
      data: {
        updated_at: new Date(),
      },
    });

    return result.count;
  }

  /**
   * Update processing status
   *
   * @param resultId - Document UUID
   * @param status - New processing status
   * @param errorMessage - Optional error message if failed
   * @returns Number of rows affected (1 if successful)
   */
  async updateStatus(
    resultId: string,
    status: ProcessingStatus,
    errorMessage?: string | null
  ): Promise<number> {
    const updateData: any = {
      processing_status: status,
      updated_at: new Date(),
    };

    if (errorMessage !== undefined) {
      updateData.error_message = errorMessage;
    }

    if (status === 'completed') {
      updateData.processing_completed_at = new Date();
    }

    const result = await this.prisma.document_processing_results.updateMany({
      where: { result_id: resultId },
      data: updateData,
    });

    return result.count;
  }

  /**
   * Update export status
   *
   * @param resultId - Document UUID
   * @param exportStatus - New export status
   * @returns Number of rows affected (1 if successful)
   */
  async updateExportStatus(resultId: string, exportStatus: ExportStatus): Promise<number> {
    const updateData: any = {
      export_status: exportStatus,
      updated_at: new Date(),
    };

    if (exportStatus === 'exported') {
      updateData.exported_at = new Date();
    }

    const result = await this.prisma.document_processing_results.updateMany({
      where: { result_id: resultId },
      data: updateData,
    });

    return result.count;
  }

  /**
   * Delete a document by result_id
   *
   * @param resultId - Document UUID
   * @returns Number of rows deleted (1 if successful, 0 if not found)
   */
  async deleteById(resultId: string): Promise<number> {
    try {
      await this.prisma.document_processing_results.delete({
        where: { result_id: resultId },
      });
      return 1;
    } catch (error) {
      // If record not found, return 0
      return 0;
    }
  }

  /**
   * Delete all documents for a specific vendor
   *
   * @param vendorName - Vendor name
   * @returns Number of rows deleted
   */
  async deleteByVendor(vendorName: string): Promise<number> {
    const result = await this.prisma.document_processing_results.deleteMany({
      where: { vendor_name: vendorName },
    });

    return result.count;
  }

  /**
   * Delete all documents with a specific document path
   *
   * @param documentPath - Document path in blob storage
   * @returns Number of rows deleted
   */
  async deleteByDocumentPath(documentPath: string): Promise<number> {
    const result = await this.prisma.document_processing_results.deleteMany({
      where: { document_path: documentPath },
    });

    return result.count;
  }

  /**
   * Get all vendor product IDs for a vendor (for cleanup tasks)
   *
   * @param vendorName - Vendor name
   * @returns Array of product IDs (empty if no products)
   */
  async getVendorProducts(vendorName: string): Promise<string[]> {
    const products = await this.prisma.vendor_products.findMany({
      where: { vendor_name: vendorName },
      select: { id: true },
    });

    return products.map((p) => p.id);
  }

  /**
   * Delete all vendor products for a vendor
   *
   * @param vendorName - Vendor name
   * @returns Number of products deleted
   */
  async deleteVendorProducts(vendorName: string): Promise<number> {
    const result = await this.prisma.vendor_products.deleteMany({
      where: { vendor_name: vendorName },
    });

    return result.count;
  }

  /**
   * Delete all documents (use with caution!)
   *
   * @returns Number of documents deleted
   */
  async deleteAll(): Promise<number> {
    const result = await this.prisma.document_processing_results.deleteMany();
    return result.count;
  }

  /**
   * Helper method to map Prisma result to Document type
   * Handles BigInt to number conversion for document_size_bytes
   */
  private mapToDocument(doc: document_processing_results): Document {
    return {
      result_id: doc.result_id,
      document_name: doc.document_name,
      document_path: doc.document_path || '',
      document_size_bytes: doc.document_size_bytes ? Number(doc.document_size_bytes) : 0,
      document_type: doc.document_type || '',
      vendor_name: doc.vendor_name,
      processing_status: doc.processing_status as ProcessingStatus,
      export_status: doc.export_status as ExportStatus,
      exported_at: doc.exported_at,
      processing_started_at: doc.processing_started_at || new Date(),
      doc_intel_confidence_score: doc.doc_intel_confidence_score
        ? Number(doc.doc_intel_confidence_score)
        : null,
      doc_intel_cost_usd: doc.doc_intel_cost_usd ? Number(doc.doc_intel_cost_usd) : null,
      doc_intel_prompt_used: doc.doc_intel_prompt_used,
      ai_model_requested: doc.ai_model_requested,
      ai_prompt_requested: doc.ai_prompt_requested,
      ai_mapping_result: doc.ai_mapping_result,
      ai_prompt_used: doc.ai_prompt_used,
      ai_model_used: doc.ai_model_used,
      ai_model_cost_usd: doc.ai_model_cost_usd ? Number(doc.ai_model_cost_usd) : null,
      ai_confidence_score: doc.ai_confidence_score ? Number(doc.ai_confidence_score) : null,
      ai_completeness_score: doc.ai_completeness_score
        ? Number(doc.ai_completeness_score)
        : null,
      grading_results: null,
      grading_analysis: null,
      graded_at: null,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
    };
  }
}

/**
 * Factory function for DocumentRepository
 * Creates a repository instance with Prisma client
 */
export async function createDocumentRepository(): Promise<DocumentRepository> {
  const { getPrismaClient } = await import('../prisma-client.js');
  const prisma = getPrismaClient();
  return new DocumentRepository(prisma);
}
