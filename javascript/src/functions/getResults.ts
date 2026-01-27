import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import sql from 'mssql';
import { withDatabase } from '../utils/database.js';

/**
 * HTTP GET endpoint to retrieve processed document results
 * Query params:
 *  - resultId: specific document ID
 *  - vendorId: filter by vendor
 *  - limit: number of results (default 10)
 */
export async function getResults(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log('Processing getResults request');

  try {
    const resultId = request.query.get('resultId');
    const vendorName = request.query.get('vendor');
    const showAllVersions = request.query.get('allVersions') === 'true';
    const limitParam = request.query.get('limit') || '10';
    const limit = parseInt(limitParam, 10) || 10; // Default to 10 if invalid

    // Validate UUID format if resultId is provided
    if (resultId) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(resultId)) {
        // Return empty array for invalid UUID instead of throwing error
        return {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify([]),
        };
      }
    }

    const results = await withDatabase(async (pool) => {
      let query: string;

      if (showAllVersions || resultId) {
        // Show all versions (for detailed audit/comparison) OR if filtering by specific resultId
        query = `
        SELECT TOP (@limit)
          result_id,
          document_name,
          document_path,
          document_type,
          vendor_name,
          processing_status,
          export_status,
          reprocessing_count,
          parent_document_id,
          doc_intel_page_count,
          doc_intel_table_count,
          doc_intel_cost_usd,
          doc_intel_confidence_score,
          ai_mapping_result,
          ai_model_used,
          ai_model_cost_usd,
          ai_confidence_score,
          ai_completeness_score,
          product_count,
          created_at,
          updated_at
        FROM vvocr.document_processing_results
        WHERE 1=1
      `;
      } else {
        // Show only LATEST version of each document (default)
        // Use CTE to find max version per parent chain
        query = `
        WITH LatestVersions AS (
          SELECT 
            COALESCE(parent_document_id, result_id) as root_id,
            MAX(reprocessing_count) as max_version
          FROM vvocr.document_processing_results
          GROUP BY COALESCE(parent_document_id, result_id)
        )
        SELECT TOP (@limit)
          d.result_id,
          d.document_name,
          d.document_path,
          d.document_type,
          d.vendor_name,
          d.processing_status,
          d.export_status,
          d.reprocessing_count,
          d.parent_document_id,
          d.doc_intel_page_count,
          d.doc_intel_table_count,
          d.doc_intel_cost_usd,
          d.doc_intel_confidence_score,
          d.ai_mapping_result,
          d.ai_model_used,
          d.ai_model_cost_usd,
          d.ai_confidence_score,
          d.ai_completeness_score,
          d.product_count,
          d.created_at,
          d.updated_at
        FROM vvocr.document_processing_results d
        INNER JOIN LatestVersions lv 
          ON COALESCE(d.parent_document_id, d.result_id) = lv.root_id
          AND d.reprocessing_count = lv.max_version
        WHERE 1=1
      `;
      }

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

    return {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(results),
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    context.error('Error retrieving results:', error);
    return {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: errorMessage }),
    };
  }
}

app.http('getResults', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: async (request: HttpRequest, context: InvocationContext) => {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      };
    }
    return getResults(request, context);
  },
});
