import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { createBenchmarkService } from '../../../services/benchmark-service.js';
import { errorResponse, successResponse } from '../../../utils/httpHelpers.js';
import { withCors, withErrorHandler } from '../common/middleware/index.js';

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

  // Grade run against benchmark
  const benchmarkService = await createBenchmarkService();
  const gradeResult = await benchmarkService.gradeBenchmark(runId);

  context.log(
    `Grade complete: F1=${gradeResult.f1Score}%, Precision=${gradeResult.precision}%, Recall=${gradeResult.recall}%`
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
