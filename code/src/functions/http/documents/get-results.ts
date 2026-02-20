import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { createDocumentService } from '../../../services/index.js';
import { successResponse } from '../../../utils/httpHelpers.js';
import { withCors, withErrorHandler } from '../../../utils/middleware/index.js';

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

  try {
    // Use service layer instead of raw SQL
    const documentService = await createDocumentService();

    // Use service.getResults for query-based fetching
    let results;
    if (resultId) {
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

    return successResponse(results);
  } catch (err: unknown) {
    // Log full error details before letting middleware handle the response
    if (err instanceof Error) {
      context.log('getResults error', err.message, err.stack);
      console.error('getResults error', err);
    } else {
      context.log('getResults error (non-Error)', String(err));
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
