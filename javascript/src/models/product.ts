/**
 * Product Models
 * 
 * Types for product extraction, mapping, and quality assessment.
 */

/**
 * Extracted product from vendor price list
 */
export interface Product {
  /** Vendor SKU/part number */
  sku: string;
  
  /** Product name/description */
  name: string;
  
  /** Unit price */
  price: number;
  
  /** Unit of measure (e.g., "EA", "BOX") */
  uom?: string;
  
  /** Pack size */
  pack?: string;
  
  /** Category */
  category?: string;
  
  /** Additional metadata */
  [key: string]: string | number | undefined;
}

/**
 * AI mapping result with extracted products
 */
export interface MappingResult {
  /** Document ID */
  documentId: string;
  
  /** Vendor name */
  vendor: string;
  
  /** Extracted products */
  products: Product[];
  
  /** Number of products extracted */
  productCount: number;
  
  /** Quality metrics */
  qualityMetrics: QualityMetrics;
  
  /** AI model used */
  modelUsed: string;
  
  /** Token usage */
  usage: TokenUsage;
  
  /** Cost in USD */
  cost: number;
  
  /** Processing duration in ms */
  processingDuration: number;
}

/**
 * Quality metrics for extracted products
 */
export interface QualityMetrics {
  /** Number of products with SKU */
  productsWithSKU: number;
  
  /** Number of products with price */
  productsWithPrice: number;
  
  /** Number of products with name */
  productsWithName: number;
  
  /** Completeness score (0-1) */
  completenessScore: number;
  
  /** Confidence score (0-1) */
  confidenceScore: number;
}

/**
 * AI token usage
 */
export interface TokenUsage {
  /** Prompt tokens */
  promptTokens: number;
  
  /** Completion tokens */
  completionTokens: number;
  
  /** Total tokens */
  totalTokens: number;
}

/**
 * Column mapping detected by AI
 */
export interface ColumnMapping {
  /** Column headers detected */
  headers: string[];
  
  /** Mapping of standard fields to column indices */
  mapping: {
    sku?: number;
    name?: number;
    price?: number;
    uom?: number;
    pack?: number;
    [key: string]: number | undefined;
  };
}
