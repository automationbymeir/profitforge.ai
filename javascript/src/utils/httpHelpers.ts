import { HttpResponseInit } from '@azure/functions';

/**
 * HTTP Response Helpers
 * Standardized response builders with CORS headers
 */

const DEFAULT_CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
} as const;

export interface ErrorResponse {
  error: string;
  message?: string;
  details?: unknown;
}

export interface SuccessResponse<T = unknown> {
  message?: string;
  data?: T;
  [key: string]: unknown;
}

/**
 * Create a successful JSON response with CORS headers
 */
export function successResponse<T>(
  data: T,
  status: number = 200,
  additionalHeaders?: Record<string, string>
): HttpResponseInit {
  return {
    status,
    headers: { ...DEFAULT_CORS_HEADERS, ...additionalHeaders },
    jsonBody: data,
  };
}

/**
 * Create an error response with CORS headers (no sensitive info disclosure)
 */
export function errorResponse(
  error: string,
  status: number = 500,
  message?: string,
  additionalHeaders?: Record<string, string>
): HttpResponseInit {
  const body: ErrorResponse = { error };
  if (message) {
    body.message = message;
  }

  return {
    status,
    headers: { ...DEFAULT_CORS_HEADERS, ...additionalHeaders },
    jsonBody: body,
  };
}

/**
 * Create a validation error response (400)
 */
export function validationError(
  message: string,
  details?: unknown
): HttpResponseInit {
  // For backward compatibility with existing tests,
  // use the message as the error field directly
  return {
    status: 400,
    headers: DEFAULT_CORS_HEADERS,
    jsonBody: { error: message, ...(details ? { details } : {}) },
  };
}

/**
 * Create a not found error response (404)
 */
export function notFoundError(resource: string): HttpResponseInit {
  return errorResponse('Not Found', 404, `${resource} not found`);
}

/**
 * Create an unauthorized error response (401)
 */
export function unauthorizedError(message?: string): HttpResponseInit {
  return errorResponse(
    'Unauthorized',
    401,
    message || 'Authentication required'
  );
}

/**
 * Create a rate limit error response (429)
 */
export function rateLimitError(
  current: number,
  limit: number,
  resetTime: string
): HttpResponseInit {
  return {
    status: 429,
    headers: DEFAULT_CORS_HEADERS,
    jsonBody: {
      error: 'Rate limit exceeded',
      current,
      limit,
      resetTime,
      message: `Too many requests. Limit: ${limit}. Resets at ${resetTime}.`,
    },
  };
}

/**
 * Create a conflict error response (409)
 */
export function conflictError(
  message: string,
  existingResource?: unknown
): HttpResponseInit {
  return {
    status: 409,
    headers: DEFAULT_CORS_HEADERS,
    jsonBody: {
      error: 'Conflict',
      message,
      existingResource,
    },
  };
}

/**
 * Create a CORS preflight response
 */
export function corsPreflightResponse(): HttpResponseInit {
  return {
    status: 200,
    headers: DEFAULT_CORS_HEADERS,
  };
}

/**
 * Create a payload too large error response (413)
 */
export function payloadTooLargeError(maxSizeMB: number): HttpResponseInit {
  return errorResponse(
    'Payload Too Large',
    413,
    `File size exceeds limit of ${maxSizeMB}MB`
  );
}

/**
 * Safe error message extraction (prevents info disclosure)
 */
export function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // Only include generic message, not stack traces or sensitive details
    return error.message.split('\n')[0].substring(0, 200);
  }
  return 'An unexpected error occurred';
}
