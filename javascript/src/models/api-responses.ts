/**
 * API Response Models
 * 
 * Standard response formats for HTTP endpoints.
 */

/**
 * Generic API success response
 */
export interface ApiResponse<T = unknown> {
  /** Success message */
  message?: string;
  
  /** Response data */
  data?: T;
  
  /** Additional metadata */
  [key: string]: unknown;
}

/**
 * API error response
 */
export interface ErrorResponse {
  /** Error type/code */
  error: string;
  
  /** Human-readable error message */
  message?: string;
  
  /** Additional error details */
  details?: unknown;
  
  /** HTTP status code */
  statusCode?: number;
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  /** Array of data items */
  data: T[];
  
  /** Total count of items */
  total: number;
  
  /** Current page number */
  page: number;
  
  /** Items per page */
  limit: number;
  
  /** Total number of pages */
  totalPages?: number;
  
  /** Next page URL */
  nextPage?: string;
  
  /** Previous page URL */
  prevPage?: string;
}

/**
 * Operation result with counts
 */
export interface OperationResult {
  /** Success indicator */
  success: boolean;
  
  /** Result message */
  message: string;
  
  /** Items affected count */
  count?: number;
  
  /** Additional operation metadata */
  [key: string]: unknown;
}
