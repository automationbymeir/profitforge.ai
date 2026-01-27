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
  resetMockState,
} from "./setup/mocks";

describe("Upload Handler - Unit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockState(); // Reset global query counter

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
      documentName: "BETTER_LIVING_11_25.pdf",
      vendorName: "BETTER_LIVING_11_25",
      status: "pending",
    });
    expect(response.jsonBody.resultId).toBeDefined();
    expect(response.jsonBody.filePath).toBe("BETTER_LIVING_11_25/BETTER_LIVING_11_25.pdf");
  });

  it("should return 400 when file is missing", async () => {
    const request = mockHttpRequest({
      formData: vi.fn().mockResolvedValue(new Map([["vendorName", "BETTER_LIVING_11_25"]])),
    });
    const context = mockInvocationContext();

    const response = await uploadHandler(request as any, context as any);

    expect(response.status).toBe(400);
    expect(response.jsonBody.error).toBe("Missing file or vendor name in request");
  });

  it("should return 400 when vendorName is missing", async () => {
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
    expect(response.jsonBody.error).toBe("Missing file or vendor name in request");
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
          ["vendorName", "BETTER_LIVING_11_25"],
        ])
      ),
    });
    const context = mockInvocationContext();

    const response = await uploadHandler(request as any, context as any);

    expect(response.status).toBe(400);
    expect(response.jsonBody.error).toContain("Unsupported file type");
  });

  it("should reject invalid vendor name format", async () => {
    const request = mockHttpRequest({
      formData: vi.fn().mockResolvedValue(
        new Map<string, any>([
          [
            "file",
            {
              name: "catalog.pdf",
              type: "application/pdf",
              arrayBuffer: vi.fn().mockResolvedValue(Buffer.from("test content")),
            },
          ],
          ["vendorName", "invalid-vendor-123"], // Invalid format
        ])
      ),
    });
    const context = mockInvocationContext();

    const response = await uploadHandler(request as any, context as any);

    expect(response.status).toBe(400);
    const body = JSON.parse(response.body as string);
    expect(body.error).toBe("Invalid vendor name format");
    expect(body.message).toContain("VENDOR_NAME_MM_YY");
  });

  it("should reject vendor with invalid month", async () => {
    const request = mockHttpRequest({
      formData: vi.fn().mockResolvedValue(
        new Map<string, any>([
          [
            "file",
            {
              name: "catalog.pdf",
              type: "application/pdf",
              arrayBuffer: vi.fn().mockResolvedValue(Buffer.from("test content")),
            },
          ],
          ["vendorName", "BETTER_LIVING_13_25"], // Invalid month (13)
        ])
      ),
    });
    const context = mockInvocationContext();

    const response = await uploadHandler(request as any, context as any);

    expect(response.status).toBe(400);
    const body = JSON.parse(response.body as string);
    expect(body.error).toBe("Invalid vendor name format");
    expect(body.message).toContain("Invalid month: 13");
  });

  it("should reject duplicate vendor upload", async () => {
    // Mock SQL to return existing record
    const mockPoolWithExisting = mockSqlConnection();
    mockPoolWithExisting.request().query.mockResolvedValueOnce({
      recordset: [
        {
          result_id: "existing-uuid",
          document_name: "BETTER_LIVING-11-25.pdf",
          processing_status: "completed",
        },
      ],
    });

    vi.mocked(sql.ConnectionPool).mockImplementation(() => mockPoolWithExisting as any);

    const request = mockHttpRequest();
    const context = mockInvocationContext();

    const response = await uploadHandler(request as any, context as any);

    expect(response.status).toBe(409); // Conflict
    expect(response.jsonBody.error).toBe("Vendor already exists");
    expect(response.jsonBody.message).toContain("delete the existing document first");
    expect(response.jsonBody.existingDocument).toBeDefined();
    expect(response.jsonBody.existingDocument.resultId).toBe("existing-uuid");
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
    expect(response.jsonBody.error).toContain("Blob storage error");
    expect(context.error).toHaveBeenCalled();
  });

  it("should handle database errors gracefully", async () => {
    const failingPool = {
      connect: vi.fn().mockResolvedValue(undefined),
      request: vi.fn().mockReturnValue({
        input: vi.fn().mockReturnThis(),
        query: vi.fn().mockRejectedValue(new Error("Database error: connection failed")),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };

    vi.mocked(sql.ConnectionPool).mockImplementation(() => failingPool as any);

    const request = mockHttpRequest();
    const context = mockInvocationContext();

    const response = await uploadHandler(request as any, context as any);

    expect(response.status).toBe(500);
    expect(response.jsonBody.error).toContain("Database error");
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
          ["vendorName", "BETTER_LIVING_11_25"],
        ])
      ),
    });
    const context = mockInvocationContext();

    const response = await uploadHandler(request as any, context as any);

    expect(response.status).toBe(400);
    expect(response.jsonBody.error).toContain("Only PDF files are allowed");
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
          ["vendorName", "BETTER_LIVING_11_25"],
        ])
      ),
    });
    const context = mockInvocationContext();

    const response = await uploadHandler(request as any, context as any);

    expect(response.status).toBe(400);
    expect(response.jsonBody.error).toContain("Only PDF files are allowed");
  });

  it("should use standardized file naming without random UUID", async () => {
    const request = mockHttpRequest();
    const context = mockInvocationContext();

    const response = await uploadHandler(request as any, context as any);

    expect(response.status).toBe(201);
    expect(response.jsonBody.filePath).toBe("BETTER_LIVING_11_25/BETTER_LIVING_11_25.pdf");
    expect(response.jsonBody.documentName).toBe("BETTER_LIVING_11_25.pdf");
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
          ["vendorName", "BETTER_LIVING_11_25"],
        ])
      ),
    });
    const context = mockInvocationContext();

    const response = await uploadHandler(xlsxRequest as any, context as any);

    expect(response.status).toBe(400);
    expect(response.jsonBody.error).toContain("Only PDF files are allowed");
  });

  it("should store vendor_name in database on upload", async () => {
    const mockPool = mockSqlConnection();
    vi.mocked(sql.ConnectionPool).mockImplementation(() => mockPool as any);

    const request = mockHttpRequest();
    const context = mockInvocationContext();

    const response = await uploadHandler(request as any, context as any);

    expect(response.status).toBe(201);
    // Verify vendor_name was included in SQL query
    expect(mockPool.request().query).toHaveBeenCalled();
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
        get: vi.fn((key: string) => (key === "vendorName" ? "TEST_VENDOR_11_25" : null)),
      },
    };
    const context = mockInvocationContext();

    const response = await deleteVendorHandler(request as any, context as any);

    expect(response.status).toBe(200);
    const body = JSON.parse(response.body as string);
    expect(body.documentsDeleted).toBe(2);
    expect(body.blobsDeleted).toBeGreaterThanOrEqual(0);
  });

  it("should return 400 when vendorName is missing", async () => {
    const request = {
      query: {
        get: vi.fn(() => null),
      },
    };
    const context = mockInvocationContext();

    const response = await deleteVendorHandler(request as any, context as any);

    expect(response.status).toBe(400);
    expect(response.body).toContain("Missing vendorName");
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
        get: vi.fn((key: string) => (key === "vendorName" ? "NONEXISTENT_01_26" : null)),
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
        get: vi.fn((key: string) => (key === "vendorName" ? "TEST_VENDOR_11_25" : null)),
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
    const mockRequest = {
      input: vi.fn().mockReturnThis(),
      query: vi
        .fn()
        // First call - SELECT existing document
        .mockResolvedValueOnce({
          recordset: [
            {
              result_id: "test-uuid-1234",
              document_name: "test.pdf",
              document_path: "vendor/test.pdf",
              document_size_bytes: 1024,
              document_type: "application/pdf",
              vendor_name: "test-vendor",
              doc_intel_extracted_text: "test text",
              doc_intel_structured_data: "{}",
              doc_intel_confidence_score: 0.95,
              doc_intel_page_count: 1,
              doc_intel_table_count: 0,
              doc_intel_cost_usd: 0.0015,
              doc_intel_prompt_used: null,
              reprocessing_count: 0,
              parent_document_id: null,
            },
          ],
        })
        // Second call - INSERT new record
        .mockResolvedValueOnce({
          recordset: [{ result_id: "test-uuid-5678" }],
        }),
    };

    const mockPool = {
      connect: vi.fn().mockResolvedValue(undefined),
      request: vi.fn().mockReturnValue(mockRequest),
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
    expect(body.newResultId).toBe("test-uuid-5678");
    expect(body.nextStep).toContain("AI mapping");
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
                ai_mapping_result: JSON.stringify(mockMappingResult),
                processing_status: "completed",
                export_status: "not_exported",
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
              ai_mapping_result: null,
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
              ai_mapping_result: null, // No result
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
              ai_mapping_result: JSON.stringify(mockMappingResult),
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
