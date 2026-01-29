import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { withCors, withErrorHandler } from '../../../middleware/index.js';
import { getVersionService } from '../../../services/index.js';
import { errorResponse, successResponse } from '../../../utils/httpHelpers.js';

/**
 * Get Version History Handler - HTTP GET endpoint for document versions
 */
async function getVersionHistoryHandlerCore(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log(`Get version history request received`);

  const documentId = req.query.get('documentId');

  if (!documentId) {
    return errorResponse('Missing documentId query parameter', 400);
  }

  try {
    // Use VersionService for history retrieval
    const versionService = getVersionService();
    const result = await versionService.getHistory(documentId);

    return successResponse(result);
  } catch (error: unknown) {
    // Handle custom error codes from service
    if (error instanceof Error && 'statusCode' in error) {
      const customError = error as Error & { statusCode: number };
      return errorResponse(error.message, customError.statusCode);
    }
    throw error;
  }
}

export const getVersionHistoryHandler = withErrorHandler(withCors(getVersionHistoryHandlerCore));

app.http('getVersionHistory', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: getVersionHistoryHandler,
});
