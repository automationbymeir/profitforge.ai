/**
 * Mock Factories for Unit Tests
 * ==============================
 *
 * This file provides reusable mock factories for Azure services, database utilities,
 * HTTP handlers, and middleware testing. All mocks are designed to be used in unit tests
 * to avoid real Azure/external service calls.
 *
 * ## Quick Start
 *
 * ```typescript
 * import { mockDocumentService, mockStorageService, createMockContext } from './setup/mocks';
 *
 * beforeEach(() => {
 *   vi.clearAllMocks();
 *   const documentService = mockDocumentService();
 *   vi.mocked(getDocumentService).mockReturnValue(documentService as any);
 * });
 * ```
 *
 * ## Available Mock Factories
 *
 * ### Azure Services
 * - `mockBlobServiceClient()` - Full Azure Blob Storage mock chain
 * - `mockTableClient()` - Azure Table Storage with in-memory state
 * - `mockDocumentAnalysisClient()` - Azure Document Intelligence OCR
 * - `mockOpenAI(overrides?)` - OpenAI API client with configurable responses
 *
 * ### Application Services
 * - `mockDocumentService(overrides?)` - Document upload/management service
 * - `mockOCRService(overrides?)` - OCR processing service
 * - `mockAIService(overrides?)` - AI product mapping service
 * - `mockVendorService(overrides?)` - Vendor CRUD operations
 * - `mockVersionService(overrides?)` - Version management
 * - `mockStorageService(overrides?)` - Storage operations wrapper
 *
 * ### Database & Infrastructure
 * - `mockSqlConnection()` - SQL Server connection with query tracking
 * - `mockWithDatabase(queryResults?)` - Database utility function mock
 * - `resetMockState()` - Reset shared state (call in beforeEach)
 *
 * ### HTTP & Middleware Testing
 * - `createMockContext()` - Azure Functions InvocationContext
 * - `createMockHandler()` - HTTP handler function mock
 * - `createMockRequest(method, headers?)` - HTTP request mock
 * - `mockHttpRequest(overrides?)` - Full HTTP request with form data
 * - `mockInvocationContext()` - Context with blob trigger metadata
 *
 * ### Rate Limiting Constants
 * - `mockRateLimitSuccess` - Successful IP rate limit response
 * - `mockDailyLimitSuccess` - Successful daily upload limit response
 *
 * ## Usage Patterns
 *
 * ### Basic Service Mock
 * ```typescript
 * const service = mockDocumentService();
 * vi.mocked(getDocumentService).mockReturnValue(service as any);
 * ```
 *
 * ### Service Mock with Custom Behavior
 * ```typescript
 * const service = mockDocumentService({
 *   upload: vi.fn().mockRejectedValue(new Error('Upload failed'))
 * });
 * vi.mocked(getDocumentService).mockReturnValue(service as any);
 * ```
 *
 * ### Middleware Testing
 * ```typescript
 * const context = createMockContext();
 * const handler = createMockHandler();
 * const request = createMockRequest('POST', new Headers({'x-api-key': 'test'}));
 *
 * const wrappedHandler = withAuth(handler);
 * const response = await wrappedHandler(request, context);
 * ```
 *
 * ### OpenAI Mock with Custom Response
 * ```typescript
 * const openAI = mockOpenAI();
 * // Modify the mock's behavior for specific tests
 * openAI.chat.completions.create.mockResolvedValueOnce({...});
 * ```
 *
 * ## Best Practices
 *
 * 1. **Always call `vi.clearAllMocks()` in `beforeEach`** to reset mock state
 * 2. **Use overrides for test-specific behavior** rather than recreating mocks
 * 3. **Call `resetMockState()` for tests using `mockSqlConnection()`** to reset query counters
 * 4. **Extract mock references** if you need to make assertions on them
 * 5. **Use type assertions** (`as any`) when passing mocks to vi.mocked()
 *
 * ## When NOT to Use These Mocks
 *
 * - Integration tests that need real Azure services (use test containers instead)
 * - E2E tests (use actual deployed services)
 * - Tests validating mock implementations themselves
 *
 * @module test/unit/setup/mocks
 */

import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { vi } from 'vitest';

