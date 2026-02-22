import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { createDocumentService } from '../../../services/index.js';
import { errorResponse } from '../../../utils/httpHelpers.js';
import { withCors, withErrorHandler } from '../../../utils/middleware/index.js';

/**
 * GET /documents/runs/{runId}/download
 * Download extracted products as JSON file
 */
async function downloadProductsCore(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const runId = req.params.runId;

  if (!runId) {
    return errorResponse('Missing runId parameter', 400);
  }

  context.log(`Downloading products for run: ${runId}`);

  const documentService = await createDocumentService();
  const document = await documentService.getDocument(runId);

  if (!document) {
    return errorResponse(`Run ${runId} not found`, 404);
  }

  if (!document.ai_mapping_result) {
    return errorResponse(
      `Run ${runId} has no extracted products. Processing status: ${document.processing_status}`,
      400
    );
  }

  // Parse the AI mapping result
  const mappingData = JSON.parse(document.ai_mapping_result);
  const products = mappingData.products || [];

  // Create download response with metadata
  const downloadData = {
    metadata: {
      runId: document.result_id,
      vendorName: document.vendor_name,
      documentName: document.document_name,
      processingStatus: document.processing_status,
      productCount: products.length,
      extractedAt: mappingData.timestamp || document.updated_at,
      aiModel: document.ai_model_used,
      aiConfidenceScore: document.ai_confidence_score,
      aiCompletenessScore: document.ai_completeness_score,
      qualityMetrics: mappingData.qualityMetrics,
    },
    products,
  };

  // Format as downloadable JSON
  const jsonContent = JSON.stringify(downloadData, null, 2);
  const filename = `${document.vendor_name}_${document.result_id}_products.json`;

  return {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
    body: jsonContent,
  };
}

export const downloadProductsHandler = withErrorHandler(withCors(downloadProductsCore));

app.http('downloadProducts', {
  route: 'documents/runs/{runId}/download',
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: downloadProductsHandler,
});
