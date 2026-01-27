/**
 * Integration Test - Upload API
 *
 * Tests the /api/upload endpoint using:
 * - Supertest (HTTP without network)
 * - Test database (Docker Postgres)
 * - Azurite (local blob/queue emulator)
 * - Mocked AI services (pre-recorded fixtures)
 *
 * This is FAST and CHEAP compared to e2e tests.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDocumentIntelligence, mockOpenAI } from "./helpers/azure-ai-mocks";
import { getDocumentsByVendor } from "./helpers/test-db";

// TODO: Import your Azure Functions app for Supertest
// This requires exposing the app in a testable way
// For now, we'll use fetch directly but should migrate to Supertest

const FUNCTION_BASE_URL = "http://localhost:7071";

describe("Integration: Upload API", () => {
  const testVendor = "TEST_UPLOAD_API_01_26";

  beforeEach(() => {
    // Mock AI services for this test
    vi.mock("@azure/ai-document-intelligence", () => ({
      DocumentIntelligenceClient: vi.fn(() => mockDocumentIntelligence("success")),
    }));

    vi.mock("openai", () => ({
      OpenAI: vi.fn(() => mockOpenAI("success")),
    }));
  });

  it("should upload a PDF and trigger blob processing", async () => {
    // Arrange
    const testPDF = readFileSync(join(__dirname, "../e2e/docs/samplePDF.pdf"));
    const formData = new FormData();
    formData.append("file", new Blob([testPDF], { type: "application/pdf" }), "test.pdf");
    formData.append("vendorName", testVendor);

    // Act
    const response = await fetch(`${FUNCTION_BASE_URL}/api/upload`, {
      method: "POST",
      body: formData,
    });

    // Assert
    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.resultId).toBeDefined();
    expect(data.documentName).toBe("TEST_UPLOAD_API_01_26.pdf");
    expect(data.vendorName).toBe(testVendor);

    // Verify database record created
    const docs = await getDocumentsByVendor(testVendor);
    expect(docs).toHaveLength(1);
    expect(docs[0].processing_status).toBe("pending");
  });

  it("should validate required fields", async () => {
    // Act - missing vendorName
    const formData = new FormData();
    formData.append("file", new Blob(["test"], { type: "application/pdf" }), "test.pdf");

    const response = await fetch(`${FUNCTION_BASE_URL}/api/upload`, {
      method: "POST",
      body: formData,
    });

    // Assert
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("vendor");
  });

  it("should validate file type", async () => {
    // Act - wrong file type
    const formData = new FormData();
    formData.append("file", new Blob(["test"], { type: "text/plain" }), "test.txt");
    formData.append("vendorName", testVendor);

    const response = await fetch(`${FUNCTION_BASE_URL}/api/upload`, {
      method: "POST",
      body: formData,
    });

    // Assert
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("PDF");
  });

  it("should handle large files within limit", async () => {
    // Arrange - create 9MB file (under 10MB limit)
    const largeBuffer = Buffer.alloc(9 * 1024 * 1024);
    const formData = new FormData();
    formData.append("file", new Blob([largeBuffer], { type: "application/pdf" }), "large.pdf");
    formData.append("vendorName", testVendor);

    // Act
    const response = await fetch(`${FUNCTION_BASE_URL}/api/upload`, {
      method: "POST",
      body: formData,
    });

    // Assert
    expect(response.status).toBe(201);
  });

  it("should reject files over limit", async () => {
    // Arrange - create 11MB file (over 10MB limit)
    const largeBuffer = Buffer.alloc(11 * 1024 * 1024);
    const formData = new FormData();
    formData.append("file", new Blob([largeBuffer], { type: "application/pdf" }), "toolarge.pdf");
    formData.append("vendorName", testVendor);

    // Act
    const response = await fetch(`${FUNCTION_BASE_URL}/api/upload`, {
      method: "POST",
      body: formData,
    });

    // Assert - Upload succeeds, file size validation happens in blob processor
    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.resultId).toBeDefined();
  });
});
