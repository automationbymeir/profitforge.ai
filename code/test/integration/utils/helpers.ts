/**
 * Azurite (Blob/Queue) Helpers
 *
 * Re-exports Azurite utilities from setup/utils.ts for backward compatibility
 * with existing test files.
 */

export {
  cleanAzuriteBlobs,
  cleanAzuriteQueue,
  getAzuriteBlobClient,
  getAzuriteQueueClient,
  setupAzuriteContainers,
} from '../setup/utils.js';

// Additional helper functions that tests expect
import { readFileSync } from 'fs';
import { join } from 'path';
import { getConnectionPool } from '../../../src/utils/database.js';

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
  const defaultPdfPath = join(__dirname, '../../../fixtures/vendor-light.pdf');
  const pdfBuffer = readFileSync(pdfPath || defaultPdfPath);

  // Create File object from buffer
  const file = new File([pdfBuffer], 'test.pdf', { type: 'application/pdf' }) as File;

  // Upload via service (this creates both blob and DB record)
  const documentService = await getDocumentService();
  return await documentService.upload(file, vendorName);
}

/**
 * Clean all test data from database
 *
 * CRITICAL: Delete in correct order to respect foreign key constraints:
 * 1. vendor_products (child - has FK to document_processing_results)
 * 2. document_processing_results (parent)
 */
export async function cleanTestDatabase(): Promise<void> {
  const db = await getConnectionPool();

  // Import repositories dynamically to avoid circular dependencies
  const { VendorProductRepository } =
    await import('../../../src/data/repositories/VendorProductRepository.js');
  const { DocumentRepository } =
    await import('../../../src/data/repositories/DocumentRepository.js');

  const vendorProductRepo = new VendorProductRepository(db);
  const documentRepo = new DocumentRepository(db);

  // Delete in correct order (respect foreign keys)
  // 1. Delete vendor_products first (has FK: source_document_id -> document_processing_results.result_id)
  await vendorProductRepo.deleteAll();

  // 2. Then delete documents (parent table)
  await documentRepo.deleteAll();
}
