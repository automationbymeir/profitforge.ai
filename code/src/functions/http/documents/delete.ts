import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { createDocumentService } from '../../../services/index.js';
import { errorResponse, successResponse } from '../../../utils/httpHelpers.js';
import { withCors, withErrorHandler } from '../../../utils/middleware/index.js';

/**
 * Delete Document Handler - HTTP DELETE endpoint to remove document and ALL versions
 */
async function deleteDocumentHandlerCore(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log(`Delete document request received`);

  const vendorName = req.params.vendorName;

  if (!vendorName) {
    return errorResponse('Missing vendorName in route', 400);
  }

  try {
    const documentService = await createDocumentService();
    await documentService.deleteDocument(vendorName);

    context.log(`✅ Deleted document ${vendorName}`);

    return successResponse({
      message: 'Document deleted successfully',
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

export const deleteDocumentHandler = withErrorHandler(withCors(deleteDocumentHandlerCore));

app.http('deleteDocument', {
  route: 'documents/{vendorName}',
  methods: ['DELETE', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: deleteDocumentHandler,
});
