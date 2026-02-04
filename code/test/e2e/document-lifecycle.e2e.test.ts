/**
 * E2E Test - Document Lifecycle Management
 *
 * Comprehensive end-to-end tests for the complete document lifecycle:
 * - Upload & creation
 * - Reprocessing (versioning)
 * - Version deletion
 * - Vendor deletion (cascade)
 * - Confirm mapping (export to production)
 * - Error scenarios (409, 404, 400)
 *
 * Prerequisites:
 * 1. Azure Functions running locally (npm run dev from /code)
 * 2. SQL Server and Azurite containers running (docker-compose up)
 * 3. Clean database state (beforeEach handles cleanup)
 *
 * Test Flow:
 * Each scenario builds on real HTTP requests to the API endpoints,
 * validating database state, blob storage, and response contracts.
 */

import { readFileSync, statSync } from 'fs';
import { join } from 'path';
import { beforeEach, describe, expect, it } from 'vitest';
import { StorageService } from '../../src/data/storage.js';
import type { Document } from '../../src/models/document.js';
import { createDocumentService } from '../../src/services/index.js';
import { getStorageConnectionString } from '../../src/utils/config.js';

const FUNCTION_BASE_URL = process.env.FUNCTION_APP_URL || 'http://localhost:7071';

const now = new Date();
const month = String(now.getMonth() + 1).padStart(2, '0');
const year = String(now.getFullYear()).slice(-2);
const testType = 'E2E';

const testNames: string[] = ['UPLOAD'];
const testVendorNames: string[] = testNames.map(
  (name) => `${testType}_TEST_${name}_${month}_${year}`
);

/**
 * Helper: Upload a document via HTTP POST
 * Tracks vendor name for cleanup
 */
async function uploadDocument(vendorName: string, pdfPath: string) {
  const pdfFullPath = join(__dirname, pdfPath);
  const pdfBuffer = readFileSync(pdfFullPath);
  const pdfFileName = pdfPath.split('/').pop() || 'document.pdf';

  const formData = new FormData();
  formData.append('file', new Blob([pdfBuffer], { type: 'application/pdf' }), pdfFileName);
  formData.append('vendorName', vendorName);

  const response = await fetch(`${FUNCTION_BASE_URL}api/documents/upload`, {
    method: 'POST',
    body: formData,
  });
  const res = await response.json();
  // console.log('res:', res);
  return {
    status: response.status,
    data: res,
  };
}

// /**
//  * Helper: Reprocess a document (create new version)
//  */
// async function reprocessDocument(documentId: string) {
//   const response = await fetch(`${FUNCTION_BASE_URL}/api/documents/${documentId}/reprocess`, {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//   });

//   return {
//     status: response.status,
//     data: await response.json(),
//   };
// }

// /**
//  * Helper: Confirm mapping (export to production)
//  */
// async function confirmMapping(documentId: string) {
//   const response = await fetch(`${FUNCTION_BASE_URL}/api/documents/${documentId}/confirm`, {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//   });

//   return {
//     status: response.status,
//     data: await response.json(),
//   };
// }

// /**
//  * Helper: Delete a specific run (version)
//  */
// async function deleteRun(documentId: string, runId: string) {
//   const response = await fetch(
//     `${FUNCTION_BASE_URL}/api/documents/${documentId}/versions/${runId}`,
//     {
//       method: 'DELETE',
//     }
//   );

//   return {
//     status: response.status,
//     data: await response.json(),
//   };
// }

// /**
//  * Helper: Delete a vendor (cascade to all documents)
//  */
// async function deleteVendor(vendorName: string) {
//   const response = await fetch(`${FUNCTION_BASE_URL}/api/vendors/${vendorName}`, {
//     method: 'DELETE',
//   });

//   return {
//     status: response.status,
//     data: await response.json(),
//   };
// }

// /**
//  * Helper: Delete a specific document
//  */
// async function deleteDocument(documentId: string) {
//   const response = await fetch(`${FUNCTION_BASE_URL}/api/documents/${documentId}`, {
//     method: 'DELETE',
//   });

//   return {
//     status: response.status,
//     data: await response.json(),
//   };
// }

