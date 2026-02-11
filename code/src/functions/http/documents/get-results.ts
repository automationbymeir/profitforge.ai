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

  try {
    context.log('Creating DocumentService');
    console.log('Creating DocumentService');

    // Use service layer instead of raw SQL
    const documentService = await createDocumentService();

    context.log('DocumentService created');
    console.log('DocumentService created');

    // Use service.getResults for query-based fetching
    let results;
    if (resultId) {
      context.log('Fetching single document by ID', resultId);
      console.log('Fetching single document by ID', resultId);
      const doc = await documentService.getDocument(resultId);
      results = doc ? [doc] : [];
    } else {
      results = await documentService.getResults({
        resultId,
        vendorName,
        limit,
        status,
      });
    }

    context.log('getResults completed', { count: Array.isArray(results) ? results.length : 0 });
    console.log('getResults completed', { count: Array.isArray(results) ? results.length : 0 });

    return successResponse(results);
  } catch (err: unknown) {
    # Log full error details before letting middleware handle the response
    if (err instanceof Error) {
      context.log.error('getResults error', err.message, err.stack);
      console.error('getResults error', err);
    } else {
      context.log.error('getResults error (non-Error)', String(err));
      console.error('getResults error (non-Error)', err);
    }
    throw err;
  }
}

export const getResults = withErrorHandler(withCors(getResultsCore));

app.http('getResults', {
  route: 'documents',
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: getResults,
});
