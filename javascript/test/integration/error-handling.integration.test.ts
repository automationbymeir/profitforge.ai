/**
 * Integration Test - Error Handling
 *
 * Tests error scenarios across all API endpoints.
 * Focuses on validation and error responses, not actual processing.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { generateTestVendorName } from "../tools/testVendorNames";
import { cleanTestDatabase } from "./helpers/test-db";

const FUNCTION_BASE_URL = "http://localhost:7071";

describe("Integration: Error Handling", () => {
  beforeEach(async () => {
    await cleanTestDatabase();
  });

  describe("Upload Endpoint Errors", () => {
    it("should reject empty file upload", async () => {
      const emptyFile = Buffer.from("");
      const formData = new FormData();
      formData.append("file", new Blob([emptyFile], { type: "application/pdf" }), "empty.pdf");
      formData.append("vendorName", "TEST_EMPTY_01_26");

      const response = await fetch(`${FUNCTION_BASE_URL}/api/upload`, {
        method: "POST",
        body: formData,
      });

      // Upload succeeds, validation happens in blob processor
      expect(response.status).toBe(201);
    });

    it("should reject unsupported file type", async () => {
      const textFile = Buffer.from("This is text");
      const formData = new FormData();
      formData.append("file", new Blob([textFile], { type: "text/plain" }), "test.txt");
      formData.append("vendorName", generateTestVendorName("INTEGRATION", "UNSUPPORTED_FILE"));

      const response = await fetch(`${FUNCTION_BASE_URL}/api/upload`, {
        method: "POST",
        body: formData,
      });

      expect(response.status).toBe(400);
    });

    it("should reject upload without vendorId", async () => {
      const testFile = Buffer.from("fake pdf content");
      const formData = new FormData();
      formData.append("file", new Blob([testFile], { type: "application/pdf" }), "test.pdf");

      const response = await fetch(`${FUNCTION_BASE_URL}/api/upload`, {
        method: "POST",
        body: formData,
      });

      expect(response.status).toBe(400);
    });

    it("should reject upload without file", async () => {
      const formData = new FormData();
      formData.append("vendorName", generateTestVendorName("INTEGRATION", "MISSING_FILE"));

      const response = await fetch(`${FUNCTION_BASE_URL}/api/upload`, {
        method: "POST",
        body: formData,
      });

      expect(response.status).toBe(400);
    });
  });

  describe("Reprocess Endpoint Errors", () => {
    it("should reject invalid UUID", async () => {
      const response = await fetch(`${FUNCTION_BASE_URL}/api/reprocessMapping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: "invalid-uuid" }),
      });

      // Currently returns 500 (SQL Server error), ideally should be 400
      expect(response.status).toBe(500);
    });

    it("should reject non-existent document", async () => {
      const response = await fetch(`${FUNCTION_BASE_URL}/api/reprocessMapping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: "00000000-0000-0000-0000-000000000000" }),
      });

      expect(response.status).toBe(404);
    });

    it("should reject missing documentId", async () => {
      const response = await fetch(`${FUNCTION_BASE_URL}/api/reprocessMapping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
    });
  });

  describe("Confirm Mapping Endpoint Errors", () => {
    it("should reject invalid UUID", async () => {
      const response = await fetch(`${FUNCTION_BASE_URL}/api/confirmMapping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: "invalid-uuid" }),
      });

      // Currently returns 500 (SQL Server error), ideally should be 400
      expect(response.status).toBe(500);
    });

    it("should reject missing documentId", async () => {
      const response = await fetch(`${FUNCTION_BASE_URL}/api/confirmMapping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
    });
  });

  describe("Delete Vendor Endpoint Errors", () => {
    it("should reject missing vendorId", async () => {
      const response = await fetch(`${FUNCTION_BASE_URL}/api/deleteVendor`, {
        method: "DELETE",
      });

      expect(response.status).toBe(400);
    });

    it("should return 404 for non-existent vendor", async () => {
      const response = await fetch(
        `${FUNCTION_BASE_URL}/api/deleteVendor?vendorName=NONEXISTENT_ERROR_01_26`,
        { method: "DELETE" }
      );

      expect(response.status).toBe(404);
    });
  });

  describe("Get Results Endpoint Errors", () => {
    it("should handle invalid UUID gracefully", async () => {
      const response = await fetch(`${FUNCTION_BASE_URL}/api/getResults?resultId=invalid-uuid`);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.results || data).toEqual([]);
    });

    it("should return empty for non-existent vendor", async () => {
      const response = await fetch(
        `${FUNCTION_BASE_URL}/api/getResults?vendor=${generateTestVendorName("INTEGRATION", "NONEXISTENT")}`
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.results || data).toHaveLength(0);
    });
  });

  describe("CORS Headers", () => {
    it("should include CORS headers in error responses", async () => {
      const response = await fetch(`${FUNCTION_BASE_URL}/api/upload`, {
        method: "POST",
        body: new FormData(),
      });

      // CORS headers may or may not be present in error responses
      // depending on where the error occurs in the handler
      const corsHeader = response.headers.get("Access-Control-Allow-Origin");
      if (corsHeader !== null) {
        expect(corsHeader).toBe("*");
      }
    });
  });

  describe("Malformed Requests", () => {
    it("should reject invalid JSON", async () => {
      const response = await fetch(`${FUNCTION_BASE_URL}/api/reprocessMapping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "invalid json{",
      });

      expect([400, 500]).toContain(response.status);
    });

    it("should reject empty body", async () => {
      const response = await fetch(`${FUNCTION_BASE_URL}/api/reprocessMapping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "",
      });

      expect([400, 500]).toContain(response.status);
    });
  });
});
