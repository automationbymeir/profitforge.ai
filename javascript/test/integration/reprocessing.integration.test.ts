/**
 * Integration Test - Reprocessing API
 *
 * Tests the POST /api/reprocessMapping endpoint using test database.
 * Focuses on version management, not real AI processing.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { cleanTestDatabase, getDocumentByResultId, insertTestDocument } from "./helpers/test-db";

const FUNCTION_BASE_URL = "http://localhost:7071";

describe("Integration: Reprocessing API", () => {
  const testVendor = "TEST_REPROCESS_01_26";

  beforeEach(async () => {
    await cleanTestDatabase();
  });

  it("should create new version when reprocessing document", async () => {
    // Arrange - Create original document
    const originalId = await insertTestDocument({
      vendorName: testVendor,
      documentName: "catalog.pdf",
      processingStatus: "completed",
      productCount: 5,
      aiMappingResult: [{ code: "A001", price: 10.0 }],
    });

    const original = await getDocumentByResultId(originalId);
    expect(original.reprocessing_count).toBe(0);
    expect(original.parent_document_id).toBeNull();

    // Act - Trigger reprocessing
    const response = await fetch(`${FUNCTION_BASE_URL}/api/reprocessMapping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: originalId }),
    });

    // Assert
    expect(response.status).toBe(200);
    const result = await response.json();
    const newVersionId = result.newResultId;

    expect(newVersionId).toBeDefined();
    expect(newVersionId).not.toBe(originalId);

    // Verify new version has correct metadata
    const newVersion = await getDocumentByResultId(newVersionId);
    expect(newVersion.reprocessing_count).toBe(1);
    expect(newVersion.parent_document_id).toBe(originalId);
    expect(newVersion.vendor_name).toBe("TEST_REPROCESS_01_26");
    expect(newVersion.document_name).toBe("catalog.pdf");

    // Verify original unchanged
    const originalAfter = await getDocumentByResultId(originalId);
    expect(originalAfter.reprocessing_count).toBe(0);
    expect(originalAfter.parent_document_id).toBeNull();
  });

  it("should support multiple reprocessing iterations", async () => {
    // Arrange - Create original
    const originalId = await insertTestDocument({
      vendorName: "TEST_VENDOR",
      documentName: "catalog.pdf",
      processingStatus: "completed",
    });

    // Act - Reprocess twice
    const reprocess1 = await fetch(`${FUNCTION_BASE_URL}/api/reprocessMapping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: originalId }),
    });
    const result1 = await reprocess1.json();
    const version1Id = result1.newResultId;

    const reprocess2 = await fetch(`${FUNCTION_BASE_URL}/api/reprocessMapping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: version1Id }),
    });
    const result2 = await reprocess2.json();
    const version2Id = result2.newResultId;

    // Assert - Verify version chain
    const version1 = await getDocumentByResultId(version1Id);
    expect(version1.reprocessing_count).toBe(1);
    expect(version1.parent_document_id).toBe(originalId);

    const version2 = await getDocumentByResultId(version2Id);
    expect(version2.reprocessing_count).toBe(2);
    // Tree structure: all versions point to original root, not linear chain
    expect(version2.parent_document_id).toBe(originalId);
  });

  it("should reject reprocessing with invalid UUID", async () => {
    // Act
    const response = await fetch(`${FUNCTION_BASE_URL}/api/reprocessMapping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: "not-a-uuid" }),
    });

    // Assert - Currently returns 500 when SQL Server rejects invalid UUID
    expect(response.status).toBe(500);
  });

  it("should reject reprocessing non-existent document", async () => {
    // Act
    const response = await fetch(`${FUNCTION_BASE_URL}/api/reprocessMapping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: "00000000-0000-0000-0000-000000000000" }),
    });

    // Assert
    expect(response.status).toBe(404);
  });

  it("should reject reprocessing without documentId", async () => {
    // Act
    const response = await fetch(`${FUNCTION_BASE_URL}/api/reprocessMapping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    // Assert
    expect(response.status).toBe(400);
  });
});
