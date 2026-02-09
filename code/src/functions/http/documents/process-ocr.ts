import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { createRunService } from '../../../services/index.js';
import { errorResponse, successResponse } from '../../../utils/httpHelpers.js';
import { withCors, withErrorHandler } from '../common/middleware/index.js';

/**
 * Process OCR Handler - HTTP POST endpoint to create new processing run with OCR
 *
 * Creates a NEW processing run (new result_id) and queues OCR processing.
 * Old processing runs are preserved for history.
 *
 * NOTE: This endpoint creates the run record manually. The blob upload trigger
 * handles automatic run creation when PDFs are uploaded to blob storage.
 */
async function processOCRHandlerCore(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log(`Process OCR request received`);

  const vendorName = req.params.vendorName;
  context.log(`📍 Processing OCR for vendor: "${vendorName}"`);

  if (!vendorName) {
    return errorResponse('Missing vendorName in route', 400);
  }

  try {
    // Use RunService to create new run and queue OCR
    const runService = await createRunService();

    const result = await runService.createOCRRun(vendorName);

    context.log(`✅ Created new OCR processing run ${result.runId} for vendor ${vendorName}`);

    return successResponse({
      message: `New OCR processing run created for vendor`,
      vendorName,
      documentPath: result.documentPath,
      runId: result.runId,
      status: result.status,
      nextStep: 'OCR processing will begin shortly. New run created.',
    });
  } catch (error: unknown) {
    if (error instanceof Error && 'statusCode' in error) {
      const customError = error as Error & { statusCode: number };
      return errorResponse(error.message, customError.statusCode);
    }
    throw error;
  }
}

export const processOCRHandler = withErrorHandler(withCors(processOCRHandlerCore));

app.http('processOCR', {
  route: 'documents/{vendorName}/process-ocr',
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: processOCRHandler,
});
