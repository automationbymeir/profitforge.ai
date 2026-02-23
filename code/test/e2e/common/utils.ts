/*
 *  API Test utils for end-to-end tests
 */

import {
  createDocumentRepository,
  DocumentRepository,
} from '../../../src/data/repositories/DocumentRepository.prisma';
import { createDocumentService, DocumentService, StorageService } from '../../../src/services';
import { getStorageConnectionString } from '../../../src/utils/config';

// Global service instances (created once and exported for reuse across test files)
export const documentRepository: DocumentRepository = await createDocumentRepository();
export const documentService: DocumentService = await createDocumentService();
export const storageService: StorageService = new StorageService(getStorageConnectionString());

/**
 * Helper: Wait for processing run to reach expected status
 *
 * Polls DocumentService.getProcessStatus() every 2 seconds until:
 * - Expected status is reached (returns void - success!)
 * - Processing run fails (throws error - test should fail)
 * - Timeout is reached (throws error - test should fail)
 *
 * Error Handling Philosophy:
 * Throwing errors is correct for E2E tests because:
 * - Vitest/Jest fail the current test but continue to next test
 * - Failed processing or timeouts ARE test failures
 * - Tests should fail fast and report the issue
 *
 * @param runId - Processing run ID (result_id) to poll
 * @param expectedStatus - Status to wait for (default: 'completed')
 * @param maxWaitMs - Maximum wait time in milliseconds (default: 180s)
 * @throws Error if processing fails or times out
 */
export async function pollDocumentStatus(
  runId: string,
  expectedStatus: 'completed' | 'failed' = 'completed',
  maxWaitMs: number = 180000
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const doc = await documentRepository.findById(runId);
    if (!doc) throw new Error(`Run not found: ${runId}`);
    const status = doc.processing_status;

    // Success - reached expected status
    if (status === expectedStatus) {
      return;
    }

    // Fail fast - processing failed
    if (status === 'failed' && expectedStatus !== 'failed') {
      throw new Error(`Processing run failed (runId: ${runId}). Check logs for details.`);
    }

    // Wait 2 seconds before next poll
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  // Timeout - polling took too long
  throw new Error(
    `Timeout: Processing run did not reach status '${expectedStatus}' after ${maxWaitMs}ms (runId: ${runId})`
  );
}

export async function pollUploadCompletion(blobPath: string) {
  const containerName = 'uploads';
  const maxAttempts = 40;
  let attempts = 0;

  while (attempts < maxAttempts) {
    const exists = await storageService.doesBlobExist(containerName, blobPath);
    if (exists) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
    attempts++;
  }

  throw new Error(
    `Timeout: Blob '${blobPath}' not found in container '${containerName}' after ${maxAttempts * 2000}ms`
  );
}

/**
 * Helper: Wait for document creation by vendor name
 *
 * NOTE: This function is generally not recommended for E2E tests because it relies
 * on the blob trigger firing, which has polling delays in local development.
 *
 * Recommended approach: Use reprocessOCR() immediately after upload to manually
 * trigger run creation instead of waiting for the blob trigger.
 *
 * @throws Error if record is not created within timeout
 */
export async function waitForDocumentCreation(vendorName: string) {
  let attempts = 0;
  const maxAttempts = 20;
  let recordCreated = false;
  let recordId = '';
  while (attempts < maxAttempts && !recordCreated) {
    const documents = await documentRepository.findByVendor(vendorName);
    if (documents.length > 0) {
      recordId = documents[0].result_id;
      recordCreated = true;
    } else {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      attempts++;
    }
  }
  return recordId;
}

/**
 * Helper: Get blob properties using StorageService
 */
export async function getBlobProperties(containerName: string, blobPath: string) {
  return await storageService.getBlobProperties(containerName, blobPath);
}

export async function clean(vendorName: string) {
  try {
    const productsDeleted = await documentRepository.deleteVendorProducts(vendorName);
    console.log(`✅ Deleted ${productsDeleted} vendor products for ${vendorName}`);

    const result = await documentService.deleteDocument(vendorName);
    console.log(
      `✅ Cleaned up previous test data for ${vendorName}: ${result.documentsDeleted} records, ${result.blobsDeleted} blobs`
    );
  } catch (_error) {
    // Vendor doesn't exist yet, that's fine
    console.log(`ℹ️  No previous test data to clean for ${vendorName}`);
  }
}
