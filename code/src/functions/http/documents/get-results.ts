import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import sql from 'mssql';
import { withDatabase } from '../../../utils/database.js';
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

  const resultId = request.query.get('resultId');
  const vendorName = request.query.get('vendor');
  const limitParam = request.query.get('limit') || '10';
  const limit = parseInt(limitParam, 10) || 10; // Default to 10 if invalid

  // Validate UUID format if resultId is provided
  if (resultId) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(resultId)) {
      // Return empty array for invalid UUID instead of throwing error
      return successResponse([]);
    }
  }

  const results = await withDatabase(async (pool) => {
    // No versioning - just return all documents
    let query = `
      SELECT TOP (@limit)
        result_id,
        document_name,
        document_path,
        document_type,
        vendor_name,
        processing_status,
        export_status,
        doc_intel_cost_usd,
        doc_intel_confidence_score,
        ai_mapping_result,
        ai_model_used,
        ai_model_cost_usd,
        ai_confidence_score,
        ai_completeness_score,
        created_at,
        updated_at,
        processing_completed_at
      FROM vvocr.document_processing_results
      WHERE 1=1
    `;

    const queryRequest = pool.request().input('limit', sql.Int, limit);

    if (resultId) {
      query += ' AND result_id = @resultId';
      queryRequest.input('resultId', sql.UniqueIdentifier, resultId);
    }

    if (vendorName) {
      query += ' AND vendor_name LIKE @vendorName';
      queryRequest.input('vendorName', sql.NVarChar, `%${vendorName}%`);
    }

    query += ' ORDER BY created_at DESC';

    const result = await queryRequest.query(query);

    // Parse JSON fields
    return result.recordset.map((record) => ({
      ...record,
      ai_mapping_result: record.ai_mapping_result ? JSON.parse(record.ai_mapping_result) : null,
    }));
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
