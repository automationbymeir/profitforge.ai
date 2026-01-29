import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { withCors, withErrorHandler } from '../../../middleware/index.js';
import { getDocumentService } from '../../../services/index.js';
import { errorResponse, successResponse } from '../../../utils/httpHelpers.js';

/**
 * Reprocess Mapping Handler - HTTP POST endpoint to rerun AI mapping
 */
async function reprocessMappingHandlerCore(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log(`Reprocess mapping request received`);

  const documentId = req.params.id;

  if (!documentId) {
    return errorResponse('Missing document ID in route', 400);
  }

  try {
    // Use DocumentService for reprocessing logic
    const documentService = getDocumentService();
    const result = await documentService.reprocess(documentId);

    context.log(
      `✅ Created new version record: ${result.newResultId} (v${result.version} of ${result.parentDocumentId})`
    );

    return successResponse({
      message: `New version created for remapping (v${result.version})`,
      originalDocumentId: documentId,
      newResultId: result.newResultId,
      version: result.version,
      parentDocumentId: result.parentDocumentId,
      nextStep: 'AI mapping will be queued automatically',
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

export const reprocessMappingHandler = withErrorHandler(withCors(reprocessMappingHandlerCore));

app.http('reprocessMapping', {
  route: 'documents/{id}/reprocess',
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: reprocessMappingHandler,
});
