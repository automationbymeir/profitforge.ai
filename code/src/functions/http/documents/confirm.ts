import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { withCors, withErrorHandler } from '../../../middleware/index.js';
import { createDocumentService } from '../../../services/index.js';
import { errorResponse, successResponse } from '../../../utils/httpHelpers.js';

/**
 * Confirm Mapping Handler - HTTP POST endpoint to export products to production
 */
async function confirmMappingHandlerCore(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log(`Confirm mapping request received`);

  const documentId = req.params.id;

  if (!documentId) {
    return errorResponse('Missing document ID in route', 400);
  }

  try {
    // Use DocumentService for confirmation logic
    const documentService = await createDocumentService();
    const result = await documentService.confirmMapping(documentId);

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
  route: 'documents/{id}/confirm',
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: confirmMappingHandler,
});
