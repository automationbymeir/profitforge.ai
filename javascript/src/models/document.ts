/**
 * Document Models
 * 
 * Core types for document processing, storage, and retrieval.
 * These models align with the vvocr.document_processing_results table schema.
 */

/**
 * Processing status of a document
 */
export type ProcessingStatus = 'pending' | 'ocr_complete' | 'completed' | 'failed';

/**
 * Export status of processed products
 */
export type ExportStatus = 'pending' | 'confirmed';

/**
 * Document processing result record
 * 
 * Represents a document in the processing pipeline, including OCR results,
 * AI mapping results, and processing metadata.
 */
export interface Document {
  /** Unique identifier for this result */
  result_id: string;
  
  /** Original filename */
  document_name: string;
  
  /** Blob storage path */
  document_path: string;
  
  /** Document MIME type */
  document_type: string;
  
  /** Vendor name (normalized) */
  vendor_name: string;
  
  /** Current processing status */
  processing_status: ProcessingStatus;
  
  /** Export/confirmation status */
  export_status: ExportStatus;
  
  /** Version number (0 for original, increments for reprocessing) */
  reprocessing_count: number;
  
  /** Parent document ID for reprocessed versions */
  parent_document_id: string | null;
  
  /** Azure Document Intelligence metrics */
  doc_intel_page_count: number | null;
  doc_intel_table_count: number | null;
  doc_intel_cost_usd: number | null;
  doc_intel_confidence_score: number | null;
  
  /** AI mapping results (JSON stringified) */
  ai_mapping_result: string | null;
  
  /** AI model used for mapping */
  ai_model_used: string | null;
  ai_model_cost_usd: number | null;
  ai_confidence_score: number | null;
  ai_completeness_score: number | null;
  
  /** Number of products extracted */
  product_count: number | null;
  
  /** Timestamps */
  created_at: Date;
  updated_at: Date;
}

/**
 * Upload request payload
 */
export interface UploadRequest {
  /** PDF file to process */
  file: File;
  
  /** Vendor name */
  vendorName: string;
}

/**
 * Upload response
 */
export interface UploadResult {
  /** New document result ID */
  resultId: string;
  
  /** Original filename */
  documentName: string;
  
  /** Vendor name */
  vendorName: string;
  
  /** Blob storage path */
  filePath: string;
  
  /** Initial processing status */
  status: string;
}

/**
 * Delete document result
 */
export interface DeleteDocumentResult {
  /** Number of database records deleted */
  documentsDeleted: number;
  
  /** Number of blobs deleted from storage */
  blobsDeleted: number;
}

/**
 * Reprocess mapping result
 */
export interface ReprocessResult {
  /** New version result ID */
  newResultId: string;
  
  /** Original document ID */
  originalDocumentId: string;
  
  /** Parent document ID (root of version chain) */
  parentDocumentId: string;
  
  /** Version number */
  version: number;
}

/**
 * Confirm mapping result
 */
export interface ConfirmMappingResult {
  /** Document ID */
  documentId: string;
  
  /** Vendor name */
  vendor: string;
  
  /** Number of products exported */
  productsExported: number;
}

/**
 * Document query filters
 */
export interface DocumentFilters {
  /** Filter by specific result ID */
  resultId?: string;
  
  /** Filter by vendor name */
  vendorName?: string;
  
  /** Show all versions or just latest */
  showAllVersions?: boolean;
  
  /** Limit number of results */
  limit?: number;
}
