import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { createGradingService } from '../../../services/grading-service.js';
import { errorResponse, successResponse } from '../../../utils/httpHelpers.js';
import { withCors, withErrorHandler } from '../../../utils/middleware/index.js';

/**
 * GET /documents/runs/{runId}/grade
 * Grade a run against its vendor's benchmark
 */
async function gradeRunCore(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const runId = req.params.runId;

  if (!runId) {
    return errorResponse('Missing runId parameter', 400);
  }

  context.log(`Grading run: ${runId}`);

  // Grade run against benchmark using GradingService
  const gradingService = await createGradingService();
  const gradeResult = await gradingService.gradeRun(runId);

  context.log(
    `Grade complete: Accuracy=${gradeResult.metrics.accuracy.toFixed(2)}%, ` +
      `Precision=${gradeResult.metrics.precision.toFixed(2)}%, ` +
      `Recall=${gradeResult.metrics.recall.toFixed(2)}%`
  );

  return successResponse(gradeResult);
}

// Apply middleware
export const gradeRunHandler = withErrorHandler(withCors(gradeRunCore));

// Register with Azure Functions
app.http('gradeRun', {
  route: 'documents/runs/{runId}/grade',
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: gradeRunHandler,
});
