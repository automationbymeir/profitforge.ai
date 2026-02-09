import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { createRunService } from '../../../services/run-service.js';
import { errorResponse, successResponse } from '../../../utils/httpHelpers.js';
import { withCors, withErrorHandler } from '../common/middleware/index.js';

/**
 * Delete Run Handler - HTTP DELETE endpoint to delete a specific processing run
 *
 * Deletes the database record and associated blobs for a specific processing run.
 * Other runs for the same vendor are unaffected.
 */
async function deleteRunHandlerCore(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log(`Delete run request received`);

  const runId = req.params.runId;

  if (!runId) {
    return errorResponse('Missing runId in route', 400);
  }

  try {
    // Get run service
    const runService = await createRunService();

    // Delete the run (database record + blobs)
    await runService.deleteRun(runId);

    context.log(`✅ Deleted processing run ${runId}`);

    return successResponse({
      message: 'Processing run deleted successfully',
      runId,
    });
  } catch (error: unknown) {
    if (error instanceof Error && 'statusCode' in error) {
      const customError = error as Error & { statusCode: number };
      return errorResponse(error.message, customError.statusCode);
    }
    throw error;
  }
}

export const deleteRunHandler = withErrorHandler(withCors(deleteRunHandlerCore));

app.http('deleteRun', {
  route: 'documents/runs/{runId}',
  methods: ['DELETE', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: deleteRunHandler,
});
