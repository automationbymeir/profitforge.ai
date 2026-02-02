/**
 * Azurite (Blob/Queue) Helpers
 *
 * Re-exports Azurite utilities from setup/utils.ts for backward compatibility
 * with existing test files.
 */

export {
  cleanAzuriteBlobs,
  cleanAzuriteQueue,
  cleanTestDatabase,
  closeTestDbPool,
  getAzuriteBlobClient,
  getAzuriteQueueClient,
  getTestDbPool,
  setupAzuriteContainers,
  waitForDatabase,
} from '../setup/utils.js';

// Additional helper functions that tests expect
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Upload a document via DocumentService (simulates real workflow)
 * This uses the actual service layer which:
 * - Validates vendor name
 * - Uploads blob to Azurite
 * - Creates document record in DB
 * - All atomically
 *
 * @param vendorName - Vendor identifier (format: VENDOR_NAME_MM_YY)
 * @param pdfPath - Optional path to PDF file (defaults to vendor-light.pdf - 259KB)
 * @returns UploadResult with resultId, documentName, etc.
 */
export async function uploadDocumentViaService(
  vendorName: string,
  pdfPath?: string
): Promise<{
  resultId: string;
  documentName: string;
  filePath: string;
  vendorName: string;
  status: string;
}> {
  // Dynamic import to avoid circular dependencies
  const { getDocumentService } = await import('../../../src/services/document-service.js');

  // Use vendor-light.pdf (259KB) for fast tests
  const defaultPdfPath = join(__dirname, 'fixtures/vendor-light.pdf');
  const pdfBuffer = readFileSync(pdfPath || defaultPdfPath);

  // Create File object from buffer
  const file = new File([pdfBuffer], 'test.pdf', { type: 'application/pdf' }) as File;

  // Upload via service (this creates both blob and DB record)
  const documentService = await getDocumentService();
  return await documentService.upload(file, vendorName);
}
