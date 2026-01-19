import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock Azure SDK modules BEFORE importing the handler
vi.mock("@azure/storage-blob");
vi.mock("mssql");

import { BlobServiceClient } from "@azure/storage-blob";
import sql from "mssql";
import {
  confirmMappingHandler,
  deleteVendorHandler,
  reprocessMappingHandler,
  uploadHandler,
} from "../../src/functions/api";
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
    const body = JSON.parse(response.body as string);
    expect(body).toMatchObject({
      message: "Document uploaded successfully",
      resultId: "test-uuid-1234",
      vendorId: "test-vendor-123",
    });
    expect(body.filePath).toMatch(/test-vendor-123\/.*-test-invoice\.pdf/);
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
    const body = JSON.parse(response.body as string);
    expect(body.error).toContain("Blob storage error");
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

  it("should reject Excel files (PDF-only validation)", async () => {
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

    expect(response.status).toBe(400);
    expect(response.body).toContain("Only PDF files are allowed");
  });

  it("should reject image files (PDF-only validation)", async () => {
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

    expect(response.status).toBe(400);
    expect(response.body).toContain("Only PDF files are allowed");
  });

  it("should generate unique file paths with UUID", async () => {
    const request1 = mockHttpRequest();
    const request2 = mockHttpRequest();
    const context = mockInvocationContext();

    const response1 = await uploadHandler(request1 as any, context as any);
    const response2 = await uploadHandler(request2 as any, context as any);

    const body1 = JSON.parse(response1.body as string);
    const body2 = JSON.parse(response2.body as string);
    expect(body1.filePath).not.toBe(body2.filePath);
    expect(body1.filePath).toMatch(/test-vendor-123\/[a-f0-9-]+test-invoice\.pdf/);
  });

  it("should only accept PDF files after POC enhancement", async () => {
    const xlsxRequest = mockHttpRequest({
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

    const response = await uploadHandler(xlsxRequest as any, context as any);

    expect(response.status).toBe(400);
    expect(response.body).toContain("Only PDF files are allowed");
  });

  it("should store vendor_name in database on upload", async () => {
    const mockPool = mockSqlConnection();
    vi.mocked(sql.ConnectionPool).mockImplementation(() => mockPool as any);

    const request = mockHttpRequest({
      formData: vi.fn().mockResolvedValue(
        new Map<string, any>([
          [
            "file",
            {
              name: "catalog.pdf",
              type: "application/pdf",
              arrayBuffer: vi.fn().mockResolvedValue(Buffer.from("pdf data")),
            },
          ],
          ["vendorId", "ACME"],
        ])
      ),
    });
    const context = mockInvocationContext();

    await uploadHandler(request as any, context as any);

    // Verify vendor_name was included in SQL query
    expect(mockPool.request().query).toHaveBeenCalledWith(expect.stringContaining("vendor_name"));
  });
});

