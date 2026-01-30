/**
 * Vendor Models
 * 
 * Types for vendor management and validation.
 */

/**
 * Vendor name parts (parsed)
 */
export interface VendorNameParts {
  /** Main vendor name */
  name: string;
  
  /** Optional branch/location identifier */
  branch?: string;
  
  /** Optional date identifier */
  date?: string;
}

/**
 * Delete vendor result
 */
export interface DeleteVendorResult {
  /** Vendor name that was deleted */
  vendorName: string;
  
  /** Number of documents deleted */
  documentsDeleted: number;
  
  /** Number of blobs deleted */
  blobsDeleted: number;
}