type MockFile = {
  name: string;
  type: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

type FormDataValue = string | MockFile;

/**
 * Creates a mock Azure BlobServiceClient with full dependency chain.
 *
 * Includes mocked ContainerClient and BlockBlobClient for complete blob operations.
 * Use this for testing any code that interacts with Azure Blob Storage.
 *
 * @returns Mock BlobServiceClient with getContainerClient chain
 *
 * @example
 * ```typescript
 * const blobMock = mockBlobServiceClient();
 * vi.mocked(BlobServiceClient).fromConnectionString = vi.fn().mockReturnValue(blobMock);
 * ```
 */
export const mockBlobServiceClient = () => {
  const mockBlockBlobClient = {
    upload: vi.fn().mockResolvedValue({ _response: { status: 201 } }),
    url: 'https://test.blob.core.windows.net/uploads/test.pdf',
    delete: vi.fn().mockResolvedValue({ _response: { status: 202 } }),
    setMetadata: vi.fn().mockResolvedValue({ _response: { status: 200 } }),
  };

  const mockContainerClient = {
    getBlockBlobClient: vi.fn().mockReturnValue(mockBlockBlobClient),
    createIfNotExists: vi.fn().mockResolvedValue({ succeeded: true }),
  };

  return {
    getContainerClient: vi.fn().mockReturnValue(mockContainerClient),
  };
};

// Shared query counter for tracking across multiple pool instances
let globalQueryCount = 0;

/**
 * Resets shared mock state including SQL query counters.
 *
 * Call this in beforeEach when using mockSqlConnection() to ensure
 * clean state between tests.
 *
 * @example
 * ```typescript
 * beforeEach(() => {
 *   resetMockState();
 *   vi.clearAllMocks();
 * });
 * ```
 */
export const resetMockState = () => {
  globalQueryCount = 0;
};

/**
 * Creates a mock SQL Server connection pool with query tracking.
 *
 * Automatically handles common query patterns:
 * - First query: Returns empty recordset (duplicate check)
 * - INSERT queries: Returns result_id
 * - SELECT queries: Returns full document data
 *
 * Use `resetMockState()` in beforeEach to reset the query counter.
 *
 * @returns Mock SQL connection pool with request/query methods
 *
 * @example
 * ```typescript
 * const pool = mockSqlConnection();
 * const result = await pool.request().query('SELECT * FROM documents');
 * ```
 */
export const mockSqlConnection = () => {
  const mockRequest = {
    input: vi.fn().mockReturnThis(),
    query: vi.fn().mockImplementation(async (sql?: string) => {
      globalQueryCount++;
      const currentQuery = globalQueryCount;

      // First query (duplicate check) returns empty (no duplicate)
      if (currentQuery === 1) {
        return { recordset: [] };
      }
      // Second query (INSERT with OUTPUT) returns the new result_id
      if (sql && (sql.includes('INSERT') || sql.includes('OUTPUT INSERTED.result_id'))) {
        return {
          recordset: [{ result_id: 'test-uuid-1234' }],
          rowsAffected: [1],
        };
      }
      // SELECT queries return full document data
      if (sql && sql.includes('SELECT')) {
        return {
          recordset: [
            {
              result_id: 'test-uuid-1234',
              document_name: 'BETTER_LIVING-11-25.pdf',
              document_path: 'BETTER_LIVING_11_25/BETTER_LIVING-11-25.pdf',
              document_size_bytes: 1024,
              document_type: 'application/pdf',
              vendor_name: 'BETTER_LIVING_11_25',
              doc_intel_extracted_text: 'test content',
              doc_intel_structured_data: '{}',
              doc_intel_confidence_score: 0.95,
              doc_intel_page_count: 1,
              doc_intel_table_count: 0,
              doc_intel_cost_usd: 0.0015,
              doc_intel_prompt_used: 'test prompt',
              reprocessing_count: 0,
              parent_document_id: null,
            },
          ],
        };
      }
      // Default fallback
      return {
        recordset: [],
        rowsAffected: [0],
      };
    }),
  };

  const mockPool = {
    connect: vi.fn().mockResolvedValue(undefined),
    request: vi.fn().mockReturnValue(mockRequest),
    close: vi.fn().mockResolvedValue(undefined),
  };

  return mockPool;
};

/**
 * Creates a mock Azure Table Storage client with in-memory entity storage.
 *
 * Supports full CRUD operations (create, read, update, delete, list) with
 * query filtering for PartitionKey and RowKey. Entities persist across
 * calls within a test unless _clearEntities() is called.
 *
 * @returns Mock TableClient with CRUD operations and _clearEntities helper
 *
 * @example
 * ```typescript
 * const tableClient = mockTableClient();
 * await tableClient.createEntity({ partitionKey: 'PK', rowKey: 'RK', data: 'test' });
 * const entity = await tableClient.getEntity('PK', 'RK');
 * ```
 */
export const mockTableClient = () => {
  const entities = new Map<string, any>();

  return {
    createTable: vi.fn().mockResolvedValue({}),
    deleteTable: vi.fn().mockResolvedValue({}),
    getEntity: vi.fn().mockImplementation(async (partitionKey: string, rowKey: string) => {
      const key = `${partitionKey}:${rowKey}`;
      const entity = entities.get(key);
      if (!entity) {
        const error: any = new Error('Entity not found');
        error.statusCode = 404;
        throw error;
      }
      return entity;
    }),
    createEntity: vi.fn().mockImplementation(async (entity: any) => {
      const key = `${entity.partitionKey}:${entity.rowKey}`;
      entities.set(key, entity);
      return {};
    }),
    upsertEntity: vi.fn().mockImplementation(async (entity: any) => {
      const key = `${entity.partitionKey}:${entity.rowKey}`;
      const existing = entities.get(key);
      if (existing) {
        entities.set(key, { ...existing, ...entity });
      } else {
        entities.set(key, entity);
      }
      return {};
    }),
    deleteEntity: vi.fn().mockImplementation(async (partitionKey: string, rowKey: string) => {
      const key = `${partitionKey}:${rowKey}`;
      entities.delete(key);
      return {};
    }),
    listEntities: vi.fn().mockImplementation((options?: any) => {
      const allEntities = Array.from(entities.values());
      let filtered = allEntities;

      // Apply filter if provided
      if (options?.queryOptions?.filter) {
        const filter = options.queryOptions.filter;
        filtered = allEntities.filter((entity) => {
          let matches = true;

          // PartitionKey equality filter
          if (filter.includes('PartitionKey eq')) {
            const match = filter.match(/PartitionKey eq '([^']+)'/);
            if (match) {
              matches = matches && entity.partitionKey === match[1];
            }
          }

          // RowKey less than filter
          if (filter.includes('RowKey lt')) {
            const match = filter.match(/RowKey lt '([^']+)'/);
            if (match) {
              matches = matches && entity.rowKey < match[1];
            }
          }

          return matches;
        });
      }

      return {
        [Symbol.asyncIterator]: async function* () {
          for (const entity of filtered) {
            yield entity;
          }
        },
      };
    }),
    // Helper for tests to clear data
    _clearEntities: () => entities.clear(),
  };
};

