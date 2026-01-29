import sql from 'mssql';
import { withDatabase } from '../utils/database.js';
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

  constructor(documentsContainer: string = 'uploads') {
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
    const existingDoc = await withDatabase(async (pool) => {
      const result = await pool.request().input('vendorName', sql.NVarChar, vendorName).query(`
          SELECT result_id, document_name, processing_status
          FROM vvocr.document_processing_results
          WHERE vendor_name = @vendorName
        `);
      return result.recordset[0];
    });

    if (existingDoc) {
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
    const resultId = await withDatabase(async (pool) => {
      const result = await pool
        .request()
        .input('vendorName', sql.NVarChar, vendorName)
        .input('documentName', sql.NVarChar, standardFileName)
        .input('documentPath', sql.NVarChar, filePath)
        .input('fileSize', sql.BigInt, fileBuffer.length)
        .input('fileType', sql.NVarChar, file.type).query(`
          INSERT INTO vvocr.document_processing_results 
          (document_name, document_path, document_size_bytes, document_type, processing_status, vendor_name)
          OUTPUT INSERTED.result_id
          VALUES (@documentName, @documentPath, @fileSize, @fileType, 'pending', @vendorName)
        `);
      return result.recordset[0].result_id;
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
    return withDatabase(async (pool) => {
      // Get document info
      const docResult = await pool.request().input('documentId', sql.UniqueIdentifier, documentId)
        .query(`
          SELECT document_path 
          FROM vvocr.document_processing_results 
          WHERE result_id = @documentId
        `);

      if (docResult.recordset.length === 0) {
        const error = new Error('Document not found') as Error & { statusCode: number };
        error.statusCode = 404;
        throw error;
      }

      const document = docResult.recordset[0];

      // Delete blob
      let blobsDeleted = 0;
      try {
        await this.storageService.deleteBlob(this.documentsContainer, document.document_path);
        blobsDeleted = 1;
      } catch (error) {
        console.warn(`Failed to delete blob ${document.document_path}:`, error);
      }

      // Delete database record
      const deleteResult = await pool
        .request()
        .input('documentId', sql.UniqueIdentifier, documentId).query(`
          DELETE FROM vvocr.document_processing_results 
          WHERE result_id = @documentId
        `);

      return {
        documentsDeleted: deleteResult.rowsAffected[0] || 0,
        blobsDeleted,
      };
    });
  }

  /**
   * Reprocess a document (create new version for AI remapping)
   */
  async reprocess(documentId: string): Promise<ReprocessResult> {
    return withDatabase(async (pool) => {
      // Get existing record
      const existingResult = await pool
        .request()
        .input('documentId', sql.UniqueIdentifier, documentId).query(`
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
          WHERE result_id = @documentId
        `);

      if (existingResult.recordset.length === 0) {
        const error = new Error('Document not found') as Error & { statusCode: number };
        error.statusCode = 404;
        throw error;
      }

      const existing = existingResult.recordset[0];

      // Find root parent
      const rootParentId = existing.parent_document_id || documentId;
      const newVersion = (existing.reprocessing_count || 0) + 1;

      // Create new immutable record
      const newRecordResult = await pool
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

      const newDocumentId = newRecordResult.recordset[0].result_id;

      return {
        originalDocumentId: documentId,
        newResultId: newDocumentId,
        version: newVersion,
        parentDocumentId: rootParentId,
      };
    });
  }

  /**
   * Confirm mapping and export products to production
   */
  async confirmMapping(documentId: string): Promise<ConfirmResult> {
    return withDatabase(async (pool) => {
      // Retrieve document and mapping result
      const docResult = await pool.request().input('documentId', sql.UniqueIdentifier, documentId)
        .query(`
          SELECT 
            result_id,
            document_name,
            vendor_name,
            ai_mapping_result,
            processing_status,
            export_status
          FROM vvocr.document_processing_results 
          WHERE result_id = @documentId
        `);

      if (docResult.recordset.length === 0) {
        const error = new Error('Document not found') as Error & { statusCode: number };
        error.statusCode = 404;
        throw error;
      }

      const document = docResult.recordset[0];

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

      // Insert products into production table
      let insertedCount = 0;
      for (const product of products) {
        await pool
          .request()
          .input('vendorId', sql.NVarChar, document.vendor_name)
          .input('vendorName', sql.NVarChar, document.vendor_name)
          .input('productName', sql.NVarChar, product.name)
          .input('sku', sql.NVarChar, product.sku)
          .input('price', sql.Decimal(18, 4), product.price)
          .input('unit', sql.NVarChar, product.unit || null)
          .input('description', sql.NVarChar, product.description || null)
          .input('sourceDocId', sql.UniqueIdentifier, documentId)
          .input('sourceDocName', sql.NVarChar, document.document_name).query(`
            INSERT INTO vvocr.vendor_products 
            (vendor_id, vendor_name, product_name, sku, price, unit, description, source_document_id, source_document_name)
            VALUES 
            (@vendorId, @vendorName, @productName, @sku, @price, @unit, @description, @sourceDocId, @sourceDocName)
          `);
        insertedCount++;
      }

      // Update export status
      await pool.request().input('documentId', sql.UniqueIdentifier, documentId).query(`
          UPDATE vvocr.document_processing_results 
          SET 
              export_status = 'confirmed',
              exported_at = GETUTCDATE(),
              updated_at = GETUTCDATE()
          WHERE result_id = @documentId
        `);

      return {
        documentId,
        vendor: document.vendor_name,
        productsExported: insertedCount,
      };
    });
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
    return withDatabase(async (pool) => {
      let query =
        'SELECT result_id, document_name, document_path, vendor_name, processing_status, export_status FROM vvocr.document_processing_results WHERE 1=1';
      const request = pool.request();

      if (filters?.vendorName) {
        query += ' AND vendor_name = @vendorName';
        request.input('vendorName', sql.NVarChar, filters.vendorName);
      }

      if (filters?.status) {
        query += ' AND processing_status = @status';
        request.input('status', sql.NVarChar, filters.status);
      }

      query += ' ORDER BY created_at DESC';

      if (filters?.limit) {
        query += ` OFFSET ${filters.offset || 0} ROWS FETCH NEXT ${filters.limit} ROWS ONLY`;
      }

      const result = await request.query(query);

      return result.recordset.map((row) => ({
        resultId: row.result_id,
        documentName: row.document_name,
        documentPath: row.document_path,
        vendor_name: row.vendor_name,
        processingStatus: row.processing_status,
        exportStatus: row.export_status,
      }));
    });
  }
}

// Singleton instance
let documentServiceInstance: DocumentService | null = null;

/**
 * Get or create singleton DocumentService instance
 */
export function getDocumentService(): DocumentService {
  if (!documentServiceInstance) {
    const containerName = process.env.STORAGE_CONTAINER_DOCUMENTS || 'uploads';
    documentServiceInstance = new DocumentService(containerName);
  }
  return documentServiceInstance;
}