// /**
//  * Helper: Get documents (query results)
//  */
// async function getDocuments(queryParams: Record<string, string> = {}) {
//   const params = new URLSearchParams(queryParams);
//   const response = await fetch(`${FUNCTION_BASE_URL}/api/documents?${params}`);

//   return {
//     status: response.status,
//     data: await response.json(),
//   };
// }

/**
 * Helper: Wait for document to reach expected processing status
 *
 * Polls DocumentService.getProcessStatus() every 2 seconds until:
 * - Expected status is reached (returns void - success!)
 * - Document fails processing (throws error - test should fail)
 * - Timeout is reached (throws error - test should fail)
 *
 * Error Handling Philosophy:
 * Throwing errors is correct for E2E tests because:
 * - Vitest/Jest fail the current test but continue to next test
 * - Failed processing or timeouts ARE test failures
 * - Tests should fail fast and report the issue
 *
 * @param resultId - Document ID to poll
 * @param expectedStatus - Status to wait for (default: 'completed')
 * @param maxWaitMs - Maximum wait time in milliseconds (default: 180s)
 * @throws Error if processing fails or times out
 */
async function pollDocumentStatus(
  resultId: string,
  expectedStatus: 'completed' | 'failed' = 'completed',
  maxWaitMs: number = 180000
): Promise<void> {
  const startTime = Date.now();
  const documentService = await createDocumentService();

  while (Date.now() - startTime < maxWaitMs) {
    const status = await documentService.getProcessStatus(resultId);

    // Success - reached expected status
    if (status === expectedStatus) {
      return;
    }

    // Fail fast - processing failed
    if (status === 'failed' && expectedStatus !== 'failed') {
      throw new Error(
        `Document processing failed (resultId: ${resultId}). Check logs for details.`
      );
    }

    // Wait 2 seconds before next poll
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  // Timeout - polling took too long
  throw new Error(
    `Timeout: Document did not reach status '${expectedStatus}' after ${maxWaitMs}ms (resultId: ${resultId})`
  );
}

/**
 * Helper: Get full document record from DocumentService
 *
 * Fetches the complete Document interface after processing completes.
 * Separate from waitForCompletion to follow single-responsibility principle.
 *
 * @param resultId - Document ID to fetch
 * @returns Full Document record with all fields
 */
async function getDocument(resultId: string): Promise<Document> {
  const documentService = await createDocumentService();
  return await documentService.getDocument(resultId);
}

/**
 * Helper: Get blob properties using StorageService
 */
async function getBlobProperties(containerName: string, blobPath: string) {
  const storageService = new StorageService(getStorageConnectionString());
  return await storageService.getBlobProperties(containerName, blobPath);
}

/**
 * Helper: Clean test data using VendorService
 *
 * Uses VendorService (tested by integration tests) to ensure proper cleanup
 * of both database records and blob storage. Only deletes tracked test vendors,
 * leaving other data intact.
 */

describe('E2E: Document Lifecycle Management', () => {
  beforeEach(async () => {
    const documentService = await createDocumentService();
    // Clean up test data from previous runs using VendorService
    // This ensures proper cleanup of both DB records and blobs
    await Promise.all(
      testVendorNames.map(async (vendorName) => {
        await documentService.deleteByVendorName(vendorName);
      })
    );
  });

  /**
   * SCENARIO 1: Complete Upload-to-Processing Workflow
   * Setup: none
   * Action: Upload vendor-light.pdf → wait for complete processing
   * Assertions:
   *
   * HTTP Response:
   * - Status 201
   * - Returns resultId, documentPath, vendorName, status='pending'
   *
   * Blob Storage (after completion):
   * - Blob exists at correct path
   * - Content-Type is 'application/pdf'
   * - File size matches uploaded file
   * - Path follows pattern: VENDOR_MM_YY/filename
   *
   * Database Record (after completion):
   * Deterministic fields:
   * - vendor_name matches input
   * - document_path matches expected pattern
   * - document_type is 'application/pdf'
   * - reprocessing_count is 0
   * - parent_document_id is null
   * - processing_status is 'completed'
   * - export_status is 'not_exported'
   *
   * Non-deterministic (validate existence/type):
   * - result_id exists (UUID)
   * - doc_intel_extracted_text exists and non-empty
   * - doc_intel_page_count > 0
   * - doc_intel_confidence_score is number between 0-1
   * - ai_mapping_result exists and is valid JSON
   * - ai_model_used exists
   * - product_count > 0
   * - created_at and updated_at exist
   */
  it('should complete full upload-to-processing workflow successfully', async () => {
    const testName = 'UPLOAD';
    const vendorName = `${testType}_TEST_${testName}_${month}_${year}`;
    const pdfPath = '../fixtures/vendor-light.pdf';
    const pdfFullPath = join(__dirname, pdfPath);
    const pdfFileName = 'vendor-light.pdf';
    const pdfFileSize = statSync(pdfFullPath).size;

    // Act: Upload document
    const uploadResult = await uploadDocument(vendorName, pdfPath);

    // Assert HTTP response (immediate)
    expect(uploadResult.status).toBe(201);
    expect(uploadResult.data).toHaveProperty('resultId');
    expect(uploadResult.data).toHaveProperty('filePath');
    expect(uploadResult.data.vendorName).toBe(vendorName);
    expect(uploadResult.data.status).toBe('pending');

    const resultId = uploadResult.data.resultId;
    const documentPath = uploadResult.data.filePath;

    // Wait for complete processing (OCR + AI mapping)
    await pollDocumentStatus(resultId, 'completed');

    // Get full document record after completion
    const completedRecord = await getDocument(resultId);

    // === BLOB STORAGE VERIFICATION ===

    // Blob properties should be correct
    const blobProps = await getBlobProperties('uploads', documentPath);
    expect(blobProps.contentType).toBe('application/pdf');
    expect(blobProps.contentLength).toBe(pdfFileSize);

    // Path should follow pattern: VENDOR_MM_YY/filename
    expect(documentPath).toMatch(new RegExp(`^${vendorName}/.*\\.pdf$`));
    expect(documentPath).toContain(pdfFileName);

    // === DATABASE RECORD VERIFICATION ===

    // Deterministic fields
    expect(completedRecord.vendor_name).toBe(vendorName);
    expect(completedRecord.document_path).toBe(documentPath);
    expect(completedRecord.document_type).toBe('application/pdf');
    expect(completedRecord.reprocessing_count).toBe(0);
    expect(completedRecord.parent_document_id).toBeNull();
    expect(completedRecord.processing_status).toBe('completed');
    expect(completedRecord.export_status).toBe('not_exported');

    // Non-deterministic fields (validate existence and type)
    expect(completedRecord.result_id).toBe(resultId);
    // expect(typeof completedRecord.doc_intel_extracted_text).toBe('string');
    // expect(completedRecord.doc_intel_extracted_text.length).toBeGreaterThan(0);
    expect(completedRecord.doc_intel_page_count).toBeGreaterThan(0);
    // we havent yet set doc_intel_confidence_score, so the following are commented out
    // expect(typeof completedRecord.doc_intel_confidence_score).toBe('number');
    // expect(completedRecord.doc_intel_confidence_score).toBeGreaterThanOrEqual(0);
    // expect(completedRecord.doc_intel_confidence_score).toBeLessThanOrEqual(1);

    // AI mapping results
    expect(typeof completedRecord.ai_mapping_result).toBe('string');
    const aiMapping = JSON.parse(completedRecord.ai_mapping_result || '');
    expect(aiMapping).toHaveProperty('products');
    expect(Array.isArray(aiMapping.products)).toBe(true);

    expect(typeof completedRecord.ai_model_used).toBe('string');
    expect(completedRecord.ai_model_used?.length).toBeGreaterThan(0);

    expect(completedRecord.product_count).toBeGreaterThan(0);
    expect(aiMapping.products.length).toBe(completedRecord.product_count);

    expect(completedRecord.created_at).toBeInstanceOf(Date);
    expect(completedRecord.updated_at).toBeInstanceOf(Date);
  }, 300000); // 5 minutes for complete processing

  //   /**
  //    * SCENARIO 2: Reprocess Creates Version
  //    * Setup: successful upload + wait for completion
  //    * Action: POST /api/documents/{id}/reprocess
  //    * Assertions:
  //    * - HTTP 200 response
  //    * - Returns newResultId, version: 1, parentDocumentId
  //    * - Database has 2 records for vendor
  //    * - Version 0 (root): parent_document_id = null, reprocessing_count = 0
  //    * - Version 1: parent_document_id = root ID, reprocessing_count = 1
  //    * - New version has status 'ocr_complete', null AI mapping fields
  //    */
  //   it('should create new version when reprocessing document', async () => {
  //     const vendorName = `${testType}_TEST_${normalizedDesc('REPROCESS')}_${month}_${year}`;

  //     // Setup: Upload and wait for completion
  //     const uploadResult = await uploadDocument(vendorName);
  //     const rootId = uploadResult.data.resultId;
  //     await pollDocumentStatus(rootId, 'completed');

  //     // Act: Reprocess
  //     const reprocessResult = await reprocessDocument(rootId);

  //     // Assert HTTP response
  //     expect(reprocessResult.status).toBe(200);
  //     expect(reprocessResult.data).toHaveProperty('newResultId');
  //     expect(reprocessResult.data.version).toBe(1);
  //     expect(reprocessResult.data.parentDocumentId).toBe(rootId);

  //     // Assert DB state
  //     const dbRecords = await getVendorDocuments(vendorName);
  //     expect(dbRecords).toHaveLength(2);

  //     // Verify version 0 (root)
  //     const rootRecord = dbRecords.find((r) => r.reprocessing_count === 0);
  //     expect(rootRecord.result_id).toBe(rootId);
  //     expect(rootRecord.parent_document_id).toBeNull();
  //     expect(rootRecord.processing_status).toBe('completed');

  //     // Verify version 1 (reprocessed)
  //     const v1Record = dbRecords.find((r) => r.reprocessing_count === 1);
  //     expect(v1Record.result_id).toBe(reprocessResult.data.newResultId);
  //     expect(v1Record.parent_document_id).toBe(rootId);
  //     expect(v1Record.processing_status).toBe('ocr_complete');
  //     expect(v1Record.ai_mapping_result).toBeNull();
  //   }, 300000); // 5 minutes for AI processing

  //   /**
  //    * SCENARIO 3: Delete Run Removes One Version
  //    * Setup: upload + reprocess (2 versions exist)
  //    * Action: DELETE /api/documents/{id}/versions/{runId} (delete version 1)
  //    * Assertions:
  //    * - HTTP 200 response
  //    * - Returns documentId, version: 1
  //    * - Database has 1 record (only version 0 remains)
  //    * - Version 1 deleted
  //    */
  //   it('should delete specific version without affecting root', async () => {
  //     const vendorName = generateTestVendorName('DELETE_RUN');

  //     // Setup: Upload and reprocess
  //     const uploadResult = await uploadDocument(vendorName);
  //     const rootId = uploadResult.data.resultId;
  //     await pollDocumentStatus(rootId, 'completed');

  //     const reprocessResult = await reprocessDocument(rootId);
  //     const v1Id = reprocessResult.data.newResultId;

  //     // Verify 2 versions exist
  //     let dbRecords = await getVendorDocuments(vendorName);
  //     expect(dbRecords).toHaveLength(2);

  //     // Act: Delete version 1
  //     const deleteResult = await deleteRun(rootId, v1Id);

  //     // Assert HTTP response
  //     expect(deleteResult.status).toBe(200);
  //     expect(deleteResult.data.documentId).toBe(v1Id);
  //     expect(deleteResult.data.version).toBe(1);

  //     // Assert DB state
  //     dbRecords = await getVendorDocuments(vendorName);
  //     expect(dbRecords).toHaveLength(1);
  //     expect(dbRecords[0].result_id).toBe(rootId);
  //     expect(dbRecords[0].reprocessing_count).toBe(0);
  //   }, 300000);

  //   /**
  //    * SCENARIO 4: Reprocess After Delete Run
  //    * Setup: upload + reprocess + delete run (only root remains)
  //    * Action: POST /api/documents/{id}/reprocess
  //    * Assertions:
  //    * - HTTP 200 response
  //    * - Returns version: 1 (recreates version 1)
  //    * - Database has 2 records again
  //    * - New version 1 has different result_id than deleted version
  //    */
  //   it('should allow reprocessing after deleting a version', async () => {
  //     const vendorName = generateTestVendorName('REPROCESS_AFTER_DELETE');

  //     // Setup: Upload, reprocess, delete version 1
  //     const uploadResult = await uploadDocument(vendorName);
  //     const rootId = uploadResult.data.resultId;
  //     await pollDocumentStatus(rootId, 'completed');

  //     const firstReprocess = await reprocessDocument(rootId);
  //     const firstV1Id = firstReprocess.data.newResultId;

  //     await deleteRun(rootId, firstV1Id);

  //     // Verify only root remains
  //     let dbRecords = await getVendorDocuments(vendorName);
  //     expect(dbRecords).toHaveLength(1);

  //     // Act: Reprocess again
  //     const secondReprocess = await reprocessDocument(rootId);
  //     const secondV1Id = secondReprocess.data.newResultId;

  //     // Assert HTTP response
  //     expect(secondReprocess.status).toBe(200);
  //     expect(secondReprocess.data.version).toBe(1);
  //     expect(secondV1Id).not.toBe(firstV1Id); // Different UUID

  //     // Assert DB state
  //     dbRecords = await getVendorDocuments(vendorName);
  //     expect(dbRecords).toHaveLength(2);
  //     expect(dbRecords[0].result_id).toBe(rootId);
  //     expect(dbRecords[1].result_id).toBe(secondV1Id);
  //     expect(dbRecords[1].reprocessing_count).toBe(1);
  //   }, 300000);

  //   /**
  //    * SCENARIO 5: Delete Vendor Cascade
  //    * Setup: upload + reprocess (2 versions exist)
  //    * Action: DELETE /api/vendors/{name}
  //    * Assertions:
  //    * - HTTP 200 response
  //    * - Returns documentsDeleted: 2, blobsDeleted >= 0
  //    * - Database has 0 records for vendor
  //    * - Both root and version deleted
  //    */
  //   it('should cascade delete all versions when deleting vendor', async () => {
  //     const vendorName = generateTestVendorName('DELETE_VENDOR');

  //     // Setup: Upload and reprocess
  //     const uploadResult = await uploadDocument(vendorName);
  //     const rootId = uploadResult.data.resultId;
  //     await pollDocumentStatus(rootId, 'completed');

  //     await reprocessDocument(rootId);

  //     // Verify 2 versions exist
  //     let dbRecords = await getVendorDocuments(vendorName);
  //     expect(dbRecords).toHaveLength(2);

  //     // Act: Delete vendor
  //     const deleteResult = await deleteVendor(vendorName);

  //     // Assert HTTP response
  //     expect(deleteResult.status).toBe(200);
  //     expect(deleteResult.data.documentsDeleted).toBe(2);
  //     expect(deleteResult.data.blobsDeleted).toBeGreaterThanOrEqual(0);

  //     // Assert DB state
  //     dbRecords = await getVendorDocuments(vendorName);
  //     expect(dbRecords).toHaveLength(0);
  //   }, 300000);

  //   /**
  //    * SCENARIO 6: Confirm Mapping Workflow
  //    * Setup: upload + wait for completion
  //    * Action: POST /api/documents/{id}/confirm
  //    * Assertions:
  //    * - HTTP 200 response
  //    * - Returns productCount, exportedToProduction: true
  //    * - Database: export_status = 'confirmed'
  //    * - vendor_products table has products inserted
  //    * - Test idempotency: confirm again returns same data
  //    */
  //   it('should export products to vendor_products table on confirm', async () => {
  //     const vendorName = generateTestVendorName('CONFIRM');

  //     // Setup: Upload and wait for completion
  //     const uploadResult = await uploadDocument(vendorName);
  //     const rootId = uploadResult.data.resultId;
  //     await pollDocumentStatus(rootId, 'completed');

  //     // Get completed record to verify products exist
  //     const completedRecord = await getDocument(rootId);

  //     // Verify document has products
  //     expect(completedRecord.product_count).toBeGreaterThan(0);

  //     // Act: Confirm mapping
  //     const confirmResult = await confirmMapping(rootId);

  //     // Assert HTTP response
  //     expect(confirmResult.status).toBe(200);
  //     expect(confirmResult.data.productCount).toBeGreaterThan(0);
  //     expect(confirmResult.data.exportedToProduction).toBe(true);

  //     // Assert DB state
  //     const dbRecords = await getVendorDocuments(vendorName);
  //     expect(dbRecords[0].export_status).toBe('confirmed');

  //     // Assert vendor_products table
  //     const products = await getVendorProducts(vendorName);
  //     expect(products.length).toBe(confirmResult.data.productCount);
  //     expect(products[0]).toHaveProperty('sku');
  //     expect(products[0]).toHaveProperty('price');
  //     expect(products[0]).toHaveProperty('product_name');

  //     // Test idempotency: confirm again
  //     const secondConfirm = await confirmMapping(rootId);
  //     expect(secondConfirm.status).toBe(200);
  //     expect(secondConfirm.data.productCount).toBe(confirmResult.data.productCount);

  //     // Verify no duplicate products
  //     const productsAfter = await getVendorProducts(vendorName);
  //     expect(productsAfter.length).toBe(products.length);
  //   }, 300000);

  //   /**
  //    * SCENARIO 7: Error Scenarios
  //    * Tests various error conditions:
  //    * - 409: Duplicate vendor upload
  //    * - 404: Delete non-existent vendor
  //    * - 400: Delete root document with deleteRun
  //    * - 400: Confirm before completion
  //    */
  //   describe('Error Scenarios', () => {
  //     it('should return 409 when uploading duplicate vendor', async () => {
  //       const vendorName = generateTestVendorName('DUPLICATE');

  //       // First upload
  //       const firstUpload = await uploadDocument(vendorName);
  //       expect(firstUpload.status).toBe(201);

  //       // Second upload (duplicate)
  //       const secondUpload = await uploadDocument(vendorName);
  //       expect(secondUpload.status).toBe(409);
  //       expect(secondUpload.data.error).toContain('already exists');
  //     }, 30000);

  //     it('should return 404 when deleting non-existent vendor', async () => {
  //       const deleteResult = await deleteVendor('NONEXISTENT_VENDOR_12_99');

  //       expect(deleteResult.status).toBe(404);
  //       expect(deleteResult.data.message).toContain('No documents found');
  //     }, 10000);

  //     it('should return 400 when trying to delete root document with deleteRun', async () => {
  //       const vendorName = generateTestVendorName('DELETE_ROOT_ERROR');

  //       // Setup: Upload document (root only, no reprocessing)
  //       const uploadResult = await uploadDocument(vendorName);
  //       const rootId = uploadResult.data.resultId;

  //       // Act: Try to delete root with deleteRun
  //       const deleteResult = await deleteRun(rootId, rootId);

  //       // Assert
  //       expect(deleteResult.status).toBe(400);
  //       expect(deleteResult.data.error).toContain('Cannot delete root document');
  //     }, 30000);

  //     it('should return 400 when confirming document before completion', async () => {
  //       const vendorName = generateTestVendorName('CONFIRM_TOO_EARLY');

  //       // Setup: Upload but don't wait for completion
  //       const uploadResult = await uploadDocument(vendorName);
  //       const rootId = uploadResult.data.resultId;

  //       // Act: Try to confirm immediately (status = 'pending')
  //       const confirmResult = await confirmMapping(rootId);

  //       // Assert
  //       expect(confirmResult.status).toBe(400);
  //       expect(confirmResult.data.error).toContain('Document is not ready for confirmation');
  //     }, 30000);

  //     it('should return 404 when reprocessing non-existent document', async () => {
  //       const fakeId = '00000000-0000-0000-0000-000000000000';

  //       const reprocessResult = await reprocessDocument(fakeId);

  //       expect(reprocessResult.status).toBe(404);
  //       expect(reprocessResult.data.error).toContain('not found');
  //     }, 10000);

  //     it('should return 404 when deleting non-existent document', async () => {
  //       const fakeId = '00000000-0000-0000-0000-000000000000';

  //       const deleteResult = await deleteDocument(fakeId);

  //       expect(deleteResult.status).toBe(404);
  //       expect(deleteResult.data.error).toContain('not found');
  //     }, 10000);
  //   });
});
