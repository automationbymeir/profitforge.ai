/**
 * Version Models
 * 
 * Types for document version management and history tracking.
 */

/**
 * Version information for a document
 */
export interface Version {
  /** Result ID */
  resultId: string;
  
  /** Version number */
  version: number;
  
  /** Processing status */
  status: string;
  
  /** Export status */
  exportStatus: string;
  
  /** Number of products */
  productCount: number | null;
  
  /** Created timestamp */
  createdAt: Date;
}

/**
 * Version history response
 */
export interface VersionHistory {
  /** Parent document ID */
  parentDocumentId: string;
  
  /** Document name */
  documentName: string;
  
  /** Vendor name */
  vendorName: string;
  
  /** List of versions */
  versions: Version[];
  
  /** Total version count */
  totalVersions: number;
}

/**
 * Delete run result
 */
export interface DeleteRunResult {
  /** Document ID that was deleted */
  documentId: string;
  
  /** Version number that was deleted */
  version: number;
}
