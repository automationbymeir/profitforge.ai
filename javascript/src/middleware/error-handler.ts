import { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { errorResponse } from '../utils/httpHelpers.js';

const DEFAULT_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-ms-client-request-id',
};

type Handler = (req: HttpRequest, context: InvocationContext) => Promise<HttpResponseInit>;

/**
 * Error Handler Middleware
 *
 * Catches all unhandled errors from the wrapped handler and returns a generic
 * error response to prevent sensitive information leakage.
 *
 * @param handler - The handler function to wrap
 * @returns Wrapped handler with error handling
 *
 * @example
 * ```typescript
 * const myHandler = withErrorHandler(async (req, context) => {
 *   // If this throws, error handler will catch and return 500
 *   throw new Error('Something went wrong');
 * });
 * ```
 */
export function withErrorHandler(handler: Handler): Handler {
  return async (req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      return await handler(req, context);
    } catch (error) {
      // Log error with context
      context.error('Unhandled error in handler:', {
        url: req.url,
        method: req.method,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Check if error has a custom statusCode property
      const statusCode = (error as { statusCode?: number })?.statusCode || 500;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Return appropriate error response based on status code
      if (statusCode === 404) {
        // 404 errors use 'message' field for consistency
        return {
          status: 404,
          headers: DEFAULT_CORS_HEADERS,
          jsonBody: { error: 'Not Found', message: errorMessage },
        };
      } else if (statusCode === 400) {
        // Validation errors
        return errorResponse(errorMessage, 400);
      } else {
        // Generic server errors (don't expose details)
        return errorResponse('Internal Server Error', 500, 'An unexpected error occurred');
      }
    }
  };
}
