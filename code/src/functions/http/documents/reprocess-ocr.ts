import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { withCors, withErrorHandler } from '../../../middleware/index.js';
import { createDocumentService } from '../../../services/index.js';
import { getStorageConnectionString } from '../../../utils/config.js';
import { errorResponse, successResponse } from '../../../utils/httpHelpers.js';
import { QueueService } from '../../infra-adapters/queues.js';

/**
 * Reprocess OCR Handler - HTTP POST endpoint to rerun OCR processing
 *
 * Queues the document for OCR reprocessing via the ocr-queue.
 * This allows reusing existing OCR processing infrastructure.
 */
async function reprocessOCRHandlerCore(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log(`Reprocess OCR request received`);

  const documentId = req.params.id;

  if (!documentId) {
    return errorResponse('Missing document ID in route', 400);
  }

  try {
    // Get document info
    const documentService = await createDocumentService();
    const document = await documentService.getDocument(documentId);

    // Queue OCR processing (reuses existing queue infrastructure)
    const queueService = new QueueService(getStorageConnectionString());
    await queueService.queueOCRProcessing(documentId, document.document_path);

    context.log(`✅ Queued OCR reprocessing for document ${documentId}`);

    return successResponse({
      message: `Document queued for OCR reprocessing`,
      documentId,
      documentPath: document.document_path,
      currentStatus: document.processing_status,
      nextStep: 'OCR processing will begin shortly via queue',
    });
  } catch (error: unknown) {
    if (error instanceof Error && 'statusCode' in error) {
      const customError = error as Error & { statusCode: number };
      return errorResponse(error.message, customError.statusCode);
    }
    throw error;
  }
}

export const reprocessOCRHandler = withErrorHandler(withCors(reprocessOCRHandlerCore));

app.http('reprocessOCR', {
  route: 'documents/{id}/reprocess-ocr',
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: reprocessOCRHandler,
});