/**
 * Creates a mock Azure Document Intelligence (Form Recognizer) client.
 *
 * Returns pre-configured OCR results with text content, pages, and tables.
 * Use for testing document processing without real Azure AI calls.
 *
 * @returns Mock DocumentAnalysisClient with beginAnalyzeDocument method
 *
 * @example
 * ```typescript
 * const client = mockDocumentAnalysisClient();
 * const poller = await client.beginAnalyzeDocument('prebuilt-layout', buffer);
 * const result = await poller.pollUntilDone();
 * ```
 */
export const mockDocumentAnalysisClient = () => {
  const mockAnalysisResult = {
    content: 'Mock OCR extracted text content',
    pages: [{ pageNumber: 1 }],
    tables: [
      {
        rowCount: 2,
        columnCount: 3,
        cells: [
          { content: 'Header 1', rowIndex: 0, columnIndex: 0 },
          { content: 'Header 2', rowIndex: 0, columnIndex: 1 },
          { content: 'Header 3', rowIndex: 0, columnIndex: 2 },
        ],
      },
    ],
  };

  const mockPoller = {
    pollUntilDone: vi.fn().mockResolvedValue(mockAnalysisResult),
  };

  return {
    beginAnalyzeDocument: vi.fn().mockResolvedValue(mockPoller),
  };
};

/**
 * Creates a mock OpenAI client with configurable responses.
 *
 * Default response includes products array, columnMapping, and usage stats.
 * Use overrides parameter to customize the response for specific test scenarios.
 *
 * @param overrides - Partial response object to merge with defaults
 * @returns Mock OpenAI client with chat.completions.create method
 *
 * @example
 * ```typescript
 * const openAI = mockOpenAI();
 * vi.mocked(OpenAI).mockImplementation(() => openAI);
 *
 * // Custom error scenario
 * const errorAI = mockOpenAI();
 * errorAI.chat.completions.create.mockRejectedValue(new Error('API Error'));
 * ```
 */
