import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { createDocumentService } from '../../../services/index.js';
import { successResponse } from '../../../utils/httpHelpers.js';
import { withCors, withErrorHandler } from '../common/middleware/index.js';

/**
 * HTTP GET endpoint to retrieve processed document results
 * Query params:
 *  - resultId: specific document ID
 *  - vendorId: filter by vendor
 *  - limit: number of results (default 10)
 */
async function getResultsCore(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log('Processing getResults request');

  const resultId = request.query.get('resultId') || undefined;
  const vendorName = request.query.get('vendor') || undefined;
  const limitParam = request.query.get('limit') || '10';
  const limit = parseInt(limitParam, 10) || 10; // Default to 10 if invalid
  const status = request.query.get('status') || undefined;

  console.log('getResults invoked', { resultId, vendorName, limit, status });
  context.log('getResults invoked', { resultId, vendorName, limit, status });

  // Use service layer instead of raw SQL
  const documentService = await createDocumentService();

  // Use service.getResults for query-based fetching
  const results = await documentService.getResults({
    resultId,
    vendorName,
    limit,
    status,
  });

  return successResponse(results);
}

export const getResults = withErrorHandler(withCors(getResultsCore));

app.http('getResults', {
  route: 'documents',
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: getResults,
});
