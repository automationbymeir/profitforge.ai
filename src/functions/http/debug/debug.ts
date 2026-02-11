import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { successResponse } from '../../../utils/httpHelpers.js';
import { withCors, withErrorHandler } from '../common/middleware/index.js';

async function debugHandlerCore(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  context.log('debugHandler invoked', { url: request.url, query: request.query?.toString?.() });
  console.log('debugHandler invoked', { url: request.url, query: request.query?.toString?.() });
  return successResponse({ message: 'debug OK' });
}

export const debugHandler = withErrorHandler(withCors(debugHandlerCore));

app.http('debugHandler', {
  route: 'debug',
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: debugHandler,
});
