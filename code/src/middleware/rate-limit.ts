import { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { errorResponse } from '../utils/httpHelpers.js';
import { checkDailyUploadLimit, checkIpRateLimit } from '../utils/usageTracker.js';

type Handler = (req: HttpRequest, context: InvocationContext) => Promise<HttpResponseInit>;

/**
 * Rate Limiting Middleware
 *
 * Enforces IP-based and daily upload limits in demo mode.
 * Skips rate limiting when not in demo mode.
 *
 * @param handler - The handler function to wrap
 * @returns Wrapped handler with rate limiting
 *
 * @example
 * ```typescript
 * const myHandler = withRateLimit(async (req, context) => {
 *   // This only runs if within rate limits (in demo mode)
 *   return { status: 200, jsonBody: { message: 'Within limits' } };
 * });
 * ```
 */
export function withRateLimit(handler: Handler): Handler {
  return async (req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    // Skip rate limiting if not in demo mode
    if (process.env.IS_DEMO_MODE !== 'true') {
      return handler(req, context);
    }

    // Extract client IP
    const clientIp =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      req.headers.get('x-real-ip') ||
      'unknown';

    // Check IP rate limit
    const ipLimitCheck = await checkIpRateLimit(clientIp);
    if (!ipLimitCheck.allowed) {
      context.info(`IP rate limit exceeded for ${clientIp}`);
      return errorResponse('Too many requests from this IP address. Please try again later.', 429);
    }

    // Check daily upload limit
    const dailyLimitCheck = await checkDailyUploadLimit();
    if (!dailyLimitCheck.allowed) {
      context.info('Daily upload limit reached');
      return errorResponse('Daily upload limit reached. Please try again tomorrow.', 429);
    }

    // Within limits, execute handler
    return handler(req, context);
  };
}
