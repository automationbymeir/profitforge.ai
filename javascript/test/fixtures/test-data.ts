/**
 * Shared Test Data Fixtures
 *
 * Centralized test data constants to reduce duplication across test files.
 * Use these fixtures instead of hardcoding test data in individual tests.
 */

/**
 * Vendor Test Data
 */
export const TEST_VENDORS = {
  HATTERAS: 'HATTERAS® HAMMOCKS',
  BLENKO: 'BLENKO',
  FRIELING: 'FRIELING',
  GCD: 'GCD',
  JOKARI: 'JOKARI',
  BETTER_LIVING: 'BETTER LIVING',
} as const;

/**
 * Sample Document Names
 */
export const TEST_DOCUMENTS = {
  SAMPLE_PDF: 'samplePDF.pdf',
  SAMPLE_XLSX: 'sampleXLSX.xlsx',
  HATTERAS_PDF: 'HATTERAS_2026_PRICE_LIST.pdf',
} as const;

/**
 * Sample Product Data (from HATTERAS vendor)
 */
export const SAMPLE_PRODUCTS = {
  QUILTED_HAMMOCK: {
    name: 'Large Quilted Hammock - Cabana Black',
    sku: 'SQ-OB3',
    price: 399.99,
    unit: '82" x 55"',
  },
  TUFTED_HAMMOCK: {
    name: 'Large Tufted Hammock - Beaming Lagoon',
    sku: 'TBML',
    price: 449.99,
    unit: '78" x 55"',
  },
  ROPE_HAMMOCK: {
    name: 'Single Navy Oatmeal Heirloom Tweed DuraCord',
    sku: 'DC-11NVOT',
    price: 259.99,
    unit: '76"x45"',
  },
  HAMMOCK_PILLOW: {
    name: 'Long Hammock Pillow - Cabana Black',
    sku: 'B-CB-LONG',
    price: 84.99,
    unit: '18" x 52"',
  },
  HAMMOCK_STAND: {
    name: 'Deluxe Roman Arc® - Cypress Hammock Stand',
    sku: 'SAR',
    price: 1299.99,
    unit: '186" x 48" x 48"',
  },
} as const;

/**
 * Test File Metadata
 */
export const TEST_FILE_METADATA = {
  EMPTY_PDF: {
    name: 'empty.pdf',
    type: 'application/pdf',
    size: 0,
  },
  VALID_PDF: {
    name: 'test.pdf',
    type: 'application/pdf',
    size: 1024,
  },
  INVALID_TEXT: {
    name: 'test.txt',
    type: 'text/plain',
    size: 512,
  },
  VALID_XLSX: {
    name: 'test.xlsx',
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: 2048,
  },
} as const;

/**
 * Processing Status Constants
 */
export const PROCESSING_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  READY_FOR_MAPPING: 'ready_for_mapping',
  MAPPING_IN_PROGRESS: 'mapping_in_progress',
  MAPPING_COMPLETED: 'mapping_completed',
  MAPPING_FAILED: 'mapping_failed',
} as const;

/**
 * Export Status Constants
 */
export const EXPORT_STATUS = {
  PENDING: 'pending',
  READY: 'ready',
  EXPORTED: 'exported',
  FAILED: 'failed',
} as const;

/**
 * Test API Keys (for testing purposes only)
 */
export const TEST_API_KEYS = {
  VALID: 'test-api-key-12345',
  INVALID: 'invalid-key',
  EXPIRED: 'expired-key',
} as const;

/**
 * Test Error Messages
 */
export const TEST_ERROR_MESSAGES = {
  EMPTY_FILE: 'File cannot be empty',
  UNSUPPORTED_FILE_TYPE: 'Unsupported file type',
  MISSING_VENDOR: 'Vendor name is required',
  VENDOR_NOT_FOUND: 'Vendor not found',
  DOCUMENT_NOT_FOUND: 'Document not found',
  INVALID_API_KEY: 'Invalid API key',
  RATE_LIMIT_EXCEEDED: 'Rate limit exceeded',
} as const;

/**
 * Test Database Configuration
 */
export const TEST_DB_CONFIG = {
  CLEANUP_RETENTION_DAYS: 30,
  MAX_RESULTS_PER_PAGE: 100,
  DEFAULT_LIMIT: 10,
} as const;

/**
 * AI Model Configuration (Test Values)
 */
