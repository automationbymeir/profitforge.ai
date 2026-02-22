/**
 * DocumentRepository - Data Access Layer for document_processing_results table
 *
 * Encapsulates all SQL queries for document operations including:
 * - CRUD operations
 * - Vendor-based queries
 * - Document path queries
 * - Status updates (OCR, AI mapping, export)
 * - Reprocessing version management
 *
 * @module data/repositories
 */

import sql from 'mssql';
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
  // Large data stored in blob:
  // doc_intel_extracted_text: string | null;
  // doc_intel_structured_data: string | null;
  // Small metadata stored in DB:
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
  grading_results: string; // JSON string of GradingMetrics
  grading_analysis: string; // JSON string of GradingAnalysis
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
 * DocumentRepository - Manages all database operations for documents
 */
export class DocumentRepository {
  constructor(private pool: sql.ConnectionPool) {}

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

    const result = await this.pool
      .request()
      .input('vendorName', sql.NVarChar, input.vendor_name)
      .input('documentName', sql.NVarChar, input.document_name)
      .input('documentPath', sql.NVarChar, input.document_path)
      .input('fileSize', sql.BigInt, input.document_size_bytes)
      .input('fileType', sql.NVarChar, input.document_type)
      .input('status', sql.NVarChar, input.processing_status || 'pending')
      .input('exportStatus', sql.NVarChar, input.export_status || 'not_exported')
      .input('processingStartedAt', sql.DateTime, input.processing_started_at)
      .input('aiModelRequested', sql.NVarChar, input.ai_model_requested || null)
      .input('aiPromptRequested', sql.NVarChar, input.ai_prompt_requested || null).query(`
        INSERT INTO vvocr.document_processing_results 
        (document_name, document_path, document_size_bytes, document_type, processing_status, vendor_name,
         export_status, processing_started_at, ai_model_requested, ai_prompt_requested)
        OUTPUT INSERTED.result_id
        VALUES (@documentName, @documentPath, @fileSize, @fileType, @status, @vendorName,
                @exportStatus, @processingStartedAt, @aiModelRequested, @aiPromptRequested)
      `);

