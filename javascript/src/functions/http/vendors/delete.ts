import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { withCors, withErrorHandler } from '../../../middleware/index.js';
import { getVendorService } from '../../../services/index.js';
import { errorResponse, successResponse } from '../../../utils/httpHelpers.js';

/**
 * Delete Vendor Handler Core - Business logic for vendor cleanup
 */
async function deleteVendorHandlerCore(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log(`Processing delete request for ${req.url}`);

  const vendorName = req.query.get('vendorName');

  if (!vendorName) {
    return errorResponse('Missing vendorName query parameter', 400);
  }

  try {
    // Use VendorService for deletion logic
    const vendorService = getVendorService();
    const result = await vendorService.deleteVendor(vendorName);

    return successResponse({
      message: `Vendor ${result.vendorName} deleted successfully`,
      documentsDeleted: result.documentsDeleted,
      blobsDeleted: result.blobsDeleted,
    });
  } catch (error: unknown) {
    // Handle custom error codes from service
    if (error instanceof Error && 'statusCode' in error) {
      const customError = error as Error & { statusCode: number };
      // For 404 errors, include message field for consistency
      if (customError.statusCode === 404) {
        return errorResponse('Not Found', 404, error.message);
      }
      return errorResponse(error.message, customError.statusCode);
    }
    throw error;
  }
}

/**
 * Delete Vendor Handler - HTTP DELETE endpoint with middleware
 * Middleware: Error Handler → CORS → Business Logic
 */
export const deleteVendorHandler = withErrorHandler(withCors(deleteVendorHandlerCore));

app.http('deleteVendor', {
  methods: ['DELETE', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: deleteVendorHandler,
});
