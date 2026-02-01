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
import type { Document, ExportStatus, ProcessingStatus } from '../../models/document.js';

/**
 * Input for creating a new document record
 */
export interface CreateDocumentInput {
  document_name: string;
  document_path: string;
  document_size_bytes: number;
  document_type: string;
  vendor_name: string;
  processing_status?: ProcessingStatus;
  export_status?: ExportStatus;
  reprocessing_count?: number;
  parent_document_id?: string | null;
  product_count?: number | null;
  ai_mapping_result?: string | null;
}

/**
 * Input for updating OCR results
 */
export interface UpdateOcrResultsInput {
  result_id: string;
  doc_intel_extracted_text: string | null;
  doc_intel_structured_data: string | null;
  doc_intel_confidence_score: number | null;
  doc_intel_page_count: number | null;
  doc_intel_table_count: number | null;
  doc_intel_cost_usd: number | null;
  doc_intel_prompt_used: string | null;
}

/**
 * Input for updating AI mapping results
 */
export interface UpdateAiMappingInput {
  result_id: string;
  ai_mapping_result: string;
  ai_model_used: string;
  ai_model_cost_usd: number | null;
  ai_confidence_score: number | null;
  ai_completeness_score: number | null;
  product_count: number;
}

/**
 * Query filters for flexible document search
 */
export interface DocumentQueryFilters {
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
      .input('reprocessingCount', sql.Int, input.reprocessing_count ?? 0)
      .input('parentDocId', sql.UniqueIdentifier, input.parent_document_id || null)
      .input('productCount', sql.Int, input.product_count ?? null)
      .input('aiMappingResult', sql.NVarChar, input.ai_mapping_result ?? null).query(`
        INSERT INTO vvocr.document_processing_results 
        (document_name, document_path, document_size_bytes, document_type, processing_status, vendor_name,
         export_status, reprocessing_count, parent_document_id, product_count, ai_mapping_result)
        OUTPUT INSERTED.result_id
        VALUES (@documentName, @documentPath, @fileSize, @fileType, @status, @vendorName,
                @exportStatus, @reprocessingCount, @parentDocId, @productCount, @aiMappingResult)
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
          reprocessing_count,
          parent_document_id,
          doc_intel_extracted_text,
          doc_intel_structured_data,
          doc_intel_confidence_score,
          doc_intel_page_count,
          doc_intel_table_count,
          doc_intel_cost_usd,
          doc_intel_prompt_used,
          ai_mapping_result,
          ai_model_used,
          ai_model_cost_usd,
          ai_confidence_score,
          ai_completeness_score,
          product_count,
          exported_at,
          created_at,
          updated_at
        FROM vvocr.document_processing_results
        WHERE result_id = @resultId
      `);

