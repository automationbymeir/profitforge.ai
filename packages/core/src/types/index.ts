// Vendor Types
export interface Vendor {
  vendorId: string;
  vendorName: string;
  vendorCode?: string;
  contactEmail?: string;
  contactPhone?: string;
  resellerId?: string;
  freightTerms?: string;
  minOrderThreshold?: number;
  freeFreightThreshold?: number;
  defaultMOQ?: number;
  defaultLeadTimeDays?: number;
  mappingTemplateJSON?: string;
  createdAt: Date;
  updatedAt?: Date;
  status: "Active" | "Inactive";
}

// Product Types
export interface Product {
  productId: string;
  vendorId: string;
  sku: string;
  description: string;
  cost: number;
  map?: number;
  msrp?: number;
  category?: string;
  subCategory?: string;
  moq?: number;
  leadTimeDays?: number;
  freightTerms?: string;
  upc?: string;
  weight?: number;
  packSize?: string;
  additionalAttributes?: Record<string, unknown>;
  createdAt: Date;
  updatedAt?: Date;
  isActive: boolean;
}

export interface ProductStaging {
  stagingId: string;
  vendorId: string;
  batchId: string;
  sku: string;
  description: string;
  cost: number;
  map?: number;
  msrp?: number;
  category?: string;
  subCategory?: string;
  moq?: number;
  leadTimeDays?: number;
  freightTerms?: string;
  upc?: string;
  weight?: number;
  packSize?: string;
  additionalAttributes?: Record<string, unknown>;
  confidenceScore: number;
  sourceFileName: string;
  rawJSONPath?: string;
  mappedJSONPath?: string;
  processedAt: Date;
  reviewedBy?: string;
  reviewedAt?: Date;
  status: "Pending" | "Approved" | "Rejected";
}

// Batch Types
export interface UploadBatch {
  batchId: string;
  vendorId: string;
  fileName: string;
  fileType: "PDF" | "CSV" | "XLSX" | "XLS";
  fileSizeBytes: number;
  uploadMethod: "Template" | "AIProcessed";
  rawFilePath?: string;
  totalRecords: number;
  processedRecords: number;
  approvedRecords: number;
  rejectedRecords: number;
  averageConfidence?: number;
  uploadedBy: string;
  uploadedAt: Date;
  processingStartedAt?: Date;
  processingCompletedAt?: Date;
  status: "Uploaded" | "Processing" | "Completed" | "Failed";
}

// Mapping Types
export interface FieldMapping {
  sourceColumns: string[];
  transform?: "decimal" | "integer" | "uppercase" | "digits_only" | null;
  confidence: number;
}

export interface MappingTemplate {
  vendorId: string;
  vendorName: string;
  version: number;
  createdAt: string;
  createdBy: string;
  lastUsed?: string;
  useCount: number;
  fieldMappings: Record<string, FieldMapping>;
  defaultValues?: Record<string, unknown>;
  notes?: string;
}

// API Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface DocumentExtraction {
  tables: TableData[];
  keyValuePairs: KeyValuePair[];
  paragraphs: string[];
}

export interface TableData {
  rowCount: number;
  columnCount: number;
  cells: TableCell[];
}

export interface TableCell {
  row: number;
  column: number;
  content: string;
  isHeader: boolean;
}

export interface KeyValuePair {
  key: string;
  value: string;
}

// Confidence Thresholds
export const CONFIDENCE_THRESHOLDS = {
  autoApprove: 0.95,
  standardReview: 0.85,
  detailedReview: 0.70,
  reject: 0.50,
} as const;

export type ReviewLevel = "auto_approve" | "standard_review" | "detailed_review" | "reject";
