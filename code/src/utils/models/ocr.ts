/**
 * OCR Models
 *
 * Types for Azure Document Intelligence OCR processing.
 */

/**
 * Table cell data from OCR
 */
export interface TableCell {
  /** Cell content */
  content: string;

  /** Row index */
  rowIndex: number;

  /** Column index */
  columnIndex: number;

  /** Row span */
  rowSpan?: number;

  /** Column span */
  columnSpan?: number;
}

/**
 * Table data from OCR
 */
export interface Table {
  /** Table rows */
  rows: string[][];

  /** Number of rows */
  rowCount: number;

  /** Number of columns */
  columnCount: number;

  /** Table cells (detailed) */
  cells: TableCell[];
}

/**
 * OCR processing result
 */
export interface OCRResult {
  /** Document ID */
  documentId: string;

  /** Result ID */
  resultId: string;

  /** Processing status */
  status: string;

  /** Number of pages */
  pageCount: number;

  /** Number of tables detected */
  tableCount: number;

  /** Tables extracted */
  tables: Table[];

  /** OCR confidence score */
  confidenceScore: number;

  /** Cost in USD */
  costUsd: number;

  /** Processing duration in ms */
  processingDuration: number;
}
