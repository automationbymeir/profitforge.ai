import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { createBenchmarkService } from '../../../services/benchmark-service.js';
import { errorResponse, successResponse } from '../../../utils/httpHelpers.js';
import { withCors, withErrorHandler } from '../../../utils/middleware/index.js';
import { validateVendorName } from '../../../utils/validations.js';

/**
 * POST /documents/benchmark
 * Upload benchmark Excel file with manually vetted expected results
 */
async function uploadBenchmarkCore(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log('Upload benchmark request received');

  // Extract form data
  const formData = await req.formData();
  const file = formData.get('file') as File;
  const vendorName = formData.get('vendorName') as string;

  // Validate inputs
  if (!file) {
    return errorResponse('Missing required field: file', 400);
  }

  if (!vendorName) {
    return errorResponse('Missing required field: vendorName', 400);
  }

  if (!validateVendorName(vendorName)) {
    return errorResponse(
      'Invalid vendor name. Must be 3-100 characters, alphanumeric with spaces, hyphens, or underscores.',
      400
    );
  }

  // Validate file type
  const fileName = file.name.toLowerCase();
  if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
    return errorResponse('Invalid file type. Only Excel files (.xlsx, .xls) are supported.', 400);
  }

  // Validate file size (10MB limit)
  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) {
    return errorResponse(`File too large. Maximum size is ${maxSize / 1024 / 1024}MB.`, 400);
  }

  // Upload benchmark
  const benchmarkService = await createBenchmarkService();
  const result = await benchmarkService.uploadBenchmark(file, vendorName);

  context.log(`Benchmark uploaded: ${result.path} (${result.productCount} products)`);

  return successResponse(
    {
      message: 'Benchmark uploaded successfully',
      ...result,
    },
    201
  );
}

// Apply middleware
export const uploadBenchmarkHandler = withErrorHandler(withCors(uploadBenchmarkCore));

// Register with Azure Functions
app.http('uploadBenchmark', {
  route: 'documents/benchmark',
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: uploadBenchmarkHandler,
});