describe("Delete Vendor Handler - Unit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(BlobServiceClient.fromConnectionString).mockReturnValue(
      mockBlobServiceClient() as any
    );
    vi.mocked(sql.ConnectionPool).mockImplementation(() => mockSqlConnection() as any);
  });

  it("should successfully delete vendor documents and blobs", async () => {
    const mockPool = {
      connect: vi.fn().mockResolvedValue(undefined),
      request: vi.fn().mockReturnValue({
        input: vi.fn().mockReturnThis(),
        query: vi
          .fn()
          .mockResolvedValueOnce({
            // First query: SELECT documents
            recordset: [
              { result_id: "uuid-1", document_path: "ACME/file1.pdf" },
              { result_id: "uuid-2", document_path: "ACME/file2.pdf" },
            ],
          })
          .mockResolvedValueOnce({
            // Second query: DELETE
            rowsAffected: [2],
          }),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(sql.ConnectionPool).mockImplementation(() => mockPool as any);

    const request = {
      query: {
        get: vi.fn((key: string) => (key === "vendorId" ? "ACME" : null)),
      },
    };
    const context = mockInvocationContext();

    const response = await deleteVendorHandler(request as any, context as any);

    expect(response.status).toBe(200);
    const body = JSON.parse(response.body as string);
    expect(body.documentsDeleted).toBe(2);
    expect(body.blobsDeleted).toBeGreaterThanOrEqual(0);
  });

  it("should return 400 when vendorId is missing", async () => {
    const request = {
      query: {
        get: vi.fn(() => null),
      },
    };
    const context = mockInvocationContext();

    const response = await deleteVendorHandler(request as any, context as any);

    expect(response.status).toBe(400);
    expect(response.body).toContain("Missing vendorId");
  });

  it("should return 404 when no documents found for vendor", async () => {
    const mockPool = {
      connect: vi.fn().mockResolvedValue(undefined),
      request: vi.fn().mockReturnValue({
        input: vi.fn().mockReturnThis(),
        query: vi.fn().mockResolvedValue({
          recordset: [], // No documents found
        }),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(sql.ConnectionPool).mockImplementation(() => mockPool as any);

    const request = {
      query: {
        get: vi.fn((key: string) => (key === "vendorId" ? "NONEXISTENT" : null)),
      },
    };
    const context = mockInvocationContext();

    const response = await deleteVendorHandler(request as any, context as any);

    expect(response.status).toBe(404);
    expect(response.body).toContain("No documents found");
  });

  it("should handle blob deletion errors gracefully", async () => {
    const failingBlobClient = {
      getContainerClient: vi.fn().mockReturnValue({
        getBlockBlobClient: vi.fn().mockReturnValue({
          delete: vi.fn().mockRejectedValue(new Error("Blob not found")),
        }),
      }),
    };
    vi.mocked(BlobServiceClient.fromConnectionString).mockReturnValue(failingBlobClient as any);

    const mockPool = {
      connect: vi.fn().mockResolvedValue(undefined),
      request: vi.fn().mockReturnValue({
        input: vi.fn().mockReturnThis(),
        query: vi
          .fn()
          .mockResolvedValueOnce({
            recordset: [{ result_id: "uuid-1", document_path: "ACME/file1.pdf" }],
          })
          .mockResolvedValueOnce({
            rowsAffected: [1],
          }),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(sql.ConnectionPool).mockImplementation(() => mockPool as any);

    const request = {
      query: {
        get: vi.fn((key: string) => (key === "vendorId" ? "ACME" : null)),
      },
    };
    const context = mockInvocationContext();

    const response = await deleteVendorHandler(request as any, context as any);

    // Should still succeed even if some blobs fail
    expect(response.status).toBe(200);
    expect(context.warn).toHaveBeenCalled(); // Warning logged for blob deletion failure
  });
});

describe("Reprocess Mapping Handler - Unit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sql.ConnectionPool).mockImplementation(() => mockSqlConnection() as any);
  });

  it("should reset document status to ocr_complete", async () => {
    const mockPool = {
      connect: vi.fn().mockResolvedValue(undefined),
      request: vi.fn().mockReturnValue({
        input: vi.fn().mockReturnThis(),
        query: vi.fn().mockResolvedValue({ rowsAffected: [1] }),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(sql.ConnectionPool).mockImplementation(() => mockPool as any);

    const request = {
      json: vi.fn().mockResolvedValue({ documentId: "test-uuid-1234" }),
    };
    const context = mockInvocationContext();

    const response = await reprocessMappingHandler(request as any, context as any);

    expect(response.status).toBe(200);
    const body = JSON.parse(response.body as string);
    expect(body.documentId).toBe("test-uuid-1234");
    expect(body.nextStep).toContain("aiProductMapper");
  });

  it("should return 400 when documentId is missing", async () => {
    const request = {
      json: vi.fn().mockResolvedValue({}),
    };
    const context = mockInvocationContext();

    const response = await reprocessMappingHandler(request as any, context as any);

    expect(response.status).toBe(400);
    expect(response.body).toContain("Missing documentId");
  });

  it("should handle database errors", async () => {
    const mockPool = {
      connect: vi.fn().mockResolvedValue(undefined),
      request: vi.fn().mockReturnValue({
        input: vi.fn().mockReturnThis(),
        query: vi.fn().mockRejectedValue(new Error("Database error")),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(sql.ConnectionPool).mockImplementation(() => mockPool as any);

    const request = {
      json: vi.fn().mockResolvedValue({ documentId: "test-uuid-1234" }),
    };
    const context = mockInvocationContext();

    const response = await reprocessMappingHandler(request as any, context as any);

    expect(response.status).toBe(500);
  });
});

describe("Confirm Mapping Handler - Unit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sql.ConnectionPool).mockImplementation(() => mockSqlConnection() as any);
  });

  it("should export products to vendor_products table", async () => {
    const mockMappingResult = {
      vendor: "ACME",
      products: [
        { name: "Widget A", sku: "W001", price: 19.99, unit: "ea" },
        { name: "Widget B", sku: "W002", price: 29.99, unit: "box" },
      ],
    };

    const mockPool = {
      connect: vi.fn().mockResolvedValue(undefined),
      request: vi.fn().mockReturnValue({
        input: vi.fn().mockReturnThis(),
        query: vi
          .fn()
          .mockResolvedValueOnce({
            // SELECT document
            recordset: [
              {
                result_id: "test-uuid-1234",
                document_name: "catalog.pdf",
                vendor_name: "ACME",
                llm_mapping_result: JSON.stringify(mockMappingResult),
                processing_status: "completed",
                export_status: "pending",
              },
            ],
          })
          .mockResolvedValue({ rowsAffected: [1] }), // INSERT products & UPDATE status
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(sql.ConnectionPool).mockImplementation(() => mockPool as any);

    const request = {
      json: vi.fn().mockResolvedValue({ documentId: "test-uuid-1234" }),
    };
    const context = mockInvocationContext();

    const response = await confirmMappingHandler(request as any, context as any);

    expect(response.status).toBe(200);
    const body = JSON.parse(response.body as string);
    expect(body.productsExported).toBe(2);
    expect(body.vendor).toBe("ACME");
  });

  it("should return 400 when documentId is missing", async () => {
    const request = {
      json: vi.fn().mockResolvedValue({}),
    };
    const context = mockInvocationContext();

    const response = await confirmMappingHandler(request as any, context as any);

    expect(response.status).toBe(400);
    expect(response.body).toContain("Missing documentId");
  });

  it("should return 404 when document not found", async () => {
    const mockPool = {
      connect: vi.fn().mockResolvedValue(undefined),
      request: vi.fn().mockReturnValue({
        input: vi.fn().mockReturnThis(),
        query: vi.fn().mockResolvedValue({
          recordset: [], // No document found
        }),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(sql.ConnectionPool).mockImplementation(() => mockPool as any);

    const request = {
      json: vi.fn().mockResolvedValue({ documentId: "nonexistent-uuid" }),
    };
    const context = mockInvocationContext();

    const response = await confirmMappingHandler(request as any, context as any);

    expect(response.status).toBe(404);
    expect(response.body).toContain("Document not found");
  });

  it("should return 400 when document status is not completed", async () => {
    const mockPool = {
      connect: vi.fn().mockResolvedValue(undefined),
      request: vi.fn().mockReturnValue({
        input: vi.fn().mockReturnThis(),
        query: vi.fn().mockResolvedValue({
          recordset: [
            {
              result_id: "test-uuid-1234",
              processing_status: "pending", // Not completed
              llm_mapping_result: null,
            },
          ],
        }),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(sql.ConnectionPool).mockImplementation(() => mockPool as any);

    const request = {
      json: vi.fn().mockResolvedValue({ documentId: "test-uuid-1234" }),
    };
    const context = mockInvocationContext();

    const response = await confirmMappingHandler(request as any, context as any);

    expect(response.status).toBe(400);
    expect(response.body).toContain("Must be 'completed'");
  });

  it("should return 400 when no mapping result available", async () => {
    const mockPool = {
      connect: vi.fn().mockResolvedValue(undefined),
      request: vi.fn().mockReturnValue({
        input: vi.fn().mockReturnThis(),
        query: vi.fn().mockResolvedValue({
          recordset: [
            {
              result_id: "test-uuid-1234",
              processing_status: "completed",
              llm_mapping_result: null, // No result
            },
          ],
        }),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(sql.ConnectionPool).mockImplementation(() => mockPool as any);

    const request = {
      json: vi.fn().mockResolvedValue({ documentId: "test-uuid-1234" }),
    };
    const context = mockInvocationContext();

    const response = await confirmMappingHandler(request as any, context as any);

    expect(response.status).toBe(400);
    expect(response.body).toContain("No mapping result available");
  });

  it("should return 400 when products array is empty", async () => {
    const mockMappingResult = {
      vendor: "ACME",
      products: [], // Empty
    };

    const mockPool = {
      connect: vi.fn().mockResolvedValue(undefined),
      request: vi.fn().mockReturnValue({
        input: vi.fn().mockReturnThis(),
        query: vi.fn().mockResolvedValue({
          recordset: [
            {
              result_id: "test-uuid-1234",
              processing_status: "completed",
              llm_mapping_result: JSON.stringify(mockMappingResult),
            },
          ],
        }),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(sql.ConnectionPool).mockImplementation(() => mockPool as any);

    const request = {
      json: vi.fn().mockResolvedValue({ documentId: "test-uuid-1234" }),
    };
    const context = mockInvocationContext();

    const response = await confirmMappingHandler(request as any, context as any);

    expect(response.status).toBe(400);
    expect(response.body).toContain("No products found");
  });
});