    return result.recordset[0].result_id;
  }

  /**
   * Find a document by its result_id
   *
   * @param resultId - Document UUID
   * @returns Document record or null if not found
   */
  async findById(resultId: string): Promise<Document | null> {
    const result = await this.pool.request().input('resultId', sql.UniqueIdentifier, resultId)
      .query(`
        SELECT 
          result_id,
          document_name,
          document_path,
          document_size_bytes,
          document_type,
          vendor_name,
          processing_status,
          export_status,
          doc_intel_confidence_score,
          doc_intel_cost_usd,
          doc_intel_prompt_used,
          ai_mapping_result,
          ai_model_requested,
          ai_prompt_requested,
          ai_model_used,
          ai_prompt_used,
          ai_model_cost_usd,
          ai_confidence_score,
          ai_completeness_score,
          grading_results,
          grading_analysis,
          graded_at,
          exported_at,
          created_at,
          updated_at
        FROM vvocr.document_processing_results
        WHERE result_id = @resultId
      `);

    return result.recordset.length > 0 ? result.recordset[0] : null;
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
    const result = await this.pool.request().input('resultId', sql.UniqueIdentifier, resultId)
      .query(`
        SELECT 
          result_id,
          ai_mapping_result,
          document_name,
          document_path,
          document_size_bytes,
          document_type,
          vendor_name,
          processing_status,
          export_status,
          doc_intel_confidence_score,
          doc_intel_cost_usd,
          grading_results,
          grading_analysis,
          graded_at,
          doc_intel_prompt_used,
          ai_model_requested,
          ai_prompt_requested,
          ai_model_used,
          ai_prompt_used,
          ai_model_cost_usd,
          ai_confidence_score,
          ai_completeness_score,
          exported_at,
          created_at,
          updated_at
        FROM vvocr.document_processing_results
        WHERE result_id = @resultId
      `);

    if (result.recordset.length === 0) {
      throw new Error(`Run not found: ${resultId}`);
    }

    return result.recordset[0];
  }

  /**
   * Get processing status for a run (for polling/testing)
   *
   * @param resultId - Document UUID
   * @returns Current processing status
   * @throws Error if run not found
   */
  async getStatus(resultId: string): Promise<ProcessingStatus> {
    let result;
    try {
      result = await this.pool.request().input('resultId', sql.UniqueIdentifier, resultId).query(`
        SELECT processing_status
        FROM vvocr.document_processing_results
        WHERE result_id = @resultId
      `);
    } catch (err) {
      throw new Error(`Failed to get status for run: ${resultId}, Error: ${err}`);
    }
    if (result.recordset.length === 0) {
      throw new Error(`Run not found: ${resultId}`);
    }

    return result.recordset[0].processing_status;
  }

  /**
   * Find all documents for a specific vendor
   *
   * @param vendorName - Vendor name (normalized)
   * @returns Array of document records (ordered by created_at DESC)
   */
  async findByVendor(vendorName: string): Promise<Document[]> {
    const result = await this.pool.request().input('vendorName', sql.NVarChar, vendorName).query(`
        SELECT 
          result_id,
          document_name,
          document_path,
          document_size_bytes,
          document_type,
          vendor_name,
          processing_status,
          export_status,
          doc_intel_cost_usd,
          doc_intel_confidence_score,
          doc_intel_prompt_used,
          ai_mapping_result,
          ai_model_requested,
          ai_prompt_requested,
          ai_model_used,
          ai_prompt_used,
          ai_model_cost_usd,
          ai_confidence_score,
          ai_completeness_score,
          grading_results,
          grading_analysis,
          graded_at,
          exported_at,
          created_at,
          updated_at
        FROM vvocr.document_processing_results
        WHERE vendor_name = @vendorName
        ORDER BY created_at DESC
      `);

    return result.recordset;
  }

  /**
   * Get the latest processing run for a vendor
   *
   * @param vendorName - Vendor name (normalized)
   * @returns Most recent document record or null if none exists
   */
  async findLatestByVendor(vendorName: string): Promise<Document | null> {
    const result = await this.pool.request().input('vendorName', sql.NVarChar, vendorName).query(`
        SELECT TOP 1
          result_id,
          document_name,
          document_path,
          document_size_bytes,
          document_type,
          vendor_name,
          processing_status,
          export_status,
          doc_intel_cost_usd,
          doc_intel_confidence_score,
          doc_intel_prompt_used,
          ai_mapping_result,
          ai_model_requested,
          ai_prompt_requested,
          ai_model_used,
          ai_prompt_used,
          ai_model_cost_usd,
          ai_confidence_score,
          ai_completeness_score,
          grading_results,
          grading_analysis,
          graded_at,
          exported_at,
          created_at,
          updated_at
        FROM vvocr.document_processing_results
        WHERE vendor_name = @vendorName
        ORDER BY created_at DESC
      `);

    return result.recordset.length > 0 ? result.recordset[0] : null;
  }

  /**
   * Find all documents with the same document_path (original + reprocessed versions)
   *
   * @param documentPath - Blob storage path
   * @returns Array of document records (ordered by created_at DESC)
   */
  async findByDocumentPath(documentPath: string): Promise<Document[]> {
    const result = await this.pool.request().input('documentPath', sql.NVarChar, documentPath)
      .query(`
        SELECT 
          result_id,
          document_name,
          document_path,
          document_size_bytes,
          document_type,
          vendor_name,
          processing_status,
          export_status,
          doc_intel_cost_usd,
          doc_intel_confidence_score,
          doc_intel_prompt_used,
          ai_mapping_result,
          ai_model_requested,
          ai_prompt_requested,
          ai_model_used,
          ai_prompt_used,
          ai_model_cost_usd,
          ai_confidence_score,
          ai_completeness_score,
          grading_results,
          grading_analysis,
          graded_at,
          exported_at,
          created_at,
          updated_at
        FROM vvocr.document_processing_results
        WHERE document_path = @documentPath
        ORDER BY created_at DESC
      `);

    return result.recordset;
  }

  /**
   * Query documents with flexible filtering
   *
   * @param filters - Optional query filters
   * @returns Array of document records (ordered by created_at DESC)
   */
  async query(filters?: DocumentQueryFilters): Promise<Document[]> {
    let queryText = `
      SELECT 
        result_id,
        document_name,
        document_path,
        vendor_name,
        processing_status,
        export_status,
        doc_intel_cost_usd,
        doc_intel_confidence_score,
        doc_intel_prompt_used,
        ai_mapping_result,
        ai_model_requested,
        ai_prompt_requested,
        ai_model_used,
        ai_prompt_used,
        ai_model_cost_usd,
        ai_confidence_score,
        ai_completeness_score,
        grading_results,
        grading_analysis,
        graded_at,
        exported_at,
        created_at,
        updated_at
      FROM vvocr.document_processing_results
      WHERE 1=1
    `;

    const request = this.pool.request();

    if (filters?.vendor_name) {
      queryText += ' AND vendor_name = @vendorName';
      request.input('vendorName', sql.NVarChar, filters.vendor_name);
    }

    if (filters?.processing_status) {
      queryText += ' AND processing_status = @processingStatus';
      request.input('processingStatus', sql.NVarChar, filters.processing_status);
    }

    if (filters?.export_status) {
      queryText += ' AND export_status = @exportStatus';
      request.input('exportStatus', sql.NVarChar, filters.export_status);
    }

    queryText += ' ORDER BY created_at DESC';

    if (filters?.limit) {
      const offset = filters.offset || 0;
      queryText += ` OFFSET ${offset} ROWS FETCH NEXT ${filters.limit} ROWS ONLY`;
    }

    const result = await request.query(queryText);
    return result.recordset;
  }

  /**
   * Update OCR processing results for a document
   *
   * @param input - OCR results data
   * @returns Number of rows affected (should be 1)
   */
  async updateOcrResults(input: UpdateOcrResultsInput): Promise<number> {
    const result = await this.pool
      .request()
      .input('resultId', sql.UniqueIdentifier, input.result_id)
      .input('confidenceScore', sql.Decimal(5, 4), input.doc_intel_confidence_score)
      .input('cost', sql.Decimal(10, 6), input.doc_intel_cost_usd)
      .input('promptUsed', sql.NVarChar, input.doc_intel_prompt_used).query(`
        UPDATE vvocr.document_processing_results
        SET 
          doc_intel_confidence_score = @confidenceScore,
          doc_intel_cost_usd = @cost,
          doc_intel_prompt_used = @promptUsed,
          processing_status = 'ocr_complete',
          updated_at = GETUTCDATE()
        WHERE result_id = @resultId
      `);

    return result.rowsAffected[0] || 0;
  }

  /**
   * Store requested AI parameters (model and prompt) for a run
   *
   * @param input - Requested AI parameters
   * @returns Number of rows affected (should be 1)
   */
  async updateAiParameters(input: UpdateAiParametersInput): Promise<number> {
    const result = await this.pool
      .request()
      .input('resultId', sql.UniqueIdentifier, input.result_id)
      .input('modelRequested', sql.NVarChar(100), input.ai_model_requested)
      .input('promptRequested', sql.NVarChar, input.ai_prompt_requested).query(`
        UPDATE vvocr.document_processing_results
        SET 
          ai_model_requested = @modelRequested,
          ai_prompt_requested = @promptRequested,
          updated_at = GETUTCDATE()
        WHERE result_id = @resultId
      `);

    return result.rowsAffected[0] || 0;
  }

  /**
   * Update AI mapping results for a document
   *
   * @param input - AI mapping data
   * @returns Number of rows affected (should be 1)
   */
  async updateAiMapping(input: UpdateAiMappingInput): Promise<number> {
    const request = this.pool
      .request()
      .input('resultId', sql.UniqueIdentifier, input.result_id)
      .input('mappingResult', sql.NVarChar, input.ai_mapping_result)
      .input('modelUsed', sql.NVarChar, input.ai_model_used)
      .input('promptUsed', sql.NVarChar, input.ai_prompt_used)
      .input('modelCost', sql.Decimal(10, 6), input.ai_model_cost_usd)
      .input('confidenceScore', sql.Decimal(5, 2), input.ai_confidence_score)
      .input('completenessScore', sql.Decimal(5, 2), input.ai_completeness_score)
      .input('promptTokens', sql.Int, input.ai_prompt_tokens)
      .input('completionTokens', sql.Int, input.ai_completion_tokens);

    const query = `
        UPDATE vvocr.document_processing_results
        SET 
          ai_mapping_result = @mappingResult,
          ai_model_used = @modelUsed,
          ai_prompt_used = @promptUsed,
          ai_model_cost_usd = @modelCost,
          ai_confidence_score = @confidenceScore,
          ai_completeness_score = @completenessScore,
          ai_prompt_tokens = @promptTokens,
          ai_completion_tokens = @completionTokens,
          processing_status = 'completed',
          processing_completed_at = GETUTCDATE(),
          updated_at = GETUTCDATE()
        WHERE result_id = @resultId
      `;

    const result = await request.query(query);
    return result.rowsAffected[0] || 0;
  }

  /**   * Update grading results for a document
   *
   * @param input - Grading data
   * @returns Number of rows affected (should be 1)
   */
  async updateGradingResults(input: UpdateGradingResultsInput): Promise<number> {
    const request = this.pool
      .request()
      .input('resultId', sql.UniqueIdentifier, input.result_id)
      .input('gradingResults', sql.NVarChar, input.grading_results)
      .input('gradingAnalysis', sql.NVarChar, input.grading_analysis)
      .input('gradedAt', sql.DateTime2, input.graded_at);

    const query = `
        UPDATE vvocr.document_processing_results
        SET 
          grading_results = @gradingResults,
          grading_analysis = @gradingAnalysis,
          graded_at = @gradedAt,
          updated_at = GETUTCDATE()
        WHERE result_id = @resultId
      `;

    const result = await request.query(query);
    return result.rowsAffected[0] || 0;
  }

  /**   * Update processing status
   *
   * @param resultId - Document UUID
   * @param status - New processing status
   * @param errorMessage - Optional error message (for 'failed' status)
   * @returns Number of rows affected (should be 1)
   */
  async updateStatus(
    resultId: string,
    status: ProcessingStatus,
    errorMessage?: string
  ): Promise<number> {
    const result = await this.pool
      .request()
      .input('resultId', sql.UniqueIdentifier, resultId)
      .input('status', sql.NVarChar, status)
      .input('errorMessage', sql.NVarChar, errorMessage || null).query(`
        UPDATE vvocr.document_processing_results
        SET 
          processing_status = @status,
          error_message = @errorMessage,
          processing_started_at = CASE 
            WHEN processing_started_at IS NULL THEN GETUTCDATE() 
            ELSE processing_started_at 
          END,
          updated_at = GETUTCDATE()
        WHERE result_id = @resultId
      `);

    return result.rowsAffected[0] || 0;
  }

  /**
   * Update export status to 'confirmed'
   *
   * @param resultId - Document UUID
   * @param exportStatus - New export status
   * @returns Number of rows affected (should be 1)
   */
  async updateExportStatus(resultId: string, exportStatus: ExportStatus): Promise<number> {
    const result = await this.pool
      .request()
      .input('resultId', sql.UniqueIdentifier, resultId)
      .input('exportStatus', sql.NVarChar, exportStatus).query(`
        UPDATE vvocr.document_processing_results
        SET 
          export_status = @exportStatus,
          exported_at = GETUTCDATE(),
          updated_at = GETUTCDATE()
        WHERE result_id = @resultId
      `);

    return result.rowsAffected[0] || 0;
  }

  /**
   * Delete a document by result_id
   *
   * @param resultId - Document UUID
   * @returns Number of rows deleted (should be 1)
   */
  async deleteById(resultId: string): Promise<number> {
    const result = await this.pool.request().input('resultId', sql.UniqueIdentifier, resultId)
      .query(`
        DELETE FROM vvocr.document_processing_results
        WHERE result_id = @resultId
      `);

    return result.rowsAffected[0] || 0;
  }

  /**
   * Delete all documents for a vendor (cascade delete for vendor removal)
   *
   * @param vendorName - Vendor name (normalized)
   * @returns Number of rows deleted
   */
  async deleteByVendor(vendorName: string): Promise<number> {
    const result = await this.pool.request().input('vendorName', sql.NVarChar, vendorName).query(`
        DELETE FROM vvocr.document_processing_results
        WHERE vendor_name = @vendorName
      `);

    return result.rowsAffected[0] || 0;
  }

  /**
   * Delete all documents with a specific document_path (original + all reprocessed versions)
   *
   * @param documentPath - Blob storage path
   * @returns Number of rows deleted
   */
  async deleteByDocumentPath(documentPath: string): Promise<number> {
    const result = await this.pool.request().input('documentPath', sql.NVarChar, documentPath)
      .query(`
        DELETE FROM vvocr.document_processing_results
        WHERE document_path = @documentPath
      `);

    return result.rowsAffected[0] || 0;
  }

  /**
   * Get all vendor products for a vendor
   *
   * Used for testing and confirmation workflows to verify exported products.
   *
   * @param vendorName - Vendor name to query
   * @returns Array of vendor product records
   */
  async getVendorProducts(vendorName: string): Promise<string[]> {
    const result = await this.pool.request().input('vendorName', sql.NVarChar, vendorName).query(`
        SELECT * FROM vvocr.vendor_products
        WHERE vendor_name = @vendorName
      `);

    return result.recordset;
  }

  /**
   * Delete all vendor products for a specific vendor
   * Used before deleting runs to handle foreign key constraints
   *
   * @param vendorName - Vendor name to delete products for
   * @returns Number of products deleted
   */
  async deleteVendorProducts(vendorName: string): Promise<number> {
    const result = await this.pool.request().input('vendorName', sql.NVarChar, vendorName).query(`
        DELETE FROM vvocr.vendor_products
        WHERE vendor_name = @vendorName
      `);

    return result.rowsAffected[0] || 0;
  }

  /**
   * Delete all documents from the table
   *
   * ⚠️ WARNING: This deletes ALL records. Only use for test cleanup!
   *
   * @returns Number of rows deleted
   */
  async deleteAll(): Promise<number> {
    const result = await this.pool.request().query(`
        DELETE FROM vvocr.document_processing_results
      `);

    return result.rowsAffected[0] || 0;
  }
}

/**
 * Factory function for DocumentRepository
 * Creates a repository instance with database connection pool
 * To be used in testing only!!!
 */
export async function createDocumentRepository(): Promise<DocumentRepository> {
  const { getConnectionPool } = await import('../../utils/database.js');
  const pool = await getConnectionPool();
  return new DocumentRepository(pool);
}
