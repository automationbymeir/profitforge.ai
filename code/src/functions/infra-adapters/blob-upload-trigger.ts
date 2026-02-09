import { app, InvocationContext } from '@azure/functions';
import { createRunService } from '../../services/index.js';

/**
 * Blob Upload Trigger - Automatically create processing run when PDF is uploaded
 *
 * Triggers on: {vendorName}/*.pdf pattern
 * Creates: New processing run in database
 * Queues: OCR processing
 *
 * This decouples document upload from processing initiation, allowing:
 * - Upload endpoint to focus only on blob storage
 * - Multiple upload methods (API, direct blob upload, etc.)
 * - Automatic processing without explicit API calls
 */
export async function blobUploadTrigger(blob: Buffer, context: InvocationContext): Promise<void> {
  const triggerMetadata = context.triggerMetadata as Record<string, unknown>;
  const blobUrl = (triggerMetadata?.uri || triggerMetadata?.url || '') as string;

  context.log(`Blob upload trigger fired for: ${blobUrl}`);

  // Extract vendor name from blob path
  // Format: https://<account>.blob.core.windows.net/<container>/<vendorName>/<filename>.pdf
  const urlParts = blobUrl.split('/');
  const containerIndex = urlParts.indexOf('uploads');

  if (containerIndex === -1 || urlParts.length < containerIndex + 2) {
    context.log(`⚠️ Invalid blob URL format: ${blobUrl}`);
    return;
  }

  const vendorName = urlParts[containerIndex + 1];
  const filename = urlParts[urlParts.length - 1];

  // Only process PDF files (skip OCR result JSON files)
  if (!filename.toLowerCase().endsWith('.pdf')) {
    context.log(`Skipping non-PDF file: ${filename}`);
    return;
  }

  context.log(`Processing PDF upload for vendor: ${vendorName}`);

  try {
    // Use RunService to create run and queue OCR
    // Service layer handles document path resolution via StorageService
    const runService = await createRunService();
    const result = await runService.createOCRRun(vendorName);

    context.log(`✅ Created run ${result.runId} and queued OCR for ${result.documentPath}`);
  } catch (error) {
    context.log(`❌ Error processing blob upload: ${error}`);
    throw error;
  }
}

// Register blob trigger function
app.storageBlob('blobUploadTrigger', {
  path: 'uploads/{vendorName}/{filename}',
  connection: 'AzureWebJobsStorage',
  handler: blobUploadTrigger,
});
