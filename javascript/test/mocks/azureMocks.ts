// Mock factories for Azure services
// Used in unit tests to avoid real Azure calls

import { vi } from "vitest";

type MockFile = {
  name: string;
  type: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

type FormDataValue = string | MockFile;

export const mockBlobServiceClient = () => ({
  getContainerClient: vi.fn().mockReturnValue({
    getBlockBlobClient: vi.fn().mockReturnValue({
      upload: vi.fn().mockResolvedValue({ requestId: "mock-request-id" }),
      url: "https://mockaccount.blob.core.windows.net/uploads/test.pdf",
    }),
  }),
});

export const mockSqlConnection = () => {
  const mockRequest = {
    input: vi.fn().mockReturnThis(),
    query: vi.fn().mockResolvedValue({
      recordset: [{ result_id: "test-uuid-1234" }],
    }),
  };

  const mockPool = {
    connect: vi.fn().mockResolvedValue(undefined),
    request: vi.fn().mockReturnValue(mockRequest),
    close: vi.fn().mockResolvedValue(undefined),
  };

  return mockPool;
};

export const mockDocumentAnalysisClient = () => ({
  beginAnalyzeDocument: vi.fn().mockResolvedValue({
    pollUntilDone: vi.fn().mockResolvedValue({
      content: "Mock OCR extracted text content",
      pages: [{ pageNumber: 1 }],
      tables: [
        {
          rowCount: 2,
          columnCount: 3,
          cells: [
            { content: "Header 1", rowIndex: 0, columnIndex: 0 },
            { content: "Header 2", rowIndex: 0, columnIndex: 1 },
            { content: "Header 3", rowIndex: 0, columnIndex: 2 },
          ],
        },
      ],
    }),
  }),
});

export const mockOpenAI = () => ({
  chat: {
    completions: {
      create: vi.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                products: [
                  {
                    sku: "TEST-SKU-001",
                    name: "Test Product",
                    description: "A test product description",
                    retail_price: 99.99,
                    wholesale_price: 59.99,
                    category: "Electronics",
                    confidence: 0.95,
                  },
                ],
              }),
            },
          },
        ],
        usage: {
          prompt_tokens: 1000,
          completion_tokens: 500,
          total_tokens: 1500,
        },
      }),
    },
  },
});

export const mockInvocationContext = () => ({
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  trace: vi.fn(),
  triggerMetadata: {
    blobTrigger: "uploads/test-vendor/test-file.pdf",
  },
  invocationId: "test-invocation-id",
  traceContext: {},
  bindings: {},
  bindingData: {},
  bindingDefinitions: [],
});

export const mockHttpRequest = (overrides: Partial<any> = {}) => ({
  method: "POST",
  url: "http://localhost:7071/api/upload",
  headers: {
    "content-type": "multipart/form-data",
  },
  query: {},
  params: {},
  body: null,
  formData: vi.fn().mockResolvedValue(
    new Map<string, FormDataValue>([
      [
        "file",
        {
          name: "test-invoice.pdf",
          type: "application/pdf",
          arrayBuffer: vi.fn().mockResolvedValue(Buffer.from("test file content")),
        },
      ],
      ["vendorId", "test-vendor-123"],
    ])
  ),
  ...overrides,
});
