import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock Azure SDK modules BEFORE importing the handler
vi.mock("@azure/storage-blob");
vi.mock("mssql");

import { BlobServiceClient } from "@azure/storage-blob";
import sql from "mssql";
import { uploadHandler } from "../../src/functions/api";
import {
  mockBlobServiceClient,
  mockHttpRequest,
  mockInvocationContext,
  mockSqlConnection,
} from "../mocks/azureMocks";

describe("Upload Handler - Unit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mocks for each test
    vi.mocked(BlobServiceClient.fromConnectionString).mockReturnValue(
      mockBlobServiceClient() as any
    );
    vi.mocked(sql.ConnectionPool).mockImplementation(() => mockSqlConnection() as any);
  });

  it("should successfully upload a PDF file", async () => {
    const request = mockHttpRequest();
    const context = mockInvocationContext();

    const response = await uploadHandler(request as any, context as any);

    expect(response.status).toBe(201);
    expect(response.jsonBody).toMatchObject({
      message: "Document uploaded successfully",
      resultId: "test-uuid-1234",
      vendorId: "test-vendor-123",
    });
    expect(response.jsonBody?.filePath).toMatch(/test-vendor-123\/.*-test-invoice\.txt/);
  });

  it("should return 400 when file is missing", async () => {
    const request = mockHttpRequest({
      formData: vi.fn().mockResolvedValue(new Map([["vendorId", "test-vendor-123"]])),
    });
    const context = mockInvocationContext();

    const response = await uploadHandler(request as any, context as any);

    expect(response.status).toBe(400);
    expect(response.body).toBe("Missing file or vendorId in request");
  });

  it("should return 400 when vendorId is missing", async () => {
    const request = mockHttpRequest({
      formData: vi.fn().mockResolvedValue(
        new Map<string, any>([
          [
            "file",
            {
              name: "test.pdf",
              type: "application/pdf",
              arrayBuffer: vi.fn().mockResolvedValue(Buffer.from("test")),
            },
          ],
        ])
      ),
    });
    const context = mockInvocationContext();

    const response = await uploadHandler(request as any, context as any);

    expect(response.status).toBe(400);
    expect(response.body).toBe("Missing file or vendorId in request");
  });

  it("should return 400 for unsupported file type", async () => {
    const request = mockHttpRequest({
      formData: vi.fn().mockResolvedValue(
        new Map<string, any>([
          [
            "file",
            {
              name: "test.txt",
              type: "text/plain",
              arrayBuffer: vi.fn().mockResolvedValue(Buffer.from("test")),
            },
          ],
          ["vendorId", "test-vendor-123"],
        ])
      ),
    });
    const context = mockInvocationContext();

    const response = await uploadHandler(request as any, context as any);

    expect(response.status).toBe(400);
    expect(response.body).toContain("Unsupported file type");
  });

  it("should handle blob upload errors gracefully", async () => {
    const failingBlobClient = {
      getContainerClient: vi.fn().mockReturnValue({
        getBlockBlobClient: vi.fn().mockReturnValue({
          upload: vi.fn().mockRejectedValue(new Error("Blob storage error")),
        }),
      }),
    };

    vi.mocked(BlobServiceClient.fromConnectionString).mockReturnValue(failingBlobClient as any);

    const request = mockHttpRequest();
    const context = mockInvocationContext();

    const response = await uploadHandler(request as any, context as any);

    expect(response.status).toBe(500);
    expect(response.body).toContain("Internal Server Error");
    expect(context.error).toHaveBeenCalled();
  });

  it("should handle database errors gracefully", async () => {
    const failingPool = {
      connect: vi.fn().mockResolvedValue(undefined),
      request: vi.fn().mockReturnValue({
        input: vi.fn().mockReturnThis(),
        query: vi.fn().mockRejectedValue(new Error("Database connection failed")),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };

    vi.mocked(sql.ConnectionPool).mockImplementation(() => failingPool as any);

    const request = mockHttpRequest();
    const context = mockInvocationContext();

    const response = await uploadHandler(request as any, context as any);

    expect(response.status).toBe(500);
    expect(response.body).toContain("Database error");
    expect(failingPool.close).toHaveBeenCalled(); // Verify pool cleanup
  });

  it("should accept valid Excel files", async () => {
    const request = mockHttpRequest({
      formData: vi.fn().mockResolvedValue(
        new Map<string, any>([
          [
            "file",
            {
              name: "products.xlsx",
              type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              arrayBuffer: vi.fn().mockResolvedValue(Buffer.from("excel data")),
            },
          ],
          ["vendorId", "test-vendor-123"],
        ])
      ),
    });
    const context = mockInvocationContext();

    const response = await uploadHandler(request as any, context as any);

    expect(response.status).toBe(201);
  });

  it("should accept valid image files", async () => {
    const request = mockHttpRequest({
      formData: vi.fn().mockResolvedValue(
        new Map<string, any>([
          [
            "file",
            {
              name: "invoice.jpg",
              type: "image/jpeg",
              arrayBuffer: vi.fn().mockResolvedValue(Buffer.from("image data")),
            },
          ],
          ["vendorId", "test-vendor-123"],
        ])
      ),
    });
    const context = mockInvocationContext();

    const response = await uploadHandler(request as any, context as any);

    expect(response.status).toBe(201);
  });

  it("should generate unique file paths with UUID", async () => {
    const request1 = mockHttpRequest();
    const request2 = mockHttpRequest();
    const context = mockInvocationContext();

    const response1 = await uploadHandler(request1 as any, context as any);
    const response2 = await uploadHandler(request2 as any, context as any);

    expect(response1.jsonBody?.filePath).not.toBe(response2.jsonBody?.filePath);
    expect(response1.jsonBody?.filePath).toMatch(/test-vendor-123\/[a-f0-9-]+test-invoice\.txt/);
  });
});
