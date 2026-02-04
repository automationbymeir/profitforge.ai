/**
 * Integration Test - Delete Vendor Workflow
 *
 * Tests the DELETE /api/vendors endpoint using test database.
 * Uses Azurite for blob storage (not real Azure).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { DocumentRepository } from '../../../src/data/repositories/DocumentRepository.js';
import { getConnectionPool } from '../../../src/utils/database.js';
import {
  cleanAzuriteBlobs,
  cleanTestDatabase,
  uploadDocumentViaService,
} from '../utils/helpers.js';

const FUNCTION_BASE_URL = 'http://localhost:7071';

describe.skip('Integration: Delete Vendor Workflow', () => {
  // Skipped: Vendor delete endpoint is currently commented out
  // TODO: Re-enable when vendor management endpoints are restored
  const testVendor = 'TEST_DELETE_VENDOR_01_26';
  const testVendor2 = 'TEST_DELETE_VENDOR_02_26'; // Different month for second document

  beforeEach(async () => {
    await cleanTestDatabase();
    await cleanAzuriteBlobs();
  });

  it('should delete all documents for a vendor', async () => {
    // Arrange - Upload 2 documents for different vendors via service
    await uploadDocumentViaService(testVendor);
    await uploadDocumentViaService(testVendor2);

    // Verify documents exist
    const pool = await getConnectionPool();
    const documentRepo = new DocumentRepository(pool);

    const doc1 = await documentRepo.findByVendor(testVendor);
    const doc2 = await documentRepo.findByVendor(testVendor2);
    expect(doc1).toHaveLength(1);
    expect(doc2).toHaveLength(1);

    // Act - Delete first vendor
    const response = await fetch(`${FUNCTION_BASE_URL}/api/vendors/${testVendor}`, {
      method: 'DELETE',
    });

    // Assert
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.documentsDeleted).toBe(1);
    expect(result.blobsDeleted).toBeGreaterThanOrEqual(0); // May fail gracefully

    // Verify only vendor1 documents deleted from DB
    const afterDoc1 = await documentRepo.findByVendor(testVendor);
    const afterDoc2 = await documentRepo.findByVendor(testVendor2);
    expect(afterDoc1).toHaveLength(0);
    expect(afterDoc2).toHaveLength(1); // Vendor2 still exists
  });

  it('should return 404 when vendor has no documents', async () => {
    // Act
    const response = await fetch(`${FUNCTION_BASE_URL}/api/vendors/NONEXISTENT_01_26`, {
      method: 'DELETE',
    });

    // Assert
    expect(response.status).toBe(404);
    const result = await response.json();
    expect(result.message).toContain('No documents found');
  });

  it('should return 400 when vendorName is missing', async () => {
    // Act - Azure Functions will return 404 for missing route parameter
    const response = await fetch(`${FUNCTION_BASE_URL}/api/vendors/`, {
      method: 'DELETE',
    });

    // Assert - Azure Functions returns 404 for invalid route
    expect(response.status).toBe(404);
  });

  it('should delete vendor with multiple versions', async () => {
    // Arrange - Upload document, then create reprocessed version via repository
    const uploadResult = await uploadDocumentViaService(testVendor);
    const originalId = uploadResult.resultId;

    const pool = await getConnectionPool();
    const documentRepo = new DocumentRepository(pool);

    // Create reprocessed version (simulating reprocessing workflow)
    const _reprocessedId = await documentRepo.createReprocessingVersion(originalId, null);

    // Verify 2 versions exist
    const beforeDocs = await documentRepo.findByVendor(testVendor);
    expect(beforeDocs).toHaveLength(2);

    // Act - Delete vendor
    const response = await fetch(`${FUNCTION_BASE_URL}/api/vendors/${testVendor}`, {
      method: 'DELETE',
    });

    // Assert
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.documentsDeleted).toBe(2);

    // Verify all versions deleted
    const afterDocs = await documentRepo.findByVendor(testVendor);
    expect(afterDocs).toHaveLength(0);
  });
});
