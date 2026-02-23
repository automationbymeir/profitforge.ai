import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { createRunService } from '../../../services/index.js';
import { errorResponse, successResponse } from '../../../utils/httpHelpers.js';
import { withCors, withErrorHandler } from '../../../utils/middleware/index.js';

/**
 * Confirm Mapping Handler - HTTP POST endpoint to export products to production
 */
async function confirmMappingHandlerCore(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log(`Confirm mapping request received`);

  const runId = req.params.runId;

  if (!runId) {
    return errorResponse('Missing run ID in route', 400);
  }

  try {
    // Use RunService for confirmation logic
    const runService = await createRunService();
    const result = await runService.confirmMapping(runId);

    // Log mapping statistics for telemetry
    if (result.mappingStats) {
      context.log('📊 Field mapping statistics:', {
        runId,
        vendor: result.vendor,
        exactMatches: result.mappingStats.exactMatches,
        fuzzyMatches: result.mappingStats.fuzzyMatches,
        defaultValues: result.mappingStats.defaultValues,
        missingFields: result.mappingStats.missingFields,
        avgConfidence: result.mappingStats.avgConfidence,
        productsExported: result.productsExported,
      });
    }

    // Log warnings if any
    if (result.warnings && result.warnings.length > 0) {
      context.log('⚠️  Field mapping warnings:', {
        runId,
        warningCount: result.warnings.length,
        warnings: result.warnings,
      });
    }

    context.log(
      `✅ Exported ${result.productsExported} products to production for vendor ${result.vendor}`
    );

    return successResponse({
      message: 'Products exported to production successfully',
      documentId: result.documentId,
      vendor: result.vendor,
      productsExported: result.productsExported,
      mappingStats: result.mappingStats,
      warnings: result.warnings,
    });
  } catch (error: unknown) {
    // Handle custom error codes from service
    if (error instanceof Error && 'statusCode' in error) {
      const customError = error as Error & { statusCode: number };
      return errorResponse(error.message, customError.statusCode);
    }
    throw error;
  }
}

export const confirmMappingHandler = withErrorHandler(withCors(confirmMappingHandlerCore));

app.http('confirmMapping', {
  route: 'documents/runs/{runId}/confirm',
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: confirmMappingHandler,
});
