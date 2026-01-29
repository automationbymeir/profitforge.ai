import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { withAuth, withCors, withErrorHandler, withRateLimit } from '../../../middleware/index.js';
import { getDocumentService } from '../../../services/index.js';
import { errorResponse, successResponse } from '../../../utils/httpHelpers.js';

/**
 * Upload Handler Core - Business logic for document uploads
 */
async function uploadHandlerCore(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log(`Processing upload request for ${req.url}`);

  // Extract client IP for usage tracking
  const clientIp =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';

  const formData = await req.formData();
  const file = formData.get('file') as File;
  const vendorName = formData.get('vendorName') as string;

  if (!file || !vendorName) {
    return errorResponse('Missing file or vendor name in request', 400);
  }

  try {
    // Use DocumentService for upload logic
    const documentService = getDocumentService();
    const result = await documentService.upload(file, vendorName, clientIp);

    return successResponse(
      {
        message: 'Document uploaded successfully',
        ...result,
      },
      201
    );
  } catch (error: unknown) {
    // Handle custom error codes from service
    if (error instanceof Error && 'statusCode' in error) {
      const customError = error as Error & { statusCode: number; details?: unknown };
      if (customError.details) {
        return errorResponse(
          error.message,
          customError.statusCode,
          JSON.stringify(customError.details)
        );
      }
      return errorResponse(error.message, customError.statusCode);
    }
    throw error;
  }
}

/**
 * Upload Handler - HTTP POST endpoint with middleware
 * Middleware: Error Handler → CORS → Auth → Rate Limit → Business Logic
 */
export const uploadHandler = withErrorHandler(withCors(withAuth(withRateLimit(uploadHandlerCore))));

app.http('upload', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: uploadHandler,
});
