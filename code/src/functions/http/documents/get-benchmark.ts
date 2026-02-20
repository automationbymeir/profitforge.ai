import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { createBenchmarkService } from '../../../services/benchmark-service.js';
import { errorResponse, successResponse } from '../../../utils/httpHelpers.js';
import { withCors, withErrorHandler } from '../../../utils/middleware/index.js';

/**
 * GET /documents/benchmark/{vendorName}
 * Retrieve benchmark data for a vendor
 */
async function getBenchmarkCore(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const vendorName = req.params.vendorName;

  if (!vendorName) {
    return errorResponse('Missing vendorName parameter', 400);
  }

  context.log(`Fetching benchmark for vendor: ${vendorName}`);

  // Get benchmark data
  const benchmarkService = await createBenchmarkService();
  const benchmark = await benchmarkService.getBenchmark(vendorName);

  if (!benchmark) {
    return errorResponse(
      'No benchmark found for vendor',
      404,
      `No benchmark found for vendor: ${vendorName}`
    );
  }

  return successResponse(benchmark);
}

// Apply middleware
export const getBenchmarkHandler = withErrorHandler(withCors(getBenchmarkCore));

// Register with Azure Functions
app.http('getBenchmark', {
  route: 'documents/benchmark/{vendorName}',
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: getBenchmarkHandler,
});
