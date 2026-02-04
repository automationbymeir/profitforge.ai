/**
 * Application Constants
 * Centralized configuration and magic values
 */

// File Upload Configuration
export const ALLOWED_FILE_TYPES = ['application/pdf'] as const;
export type AllowedFileType = (typeof ALLOWED_FILE_TYPES)[number];

// Container Names
export const STORAGE_CONTAINER_DOCUMENTS = 'uploads';

// Database Schema
export const DB_SCHEMA = 'vvocr';
export const DB_TABLE_RESULTS = 'document_processing_results';

// Processing Status Values
export const PROCESSING_STATUS = {
  PENDING: 'pending',
  OCR_COMPLETE: 'ocr_complete',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type ProcessingStatus = (typeof PROCESSING_STATUS)[keyof typeof PROCESSING_STATUS];

// Export Status Values
export const EXPORT_STATUS = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type ExportStatus = (typeof EXPORT_STATUS)[keyof typeof EXPORT_STATUS];

// AI Model Configuration
export const AI_MODELS = {
  GPT_4O: 'gpt-4o',
  PREBUILT_LAYOUT: 'prebuilt-layout',
} as const;

// Cost Calculation (per 1000 units)
export const COST_PER_1000 = {
  DOC_INTEL_PAGE: 1.5,
  GPT_4O_INPUT_TOKEN: 2.5,
  GPT_4O_OUTPUT_TOKEN: 10.0,
} as const;

// Queue Names
export const QUEUE_AI_MAPPING = 'ai-mapping-queue';

// Rate Limiting Defaults
export const DEFAULT_RATE_LIMITS = {
  MAX_DAILY_UPLOADS: 0, // 0 = unlimited (client mode)
  MAX_UPLOADS_PER_IP_PER_HOUR: 0, // 0 = unlimited (client mode)
  MAX_FILE_SIZE_MB: 0, // 0 = unlimited (client mode)
} as const;

// Retry Configuration
export const RETRY_CONFIG = {
  MAX_RETRIES: 3,
  BASE_DELAY_MS: 1000,
  MAX_DELAY_MS: 5000,
} as const;

// Usage Tracking
export const USAGE_TABLE_NAME = 'DemoUsageTracking';
export const USAGE_PARTITION_KEYS = {
  DAILY: 'daily',
  IP_RATE: 'ip-rate',
} as const;

// Cleanup Configuration
export const DEFAULT_RETENTION_DAYS = 30;