export const mockOpenAI = (overrides: Partial<any> = {}) => ({
  chat: {
    completions: {
      create: vi.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                products: [
                  {
                    sku: 'TEST-SKU-001',
                    name: 'Test Product',
                    description: 'A test product description',
                    retail_price: 99.99,
                    wholesale_price: 59.99,
                    category: 'Electronics',
                    confidence: 0.95,
                  },
                ],
                columnMapping: { sku: 1, name: 0, price: 2, unit: 3 },
              }),
            },
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
        ...overrides,
      }),
    },
  },
});

/**
 * Creates a mock Azure Functions InvocationContext with blob trigger metadata.
 *
 * Includes all logging methods (log, error, warn, info, trace) as vi.fn() mocks
 * and pre-configured blob trigger metadata for document processing tests.
 *
 * @returns Mock InvocationContext with logging and trigger metadata
 *
 * @example
 * ```typescript
 * const context = mockInvocationContext();
 * await processDocument(buffer, context);
 * expect(context.log).toHaveBeenCalledWith(expect.stringContaining('Processing'));
 * ```
 */
export const mockInvocationContext = () => ({
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  trace: vi.fn(),
  triggerMetadata: {
    blobTrigger: 'uploads/BETTER_LIVING_11_25/BETTER_LIVING-11-25.pdf',
  },
  invocationId: 'test-invocation-id',
  traceContext: {},
  bindings: {},
  bindingData: {},
  bindingDefinitions: [],
});

/**
 * Creates a mock HTTP request with form data for file upload testing.
 *
 * Default includes multipart/form-data with a file and vendorName field.
 * Use overrides to customize headers, formData, or other request properties.
 *
 * @param overrides - Partial request object to merge with defaults
 * @returns Mock HttpRequest with formData method
 *
 * @example
 * ```typescript
 * const request = mockHttpRequest();
 * const formData = await request.formData();
 *
 * // Custom request without file
 * const noFileReq = mockHttpRequest({
 *   formData: vi.fn().mockResolvedValue(new Map([['vendorName', 'TEST']]))
 * });
 * ```
 */
export const mockHttpRequest = (overrides: Partial<any> = {}) => {
  const headers = new Map<string, string>([['content-type', 'multipart/form-data']]);

  // Allow headers to be overridden via overrides.headers
  if (overrides.headers) {
    for (const [key, value] of Object.entries(overrides.headers)) {
      headers.set(key.toLowerCase(), value as string);
    }
  }

  return {
    method: 'POST',
    url: 'http://localhost:7071/api/upload',
    headers: {
      get: (key: string) => headers.get(key.toLowerCase()) || null,
      set: (key: string, value: string) => headers.set(key.toLowerCase(), value),
      has: (key: string) => headers.has(key.toLowerCase()),
    },
    query: {},
    params: {},
    body: null,
    formData: vi.fn().mockResolvedValue(
      new Map<string, FormDataValue>([
        [
          'file',
          {
            name: 'catalog.pdf',
            type: 'application/pdf',
            arrayBuffer: vi.fn().mockResolvedValue(Buffer.from('test file content')),
          },
        ],
        ['vendorName', 'BETTER_LIVING_11_25'],
      ])
    ),
    ...overrides,
  };
};

// ============================================================================
// Service Mock Factories
// ============================================================================
// All service mocks accept an optional overrides parameter to customize
// specific methods for test scenarios. By default, methods return realistic
// success responses.

/**
 * Creates a mock DocumentService for document upload and retrieval testing.
 *
 * @param overrides - Partial service object to customize method implementations
 * @returns Mock DocumentService with upload and getDocument methods
 *
 * @example
 * ```typescript
 * const service = mockDocumentService();
 * vi.mocked(getDocumentService).mockReturnValue(service as any);
 *
 * // Custom error scenario
 * const errorService = mockDocumentService({
 *   upload: vi.fn().mockRejectedValue(new Error('Upload failed'))
 * });
 * ```
 */
export const mockDocumentService = (overrides: Partial<any> = {}) => ({
  upload: vi.fn().mockResolvedValue({
    resultId: 'test-uuid-1234',
    documentName: 'test.pdf',
    vendorName: 'TEST_VENDOR',
    filePath: 'TEST_VENDOR/test.pdf',
    status: 'pending',
  }),
  getDocument: vi.fn().mockResolvedValue({
    result_id: 'test-uuid-1234',
    document_name: 'test.pdf',
    vendor_name: 'TEST_VENDOR',
    status: 'pending',
  }),
  ...overrides,
});

