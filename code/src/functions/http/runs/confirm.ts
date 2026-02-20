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

    context.log(
      `✅ Exported ${result.productsExported} products to production for vendor ${result.vendor}`
    );

    return successResponse({
      message: 'Products exported to production successfully',
      documentId: result.documentId,
      vendor: result.vendor,
      productsExported: result.productsExported,
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