    return result.recordset.length > 0 ? result.recordset[0] : null;
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
          reprocessing_count,
          parent_document_id,
          doc_intel_page_count,
          doc_intel_table_count,
          doc_intel_cost_usd,
          doc_intel_confidence_score,
          ai_mapping_result,
          ai_model_used,
          ai_model_cost_usd,
          ai_confidence_score,
          ai_completeness_score,
          product_count,
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
   * Find all documents with the same document_path (original + reprocessed versions)
   *
   * @param documentPath - Blob storage path
   * @returns Array of document records (ordered by reprocessing_count ASC)
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
          reprocessing_count,
          parent_document_id,
          doc_intel_page_count,
          doc_intel_table_count,
          doc_intel_cost_usd,
          doc_intel_confidence_score,
          ai_mapping_result,
          ai_model_used,
          ai_model_cost_usd,
          ai_confidence_score,
          ai_completeness_score,
          product_count,
          exported_at,
          created_at,
          updated_at
        FROM vvocr.document_processing_results
        WHERE document_path = @documentPath
        ORDER BY reprocessing_count ASC
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
        reprocessing_count,
        parent_document_id,
        doc_intel_page_count,
        doc_intel_table_count,
        doc_intel_cost_usd,
        ai_mapping_result,
        ai_model_used,
        product_count,
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
      .input('extractedText', sql.NVarChar, input.doc_intel_extracted_text)
      .input('structuredData', sql.NVarChar, input.doc_intel_structured_data)
      .input('confidenceScore', sql.Decimal(5, 4), input.doc_intel_confidence_score)
      .input('pageCount', sql.Int, input.doc_intel_page_count)
      .input('tableCount', sql.Int, input.doc_intel_table_count)
      .input('cost', sql.Decimal(10, 6), input.doc_intel_cost_usd)
      .input('promptUsed', sql.NVarChar, input.doc_intel_prompt_used).query(`
        UPDATE vvocr.document_processing_results
        SET 
          doc_intel_extracted_text = @extractedText,
          doc_intel_structured_data = @structuredData,
          doc_intel_confidence_score = @confidenceScore,
          doc_intel_page_count = @pageCount,
          doc_intel_table_count = @tableCount,
          doc_intel_cost_usd = @cost,
          doc_intel_prompt_used = @promptUsed,
          processing_status = 'ocr_complete',
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
    const result = await this.pool
      .request()
      .input('resultId', sql.UniqueIdentifier, input.result_id)
      .input('mappingResult', sql.NVarChar, input.ai_mapping_result)
      .input('modelUsed', sql.NVarChar, input.ai_model_used)
      .input('modelCost', sql.Decimal(10, 6), input.ai_model_cost_usd)
      .input('confidenceScore', sql.Decimal(5, 4), input.ai_confidence_score)
      .input('completenessScore', sql.Decimal(5, 4), input.ai_completeness_score)
      .input('productCount', sql.Int, input.product_count).query(`
        UPDATE vvocr.document_processing_results
        SET 
          ai_mapping_result = @mappingResult,
          ai_model_used = @modelUsed,
          ai_model_cost_usd = @modelCost,
          ai_confidence_score = @confidenceScore,
          ai_completeness_score = @completenessScore,
          product_count = @productCount,
          processing_status = 'completed',
          updated_at = GETUTCDATE()
        WHERE result_id = @resultId
      `);

    return result.rowsAffected[0] || 0;
  }

  /**
   * Update processing status
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
   * Create a new reprocessing version of an existing document
   *
   * This creates a new immutable record with:
   * - Same document_path, OCR results, and vendor_name
   * - Incremented reprocessing_count
   * - Reference to parent_document_id
   * - Fresh AI mapping fields (null)
   * - Status: 'ocr_complete' (ready for AI remapping)
   *
   * @param originalId - Original document UUID to reprocess
   * @param parentId - Root parent UUID (null for original documents)
   * @returns The new document result_id (UUID)
   * @throws Error if original document not found
   */
  async createReprocessingVersion(originalId: string, parentId: string | null): Promise<string> {
    // Fetch existing record
    const existingResult = await this.pool
      .request()
      .input('originalId', sql.UniqueIdentifier, originalId).query(`
        SELECT 
          document_name,
          document_path,
          document_size_bytes,
          document_type,
          vendor_name,
          doc_intel_extracted_text,
          doc_intel_structured_data,
          doc_intel_confidence_score,
          doc_intel_page_count,
          doc_intel_table_count,
          doc_intel_cost_usd,
          doc_intel_prompt_used,
          reprocessing_count,
          parent_document_id
        FROM vvocr.document_processing_results
        WHERE result_id = @originalId
      `);

    if (existingResult.recordset.length === 0) {
      throw new Error(`Document not found: ${originalId}`);
    }

    const existing = existingResult.recordset[0];
    const rootParentId = parentId || originalId;
    const newVersion = (existing.reprocessing_count || 0) + 1;

    // Create new immutable record
    const newRecordResult = await this.pool
      .request()
      .input('documentName', sql.NVarChar, existing.document_name)
      .input('documentPath', sql.NVarChar, existing.document_path)
      .input('documentSize', sql.BigInt, existing.document_size_bytes)
      .input('documentType', sql.NVarChar, existing.document_type)
      .input('vendorName', sql.NVarChar, existing.vendor_name)
      .input('extractedText', sql.NVarChar, existing.doc_intel_extracted_text)
      .input('structuredData', sql.NVarChar, existing.doc_intel_structured_data)
      .input('confidenceScore', sql.Decimal(5, 4), existing.doc_intel_confidence_score)
      .input('pageCount', sql.Int, existing.doc_intel_page_count)
      .input('tableCount', sql.Int, existing.doc_intel_table_count)
      .input('docIntelCost', sql.Decimal(10, 6), existing.doc_intel_cost_usd)
      .input('docIntelPrompt', sql.NVarChar, existing.doc_intel_prompt_used)
      .input('parentDocumentId', sql.UniqueIdentifier, rootParentId)
      .input('reprocessingCount', sql.Int, newVersion).query(`
        INSERT INTO vvocr.document_processing_results (
          document_name,
          document_path,
          document_size_bytes,
          document_type,
          vendor_name,
          doc_intel_extracted_text,
          doc_intel_structured_data,
          doc_intel_confidence_score,
          doc_intel_page_count,
          doc_intel_table_count,
          doc_intel_cost_usd,
          doc_intel_prompt_used,
          parent_document_id,
          reprocessing_count,
          processing_status,
          export_status
        )
        OUTPUT INSERTED.result_id
        VALUES (
          @documentName,
          @documentPath,
          @documentSize,
          @documentType,
          @vendorName,
          @extractedText,
          @structuredData,
          @confidenceScore,
          @pageCount,
          @tableCount,
          @docIntelCost,
          @docIntelPrompt,
          @parentDocumentId,
          @reprocessingCount,
          'ocr_complete',
          'pending'
        )
      `);

    return newRecordResult.recordset[0].result_id;
  }
}