/**
 * Creates a mock OCRService for document OCR processing testing.
 *
 * @param overrides - Partial service object to customize method implementations
 * @returns Mock OCRService with processDocument and queueAIMapping methods
 *
 * @example
 * ```typescript
 * const service = mockOCRService();
 * vi.mocked(getOCRService).mockReturnValue(service as any);
 * ```
 */
export const mockOCRService = (overrides: Partial<any> = {}) => ({
  processDocument: vi.fn().mockResolvedValue({
    resultId: 'test-uuid-1234',
    status: 'ocr_complete',
    pageCount: 2,
    tableCount: 3,
    confidence: 0.95,
  }),
  queueAIMapping: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

/**
 * Creates a mock AIService for AI product mapping testing.
 *
 * @param overrides - Partial service object to customize method implementations
 * @returns Mock AIService with mapProducts and extractProductsFromTables methods
 *
 * @example
 * ```typescript
 * const service = mockAIService({
 *   mapProducts: vi.fn().mockRejectedValue(new Error('OpenAI timeout'))
 * });
 * vi.mocked(getAIService).mockReturnValue(service as any);
 * ```
 */
export const mockAIService = (overrides: Partial<any> = {}) => ({
  mapProducts: vi.fn().mockResolvedValue({
    products: [
      {
        sku: 'TEST-SKU-001',
        name: 'Test Product',
        retail_price: 99.99,
        wholesale_price: 59.99,
      },
    ],
    columnMapping: { sku: 1, name: 0, price: 2 },
    stats: { totalProducts: 1, validProducts: 1 },
  }),
  extractProductsFromTables: vi.fn().mockResolvedValue({
    products: [],
    columnMapping: {},
  }),
  ...overrides,
});

/**
 * Creates a mock VendorService for vendor CRUD operations testing.
 *
 * @param overrides - Partial service object to customize method implementations
 * @returns Mock VendorService with getVendor, createVendor, and deleteVendor methods
 *
 * @example
 * ```typescript
 * const service = mockVendorService();
 * vi.mocked(getVendorService).mockReturnValue(service as any);
 * ```
 */
export const mockVendorService = (overrides: Partial<any> = {}) => ({
  getVendor: vi.fn().mockResolvedValue({
    vendor_id: 1,
    vendor_name: 'TEST_VENDOR',
    created_at: new Date(),
  }),
  createVendor: vi.fn().mockResolvedValue(1),
  deleteVendor: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

/**
 * Creates a mock VersionService for application version testing.
 *
 * @param overrides - Partial service object to customize method implementations
 * @returns Mock VersionService with getLatestVersion method
 *
 * @example
 * ```typescript
 * const service = mockVersionService();
 * vi.mocked(getVersionService).mockReturnValue(service as any);
 * ```
 */
export const mockVersionService = (overrides: Partial<any> = {}) => ({
  getLatestVersion: vi.fn().mockResolvedValue('1.0.0'),
  ...overrides,
});

/**
 * Creates a mock StorageService for blob storage operations testing.
 *
 * Includes methods for blob upload, deletion, bronze layer operations, and downloads.
 *
 * @param overrides - Partial service object to customize method implementations
 * @returns Mock StorageService with all storage operation methods
 *
 * @example
 * ```typescript
 * const service = mockStorageService({
 *   uploadBlob: vi.fn().mockResolvedValue({ url: 'https://custom.url' })
 * });
 * vi.mocked(getStorageService).mockReturnValue(service as any);
 * ```
 */
export const mockStorageService = (overrides: Partial<any> = {}) => ({
  uploadBlob: vi.fn().mockResolvedValue({
    url: 'https://storage/uploads/vendor/file.pdf',
  }),
  deleteBlob: vi.fn().mockResolvedValue(undefined),
  uploadToBronzeLayer: vi.fn().mockResolvedValue({
    url: 'https://storage/bronze/file.json',
  }),
  uploadTextToBronzeLayer: vi.fn().mockResolvedValue({
    url: 'https://storage/bronze/file.txt',
  }),
  downloadBlob: vi.fn().mockResolvedValue('Mock OCR text content'),
  ...overrides,
});

// ============================================================================
// Database Mock Utilities
// ============================================================================

/**
 * Creates a mock withDatabase utility function for database transaction testing.
 *
 * Use this in vi.mock() factory functions (not in test bodies) to mock the
 * database utility. Query results can be customized per test.
 *
 * @param queryResults - Default query results (recordset, rowsAffected)
 * @returns Mock withDatabase function
 *
 * @example
 * ```typescript
 * // In vi.mock() factory (file-level)
 * vi.mock('../../../src/utils/database.js', () => ({
 *   withDatabase: mockWithDatabase({ recordset: [{ id: 1 }] })
 * }));
 *
 * // Override in specific test
 * vi.mocked(withDatabase).mockImplementation((callback) =>
 *   callback({ request: () => ({ query: vi.fn().mockResolvedValue({...}) }) })
 * );
 * ```
 */
export const mockWithDatabase = (queryResults: Partial<any> = {}) =>
  vi.fn(async (callback: any) => {
    const mockRequest = {
      input: vi.fn().mockReturnThis(),
      query: vi.fn().mockResolvedValue({
        recordset: [],
        rowsAffected: [0],
        ...queryResults,
      }),
    };
    const mockPool = {
      request: vi.fn().mockReturnValue(mockRequest),
      close: vi.fn(),
    };
    return callback(mockPool);
  });

// ============================================================================
// Middleware Test Utilities
// ============================================================================

/**
 * Creates a mock Azure Functions InvocationContext for HTTP handler testing.
 *
 * Includes all logging methods and required context properties. Use this
 * for testing HTTP functions and middleware.
 *
 * @returns Mock InvocationContext
 *
 * @example
 * ```typescript
 * const context = createMockContext();
 * const response = await handler(request, context);
 * expect(context.error).not.toHaveBeenCalled();
 * ```
 */
export const createMockContext = (): InvocationContext => ({
  log: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  trace: vi.fn(),
  invocationId: 'test-invocation-id',
  traceContext: {},
  triggerMetadata: {},
  extraInputs: {
    get: vi.fn(),
    set: vi.fn(),
  },
  extraOutputs: {
    get: vi.fn(),
    set: vi.fn(),
  },
});

/**
 * Creates a mock HTTP handler function for middleware testing.
 *
 * Returns a vi.fn() that resolves to a 200 OK response. Use mockResolvedValue()
 * or mockRejectedValue() to customize behavior for specific tests.
 *
 * @returns Mock handler function
 *
 * @example
 * ```typescript
 * const handler = createMockHandler();
 * const wrappedHandler = withAuth(withCors(handler));
 *
 * // Test error handling
 * handler.mockRejectedValue(new Error('Handler error'));
 * ```
 */
export const createMockHandler = () =>
  vi.fn<[HttpRequest, InvocationContext], Promise<HttpResponseInit>>().mockResolvedValue({
    status: 200,
    jsonBody: { message: 'Success' },
  });

/**
 * Creates a mock HTTP request for handler and middleware testing.
 *
 * @param method - HTTP method (GET, POST, PUT, DELETE, etc.)
 * @param headers - Optional Headers object with request headers
 * @returns Mock HttpRequest
 *
 * @example
 * ```typescript
 * const request = createMockRequest('POST', new Headers({'x-api-key': 'test'}));
 * const response = await handler(request, context);
 * ```
 */
export const createMockRequest = (method: string, headers: Headers = new Headers()): HttpRequest =>
  ({
    method,
    url: 'http://localhost/api/test',
    headers,
    query: new URLSearchParams(),
    params: {},
    body: null,
    user: null,
  }) as HttpRequest;

// ============================================================================
// Rate Limit Mock Constants
// ============================================================================

/**
 * Mock response for successful IP rate limit check.
 *
 * Use with checkIpRateLimit mock to simulate allowed requests.
 *
 * @example
 * ```typescript
 * vi.mocked(usageTracker.checkIpRateLimit).mockResolvedValue(mockRateLimitSuccess);
 * ```
 */
export const mockRateLimitSuccess = {
  allowed: true,
  current: 5,
  limit: 10,
  resetTime: '15:00 UTC',
};

/**
 * Mock response for successful daily upload limit check.
 *
 * Use with checkDailyUploadLimit mock to simulate allowed uploads.
 *
 * @example
 * ```typescript
 * vi.mocked(usageTracker.checkDailyUploadLimit).mockResolvedValue(mockDailyLimitSuccess);
 * ```
 */
export const mockDailyLimitSuccess = {
  allowed: true,
  current: 50,
  limit: 100,
};
