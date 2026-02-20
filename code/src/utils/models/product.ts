/**
 * Product Models
 *
 * Types for product extraction, mapping, and quality assessment.
 */

/**
 * Extracted product from vendor price list
 *
 * Products have dynamic fields based on the OCR-detected columns.
 * Common fields include sku, name, price, unit, description, etc.,
 * but the actual fields depend on the document structure.
 */
export interface Product {
  /** Dynamic product fields - can be any column from the source document */
  [key: string]: string | number | undefined;
}
