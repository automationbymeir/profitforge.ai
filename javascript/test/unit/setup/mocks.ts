// Mock factories for Azure services
// Used in unit tests to avoid real Azure calls

import { vi } from 'vitest';

type MockFile = {
  name: string;
  type: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

type FormDataValue = string | MockFile;

export const mockBlobServiceClient = () => ({
  getContainerClient: vi.fn().mockReturnValue({
    getBlockBlobClient: vi.fn().mockReturnValue({
      upload: vi.fn().mockResolvedValue({ requestId: 'mock-request-id' }),
      url: 'https://mockaccount.blob.core.windows.net/uploads/test.pdf',
    }),
  }),
});

// Shared query counter for tracking across multiple pool instances
let globalQueryCount = 0;

// Reset function for tests to call in beforeEach
export const resetMockState = () => {
  globalQueryCount = 0;
};

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
                    sku: 'TEST-SKU-001',
                    name: 'Test Product',
                    description: 'A test product description',
                    retail_price: 99.99,
                    wholesale_price: 59.99,
                    category: 'Electronics',
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
    blobTrigger: 'uploads/BETTER_LIVING_11_25/BETTER_LIVING-11-25.pdf',
  },
  invocationId: 'test-invocation-id',
  traceContext: {},
  bindings: {},
  bindingData: {},
  bindingDefinitions: [],
});

export const mockHttpRequest = (overrides: Partial<any> = {}) => {
  const headers = new Map<string, string>([['content-type', 'multipart/form-data']]);

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
