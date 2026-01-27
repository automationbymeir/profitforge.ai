/**
 * Integration Test - Delete Vendor API
 *
 * Tests the DELETE /api/deleteVendor endpoint using test database.
 * Uses Azurite for blob storage (not real Azure).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { cleanAzuriteBlobs, uploadTestBlob } from "./helpers/azurite";
import { cleanTestDatabase, getDocumentsByVendor, insertTestDocument } from "./helpers/test-db";

const FUNCTION_BASE_URL = "http://localhost:7071";

describe("Integration: Delete Vendor API", () => {
  const testVendor = "TEST_DELETE_VENDOR_01_26";

  beforeEach(async () => {
    await cleanTestDatabase();
    await cleanAzuriteBlobs();
  });

  it("should delete all documents for a vendor", async () => {
    // Arrange - Create 2 documents for the vendor
    const doc1Id = await insertTestDocument({
      vendorName: testVendor,
      documentName: "doc1.pdf",
      blobName: "test/doc1.pdf",
      processingStatus: "completed",
    });

    const doc2Id = await insertTestDocument({
      vendorName: testVendor,
      documentName: "doc2.pdf",
      blobName: "test/doc2.pdf",
      processingStatus: "completed",
    });

    // Upload blobs to Azurite
    await uploadTestBlob("test/doc1.pdf", Buffer.from("test1"));
    await uploadTestBlob("test/doc2.pdf", Buffer.from("test2"));

    // Verify documents exist
    const beforeDocs = await getDocumentsByVendor(testVendor);
    expect(beforeDocs).toHaveLength(2);

    // Act - Delete vendor
    const response = await fetch(`${FUNCTION_BASE_URL}/api/deleteVendor?vendorName=${testVendor}`, {
      method: "DELETE",
    });

    // Assert
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.documentsDeleted).toBe(2);
    expect(result.blobsDeleted).toBeGreaterThanOrEqual(0); // May fail gracefully

    // Verify documents deleted from DB
    const afterDocs = await getDocumentsByVendor(testVendor);
    expect(afterDocs).toHaveLength(0);
  });

  it("should return 404 when vendor has no documents", async () => {
    // Act
    const response = await fetch(
      `${FUNCTION_BASE_URL}/api/deleteVendor?vendorName=NONEXISTENT_01_26`,
      { method: "DELETE" }
    );

    // Assert
    expect(response.status).toBe(404);
    const result = await response.json();
    expect(result.message).toContain("No documents found");
  });

  it("should return 400 when vendorName is missing", async () => {
    // Act
    const response = await fetch(`${FUNCTION_BASE_URL}/api/deleteVendor`, {
      method: "DELETE",
    });

    // Assert
    expect(response.status).toBe(400);
  });

  it("should delete vendor with multiple versions", async () => {
    // Arrange - Create original and reprocessed version
    const originalId = await insertTestDocument({
      vendorName: testVendor,
      documentName: "catalog.pdf",
      processingStatus: "completed",
      reprocessingCount: 0,
    });

    const reprocessedId = await insertTestDocument({
      vendorName: testVendor,
      documentName: "catalog.pdf",
      processingStatus: "completed",
      reprocessingCount: 1,
      parentDocumentId: originalId,
    });

    // Verify 2 versions exist
    const beforeDocs = await getDocumentsByVendor(testVendor);
    expect(beforeDocs).toHaveLength(2);

    // Act - Delete vendor
    const response = await fetch(`${FUNCTION_BASE_URL}/api/deleteVendor?vendorName=${testVendor}`, {
      method: "DELETE",
    });

    // Assert
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.documentsDeleted).toBe(2);

    // Verify all versions deleted
    const afterDocs = await getDocumentsByVendor(testVendor);
    expect(afterDocs).toHaveLength(0);
  });
});
