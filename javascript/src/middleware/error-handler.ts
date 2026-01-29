import { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { errorResponse } from '../utils/httpHelpers.js';

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

      // Return generic error response
      return errorResponse('Internal Server Error', 500, 'An unexpected error occurred');
    }
  };
}
