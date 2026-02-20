import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { createDocumentService } from '../../../services/index.js';
import { errorResponse, successResponse } from '../../../utils/httpHelpers.js';
import {
  withAuth,
  withCors,
  withErrorHandler,
  withRateLimit,
} from '../../../utils/middleware/index.js';
import { incrementDailyUploadCount, incrementIpUploadCount } from '../../../utils/usageTracker.js';
import { validateVendorName } from '../../../utils/validations.js';

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
  // Validate vendor name
  if (!validateVendorName(vendorName)) {
    return errorResponse('Invalid vendor name format', 400);
  }

  // Validate file type (HTTP-layer concern)
  const ALLOWED_FILE_TYPES = ['application/pdf'];
  if (!ALLOWED_FILE_TYPES.includes(file.type)) {
    return errorResponse(`Unsupported file type: ${file.type}. Only PDF files are allowed.`, 400);
  }

  // Validate file size (demo mode only - HTTP-layer concern)
  if (process.env.IS_DEMO_MODE === 'true') {
    const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '0');
    const maxBytes = MAX_FILE_SIZE_MB * 1024 * 1024;
    if (file.size > maxBytes) {
      return errorResponse(
        `File size exceeds limit of ${MAX_FILE_SIZE_MB}MB (demo environment)`,
        400
      );
    }
  }

  try {
    // Use DocumentService for upload logic
    const documentService = await createDocumentService();
    const result = await documentService.upload(file, vendorName);

    // Increment usage counters (cross-cutting concern)
    await incrementDailyUploadCount();
    await incrementIpUploadCount(clientIp);

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
  route: 'documents/upload',
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: uploadHandler,
});
