import { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { errorResponse } from '../utils/httpHelpers.js';

type Handler = (req: HttpRequest, context: InvocationContext) => Promise<HttpResponseInit>;

/**
 * Authentication Middleware
 *
 * Validates API key in demo mode. Skips validation when not in demo mode.
 *
 * @param handler - The handler function to wrap
 * @returns Wrapped handler with authentication
 *
 * @example
 * ```typescript
 * const myHandler = withAuth(async (req, context) => {
 *   // This only runs if API key is valid (in demo mode)
 *   return { status: 200, jsonBody: { message: 'Authenticated' } };
 * });
 * ```
 */
export function withAuth(handler: Handler): Handler {
  return async (req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    // Skip auth if not in demo mode
    if (process.env.IS_DEMO_MODE !== 'true') {
      return handler(req, context);
    }

    // Extract API key from header
    const providedKey = req.headers.get('x-api-key');

    // Validate API key
    if (!providedKey) {
      context.warn('API key validation failed: Missing API key');
      return errorResponse('Missing API key. Include x-api-key header.', 401);
    }

    if (providedKey !== process.env.DEMO_API_KEY) {
      context.warn('API key validation failed: Invalid API key');
      return errorResponse('Invalid API key', 401);
    }

    // API key valid, execute handler
    return handler(req, context);
  };
}
