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
  GPT_4O_MINI: 'gpt-4o-mini',
  GPT_4_TURBO: 'gpt-4-turbo',
  PREBUILT_LAYOUT: 'prebuilt-layout',
} as const;

export type AIModel = (typeof AI_MODELS)[keyof typeof AI_MODELS];

// Model metadata for known models (pricing, capabilities)
export interface ModelMetadata {
  name: string;
  displayName: string;
  inputCostPer1M: number; // USD per 1M input tokens
  outputCostPer1M: number; // USD per 1M output tokens
  contextWindow: number;
  capabilities: string[];
  recommended?: boolean;
}

export const MODEL_METADATA: Record<string, ModelMetadata> = {
  'gpt-4o': {
    name: 'gpt-4o',
    displayName: 'GPT-4o (Recommended)',
    inputCostPer1M: 2.5,
    outputCostPer1M: 10.0,
    contextWindow: 128000,
    capabilities: ['structured-output', 'json-mode', 'function-calling'],
    recommended: true,
  },
  'gpt-4o-mini': {
    name: 'gpt-4o-mini',
    displayName: 'GPT-4o Mini (Cost-Effective)',
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.6,
    contextWindow: 128000,
    capabilities: ['structured-output', 'json-mode', 'function-calling'],
  },
  'gpt-4-turbo': {
    name: 'gpt-4-turbo',
    displayName: 'GPT-4 Turbo',
    inputCostPer1M: 10.0,
    outputCostPer1M: 30.0,
    contextWindow: 128000,
    capabilities: ['json-mode', 'function-calling'],
  },
  'gpt-4': {
    name: 'gpt-4',
    displayName: 'GPT-4',
    inputCostPer1M: 30.0,
    outputCostPer1M: 60.0,
    contextWindow: 8192,
    capabilities: ['function-calling'],
  },
};

// NOTE: Supported models are now dynamically fetched from Azure OpenAI deployments
// This constant is kept for backward compatibility but should be deprecated
export const SUPPORTED_AI_MODELS = [
  AI_MODELS.GPT_4O,
  AI_MODELS.GPT_4O_MINI,
  AI_MODELS.GPT_4_TURBO,
] as const;

// Default AI model for product extraction
export const DEFAULT_AI_MODEL = AI_MODELS.GPT_4O;

// Default AI prompt for product extraction
export const DEFAULT_AI_PROMPT = `You are analyzing product catalog tables. Extract products with the following MINIMAL REQUIRED SCHEMA:
- name (product name/description) - REQUIRED
- SKU (item code/product code) - REQUIRED  
- price (MSRP/cost) - REQUIRED
- unit (dimensions/size/packaging) - OPTIONAL
- description (additional details) - OPTIONAL

Here are ALL the column headers found:
{HEADERS}

These tables have a CONSISTENT structure. Identify the column pattern:
- Which column index is SKU? (look for "SKU", "Item Code", "Item #", etc.)
- Which column index is Product Name? (look for product descriptions, NOT category headers)
- Which column index is Price? (look for "MSRP", "Price", "Cost", "List Price", etc.)
- Which column index is Unit/Dimensions? (look for "Dimensions", "Size", "Unit", "Pack", etc.)
- Which column index is Description? (look for additional product details)

IMPORTANT: 
- Category headers (e.g., "QUILTED HAMMOCKS") are NOT column headers for product names
- The actual product name is in the first data column with descriptive text
- Ignore header-only rows or separator rows

Return JSON:
{
  "vendor": "detected vendor name",
  "columnMapping": {
    "sku": column_index_number or null,
    "name": column_index_number,
    "price": column_index_number or null,
    "unit": column_index_number or null,
    "description": column_index_number or null
  }
}

Context: {CONTEXT}`;

// AI prompt constraints
export const AI_PROMPT_MAX_LENGTH = 10000;

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