export const TEST_AI_CONFIG = {
  MODEL: 'gpt-4o',
  MAX_TOKENS: 4096,
  TEMPERATURE: 0.1,
  EXPECTED_PRODUCT_COUNT_MIN: 1,
  EXPECTED_PRODUCT_COUNT_MAX: 1000,
} as const;

/**
 * Document Intelligence Configuration (Test Values)
 */
export const TEST_DOC_INTEL_CONFIG = {
  MAX_FILE_SIZE_MB: 20,
  SUPPORTED_FORMATS: ['pdf', 'xlsx', 'xls', 'csv'],
  MIN_CONFIDENCE_SCORE: 0.7,
} as const;

/**
 * Vendor Name Generator Prefixes
 */
export const TEST_VENDOR_PREFIXES = {
  INTEGRATION: 'INTEGRATION',
  E2E: 'E2E',
  UNIT: 'UNIT',
  PERFORMANCE: 'PERF',
} as const;

/**
 * Sample Quality Metrics
 */
export const SAMPLE_QUALITY_METRICS = {
  HIGH_QUALITY: {
    completenessScore: 100,
    confidenceScore: 100,
    productsWithSKU: 140,
    productsWithPrice: 140,
    productsWithValidPrice: 140,
    productsWithName: 140,
    productsWithUnit: 137,
    productsWithDescription: 0,
    emptyFields: 0,
  },
  MEDIUM_QUALITY: {
    completenessScore: 85,
    confidenceScore: 90,
    productsWithSKU: 100,
    productsWithPrice: 100,
    productsWithValidPrice: 95,
    productsWithName: 100,
    productsWithUnit: 80,
    productsWithDescription: 0,
    emptyFields: 5,
  },
  LOW_QUALITY: {
    completenessScore: 60,
    confidenceScore: 70,
    productsWithSKU: 50,
    productsWithPrice: 50,
    productsWithValidPrice: 45,
    productsWithName: 50,
    productsWithUnit: 30,
    productsWithDescription: 0,
    emptyFields: 20,
  },
} as const;

/**
 * Sample Column Mappings
 */
export const SAMPLE_COLUMN_MAPPINGS = {
  STANDARD: {
    sku: 1,
    name: 0,
    price: 3,
    unit: 2,
    description: null,
  },
  NO_UNIT: {
    sku: 1,
    name: 0,
    price: 2,
    unit: null,
    description: null,
  },
  WITH_DESCRIPTION: {
    sku: 1,
    name: 0,
    price: 3,
    unit: 2,
    description: 4,
  },
} as const;

/**
 * Test Timeout Values (in milliseconds)
 */
export const TEST_TIMEOUTS = {
  UNIT: 5000,
  INTEGRATION: 30000,
  E2E: 300000,
  BLOB_PROCESSING: 60000,
  AI_MAPPING: 120000,
} as const;

/**
 * Storage Container Names
 */
export const STORAGE_CONTAINERS = {
  BRONZE: 'bronze',
  SILVER: 'silver',
  GOLD: 'gold',
} as const;

/**
 * Helper function to generate unique document name
 */
export function generateTestDocumentName(prefix: string, suffix?: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  return suffix ? `${prefix}_${timestamp}_${suffix}.pdf` : `${prefix}_${timestamp}.pdf`;
}

/**
 * Helper function to create test FormData
 */
export function createTestFormData(
  fileContent: Buffer,
  fileName: string,
  fileType: string,
  vendorName: string
): FormData {
  const formData = new FormData();
  formData.append('file', new Blob([Uint8Array.from(fileContent)], { type: fileType }), fileName);
  formData.append('vendorName', vendorName);
  return formData;
}

/**
 * Sample AI Mapping Result (from processed_e2e.json)
 */
export const SAMPLE_AI_MAPPING = {
  documentId: '79095209-73CE-43D6-A351-7476E02D2CB2',
  timestamp: '2026-01-26T13:47:42.850Z',
  vendor: 'HATTERAS® HAMMOCKS',
  productCount: 140,
  columnMapping: SAMPLE_COLUMN_MAPPINGS.STANDARD,
  qualityMetrics: SAMPLE_QUALITY_METRICS.HIGH_QUALITY,
  usage: {
    promptTokens: 1889,
    completionTokens: 60,
    totalTokens: 1949,
    cost: 0.0053225,
  },
} as const;
