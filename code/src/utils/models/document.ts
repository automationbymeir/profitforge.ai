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
 *
 * Database default: 'not_exported'
 * Schema values: not_exported, confirmed, exported, rejected
 */
export type ExportStatus = 'not_exported' | 'pending' | 'confirmed' | 'exported' | 'rejected';

/**
 * Document processing result record
 *
 * Represents a document in the processing pipeline, including OCR results,
 * AI mapping results, and processing metadata.
 */
export interface Document {
  /** Unique identifier for this result */
  result_id: string;
  document_size_bytes: number;

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
  exported_at: Date | null;

  processing_started_at: Date;
  doc_intel_cost_usd: number | null;
  doc_intel_confidence_score: number | null;
  doc_intel_prompt_used: string | null;

  /** User-requested AI parameters (stored at run creation) */
  ai_model_requested: string | null;
  ai_prompt_requested: string | null;

  /** AI mapping results (JSON stringified) */
  ai_mapping_result: string | null;
  ai_prompt_used: string | null;
  /** AI model used for mapping */
  ai_model_used: string | null;
  ai_model_cost_usd: number | null;
  ai_confidence_score: number | null;
  ai_completeness_score: number | null;

  /** Grading results (benchmark comparison) */
  grading_results: string | null;
  grading_analysis: string | null;
  graded_at: Date | null;

  /** Timestamps */
  created_at: Date;
  updated_at: Date;
}
