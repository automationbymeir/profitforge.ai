import { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

type Handler = (req: HttpRequest, context: InvocationContext) => Promise<HttpResponseInit>;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
} as const;

/**
 * CORS Middleware
 *
 * Adds CORS headers to all responses and handles OPTIONS preflight requests.
 *
 * @param handler - The handler function to wrap
 * @returns Wrapped handler with CORS support
 *
 * @example
 * ```typescript
 * const myHandler = withCors(async (req, context) => {
 *   return { status: 200, jsonBody: { message: 'Hello' } };
 * });
 * ```
 */
export function withCors(handler: Handler): Handler {
  return async (req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    // Handle OPTIONS preflight
    if (req.method === 'OPTIONS') {
      return {
        status: 204,
        headers: CORS_HEADERS,
      };
    }

    // Execute handler
    const response = await handler(req, context);

    // Merge CORS headers with response headers
    return {
      ...response,
      headers: {
        ...CORS_HEADERS,
        ...response.headers,
      },
    };
  };
}
