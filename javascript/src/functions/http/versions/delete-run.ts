import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { withCors, withErrorHandler } from '../../../middleware/index.js';
import { getVersionService } from '../../../services/index.js';
import { errorResponse, successResponse } from '../../../utils/httpHelpers.js';

/**
 * Delete Specific Run Handler - HTTP DELETE endpoint for single version
 */
async function deleteRunHandlerCore(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log(`Delete run request received`);

  const documentId = req.query.get('documentId');

  if (!documentId) {
    return errorResponse('Missing documentId query parameter', 400);
  }

  try {
    // Use VersionService for run deletion
    const versionService = getVersionService();
    const result = await versionService.deleteRun(documentId);

    context.log(`✅ Deleted run version ${result.version}`);

    return successResponse({
      message: `Run version ${result.version} deleted successfully`,
      documentId: result.documentId,
      version: result.version,
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

export const deleteRunHandler = withErrorHandler(withCors(deleteRunHandlerCore));

app.http('deleteRun', {
  methods: ['DELETE', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: deleteRunHandler,
});
