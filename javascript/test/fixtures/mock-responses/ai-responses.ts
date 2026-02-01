/**
 * Mock AI Mapping Responses
 *
 * Canned AI service responses for testing without calling real AI APIs.
 * Based on real processed data from test/tools/processed_e2e.json
 */

export const MOCK_AI_RESPONSES = {
  /**
   * High-quality AI mapping response (HATTERAS vendor)
   */
  HATTERAS_MAPPING: {
    documentId: '79095209-73CE-43D6-A351-7476E02D2CB2',
    timestamp: '2026-01-26T13:47:42.850Z',
    vendor: 'HATTERAS® HAMMOCKS',
    products: [
      {
        name: 'Large Quilted Hammock - Cabana Black',
        sku: 'SQ-OB3',
        price: 399.99,
        unit: '82" x 55"',
      },
      {
        name: 'Large Quilted Hammock - Cast Ash',
        sku: 'SQ-CASH',
        price: 319.99,
        unit: '82" x 55"',
      },
      {
        name: 'Large Tufted Hammock - Beaming Lagoon',
        sku: 'TBML',
        price: 449.99,
        unit: '78" x 55"',
      },
      {
        name: 'Single Navy Oatmeal Heirloom Tweed DuraCord',
        sku: 'DC-11NVOT',
        price: 259.99,
        unit: '76"x45"',
      },
      {
        name: 'Deluxe Roman Arc® - Cypress Hammock Stand',
        sku: 'SAR',
        price: 1299.99,
        unit: '186" x 48" x 48"',
      },
    ],
    productCount: 5,
    columnMapping: {
      sku: 1,
      name: 0,
      price: 3,
      unit: 2,
      description: null,
    },
    qualityMetrics: {
      completenessScore: 100,
      confidenceScore: 100,
      productsWithSKU: 5,
      productsWithPrice: 5,
      productsWithValidPrice: 5,
      productsWithName: 5,
      productsWithUnit: 5,
      productsWithDescription: 0,
      emptyFields: 0,
    },
    usage: {
      promptTokens: 1889,
      completionTokens: 60,
      totalTokens: 1949,
      cost: 0.0053225,
    },
  },

  /**
   * Medium-quality AI mapping response (some missing units)
   */
  MEDIUM_QUALITY_MAPPING: {
    documentId: 'test-medium-quality-001',
    timestamp: new Date().toISOString(),
    vendor: 'TEST_VENDOR_MEDIUM',
    products: [
      {
        name: 'Product A',
        sku: 'SKU-001',
        price: 29.99,
        unit: '12 oz',
      },
      {
        name: 'Product B',
        sku: 'SKU-002',
        price: 39.99,
        unit: null,
      },
      {
        name: 'Product C',
        sku: 'SKU-003',
        price: 49.99,
        unit: '16 oz',
      },
    ],
    productCount: 3,
    columnMapping: {
      sku: 1,
      name: 0,
      price: 2,
      unit: 3,
      description: null,
    },
    qualityMetrics: {
      completenessScore: 85,
      confidenceScore: 90,
      productsWithSKU: 3,
      productsWithPrice: 3,
      productsWithValidPrice: 3,
      productsWithName: 3,
      productsWithUnit: 2,
      productsWithDescription: 0,
      emptyFields: 1,
    },
    usage: {
      promptTokens: 500,
      completionTokens: 30,
      totalTokens: 530,
      cost: 0.00265,
    },
  },

  /**
   * Low-quality AI mapping response (many missing fields)
   */
  LOW_QUALITY_MAPPING: {
    documentId: 'test-low-quality-001',
    timestamp: new Date().toISOString(),
    vendor: 'TEST_VENDOR_LOW',
    products: [
      {
        name: 'Product X',
        sku: null,
        price: 19.99,
        unit: null,
      },
      {
        name: 'Product Y',
        sku: 'SKU-Y',
        price: null,
        unit: null,
      },
    ],
    productCount: 2,
    columnMapping: {
      sku: 1,
      name: 0,
      price: 2,
      unit: null,
      description: null,
    },
    qualityMetrics: {
      completenessScore: 60,
      confidenceScore: 70,
      productsWithSKU: 1,
      productsWithPrice: 1,
      productsWithValidPrice: 1,
      productsWithName: 2,
      productsWithUnit: 0,
      productsWithDescription: 0,
      emptyFields: 4,
    },
    usage: {
      promptTokens: 300,
      completionTokens: 20,
      totalTokens: 320,
      cost: 0.0016,
    },
  },

  /**
   * AI mapping error response
   */
  ERROR_RESPONSE: {
    error: 'AI service error',
    message: 'Failed to process document',
    timestamp: new Date().toISOString(),
  },

  /**
   * AI mapping timeout response
   */
  TIMEOUT_RESPONSE: {
    error: 'Timeout',
    message: 'AI service request timed out after 120 seconds',
    timestamp: new Date().toISOString(),
  },

  /**
   * Invalid JSON response
   */
  INVALID_JSON_RESPONSE: {
    error: 'Invalid JSON',
    message: 'AI service returned malformed JSON',
    timestamp: new Date().toISOString(),
  },
};

/**
 * Document Intelligence Mock Responses
 */
export const MOCK_DOC_INTEL_RESPONSES = {
  /**
   * Successful OCR response
   */
  SUCCESS_OCR: {
    extractedText: 'Sample extracted text from document',
    structuredData: {
      tables: [
        {
          rowCount: 3,
          columnCount: 4,
          cells: [
            { content: 'Product', rowIndex: 0, columnIndex: 0 },
            { content: 'SKU', rowIndex: 0, columnIndex: 1 },
            { content: 'Price', rowIndex: 0, columnIndex: 2 },
            { content: 'Unit', rowIndex: 0, columnIndex: 3 },
          ],
        },
      ],
    },
    confidenceScore: 0.95,
    pageCount: 1,
    tableCount: 1,
  },

  /**
   * OCR with low confidence
   */
  LOW_CONFIDENCE_OCR: {
    extractedText: 'Partially readable text...',
    structuredData: {
      tables: [],
    },
    confidenceScore: 0.5,
    pageCount: 1,
    tableCount: 0,
  },

  /**
   * OCR error response
   */
  ERROR_OCR: {
    error: 'Document Intelligence error',
    message: 'Failed to process document',
    statusCode: 500,
  },
};

/**
 * Helper function to get mock AI response by quality level
 */
export function getMockAIResponse(quality: 'high' | 'medium' | 'low' | 'error') {
  switch (quality) {
    case 'high':
      return MOCK_AI_RESPONSES.HATTERAS_MAPPING;
    case 'medium':
      return MOCK_AI_RESPONSES.MEDIUM_QUALITY_MAPPING;
    case 'low':
      return MOCK_AI_RESPONSES.LOW_QUALITY_MAPPING;
    case 'error':
      return MOCK_AI_RESPONSES.ERROR_RESPONSE;
    default:
      return MOCK_AI_RESPONSES.HATTERAS_MAPPING;
  }
}

/**
 * Helper function to get mock Document Intelligence response
 */
export function getMockDocIntelResponse(scenario: 'success' | 'low-confidence' | 'error') {
  switch (scenario) {
    case 'success':
      return MOCK_DOC_INTEL_RESPONSES.SUCCESS_OCR;
    case 'low-confidence':
      return MOCK_DOC_INTEL_RESPONSES.LOW_CONFIDENCE_OCR;
    case 'error':
      return MOCK_DOC_INTEL_RESPONSES.ERROR_OCR;
    default:
      return MOCK_DOC_INTEL_RESPONSES.SUCCESS_OCR;
  }
}
