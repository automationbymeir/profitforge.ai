/**
 * Integration Test - Export/Confirm Mapping API
 *
 * Tests the POST /api/confirmMapping endpoint using test database.
 * Verifies products are exported to vendor_products table.
 */

import sql from "mssql";
import { beforeEach, describe, expect, it } from "vitest";
import {
  cleanTestDatabase,
  getDocumentByResultId,
  getTestDbPool,
  insertTestDocument,
} from "./helpers/test-db";

const FUNCTION_BASE_URL = "http://localhost:7071";

describe("Integration: Export/Confirm Mapping API", () => {
  const testVendor = "TEST_EXPORT_FLOW_01_26";

  beforeEach(async () => {
    await cleanTestDatabase();
  });

  it("should export products to vendor_products table", async () => {
    // Arrange - Create document with products
    const products = [
      { name: "Product 1", sku: "A001", price: 10.0, unit: "case", description: "Product 1 desc" },
      { name: "Product 2", sku: "A002", price: 20.0, unit: "case", description: "Product 2 desc" },
    ];

    const documentId = await insertTestDocument({
      vendorName: "TEST_VENDOR",
      documentName: "catalog.pdf",
      processingStatus: "completed",
      productCount: 2,
      aiMappingResult: { products },
    });

    // Verify initial export status
    const beforeExport = await getDocumentByResultId(documentId);
    expect(beforeExport.export_status).toBe("not_exported");

    // Act - Confirm mapping
    const response = await fetch(`${FUNCTION_BASE_URL}/api/confirmMapping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId }),
    });

    // Assert
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.productsExported).toBe(2);

    // Verify products in vendor_products table
    const db = await getTestDbPool();
    const productsResult = await db
      .request()
      .input("sourceDocId", sql.UniqueIdentifier, documentId)
      .query(
        "SELECT * FROM vvocr.vendor_products WHERE source_document_id = @sourceDocId ORDER BY sku ASC"
      );

    expect(productsResult.recordset).toHaveLength(2);
    expect(productsResult.recordset[0].vendor_name).toBe("TEST_VENDOR");
    expect(productsResult.recordset[0].sku).toBe("A001");

    // Verify export status updated to 'confirmed'
    const afterExport = await getDocumentByResultId(documentId);
    expect(afterExport.export_status).toBe("confirmed");
  });

  it("should reject confirmation with invalid UUID", async () => {
    // Act
    const response = await fetch(`${FUNCTION_BASE_URL}/api/confirmMapping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: "not-a-uuid" }),
    });

    // Assert - Currently returns 500 when SQL Server rejects invalid UUID
    expect(response.status).toBe(500);
  });

  it("should reject confirmation without documentId", async () => {
    // Act
    const response = await fetch(`${FUNCTION_BASE_URL}/api/confirmMapping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    // Assert
    expect(response.status).toBe(400);
  });

  it("should reject confirmation if no products to export", async () => {
    // Arrange - Document with no products
    const documentId = await insertTestDocument({
      vendorName: "TEST_VENDOR",
      documentName: "empty.pdf",
      processingStatus: "completed",
      productCount: 0,
    });

    // Act
    const response = await fetch(`${FUNCTION_BASE_URL}/api/confirmMapping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId }),
    });

    // Assert
    expect(response.status).toBe(400);
  });

  it("should handle double confirmation gracefully", async () => {
    // Arrange
    const products = [{ name: "Product 1", sku: "A001", price: 10.0, unit: "each" }];
    const documentId = await insertTestDocument({
      vendorName: "TEST_VENDOR",
      documentName: "catalog.pdf",
      processingStatus: "completed",
      productCount: 1,
      aiMappingResult: { products },
    });

    // Act - Confirm twice
    const response1 = await fetch(`${FUNCTION_BASE_URL}/api/confirmMapping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId }),
    });

    const response2 = await fetch(`${FUNCTION_BASE_URL}/api/confirmMapping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId }),
    });

    // Assert - Both should succeed (idempotent)
    expect(response1.status).toBe(200);
    expect(response2.status).toBe(200);

    // Verify only 1 set of products exported (not duplicated)
    const db = await getTestDbPool();
    const productsResult = await db
      .request()
      .input("sourceDocId", sql.UniqueIdentifier, documentId)
      .query("SELECT * FROM vvocr.vendor_products WHERE source_document_id = @sourceDocId");

    expect(productsResult.recordset).toHaveLength(1);
  });
});
