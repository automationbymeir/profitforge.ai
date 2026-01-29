import { app, InvocationContext } from '@azure/functions';
import { getOCRService } from '../../services/index.js';

// Connection strings from environment variables
const STORAGE_CONTAINER_DOCUMENTS = process.env.STORAGE_CONTAINER_DOCUMENTS || 'uploads';

/**
 * Document Processor - Blob trigger function for OCR extraction ONLY
 */
export async function processDocument(blob: Buffer, context: InvocationContext): Promise<void> {
  const blobPath = context.triggerMetadata?.blobTrigger as string;
  context.log(`Processing blob: ${blobPath}`);

  const startTime = Date.now();

  try {
    // Use OCRService for OCR processing
    const ocrService = getOCRService();
    const result = await ocrService.processDocument(blob, blobPath, startTime);

    context.log(`✅ OCR processing complete for ${result.documentId}. Status: ocr_complete`);

    // Queue AI Product Mapper for asynchronous processing
    try {
      context.log(`📤 Queuing AI product mapping for document ${result.documentId}...`);

      await ocrService.queueAIMapping(result.documentId);

      context.log(`✅ AI mapping queued successfully for document ${result.documentId}`);
    } catch (queueError: unknown) {
      // Don't fail OCR if queuing fails - log and continue
      const errorMessage = queueError instanceof Error ? queueError.message : String(queueError);
      context.warn(`⚠️ Failed to queue AI mapping: ${errorMessage}`);
      context.warn(
        `   Document ${result.documentId} is in 'ocr_complete' state and can be reprocessed manually via API.`
      );
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : '';
    context.error(`Error processing document: ${errorMessage}`);
    context.error(`Error stack: ${errorStack}`);

    // Update database with failure status
    try {
      const ocrService = getOCRService();
      await ocrService.markAsFailed(blobPath, errorMessage);
    } catch (dbError) {
      context.error(`Failed to update error status in DB: ${dbError}`);
    }
  }
}

app.storageBlob('processDocument', {
  path: `${STORAGE_CONTAINER_DOCUMENTS}/{name}`,
  connection: 'STORAGE_CONNECTION_STRING',
  handler: processDocument,
});
