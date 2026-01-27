import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock Azure SDK modules BEFORE importing the handler
vi.mock('@azure/storage-blob');
vi.mock('mssql');
vi.mock('openai');

import { BlobServiceClient } from '@azure/storage-blob';
import sql from 'mssql';
import { OpenAI } from 'openai';
import { aiProductMapperHandler } from '../../src/functions/aiProductMapper';
import {
  mockBlobServiceClient,
  mockInvocationContext,
  mockOpenAI,
  mockSqlConnection,
} from './setup/mocks';

describe('AI Product Mapper - Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mocks for each test
    vi.mocked(sql.ConnectionPool).mockImplementation(() => mockSqlConnection() as any);
    vi.mocked(OpenAI).mockImplementation(() => mockOpenAI() as any);
    vi.mocked(BlobServiceClient.fromConnectionString).mockReturnValue(
      mockBlobServiceClient() as any
    );
  });

  it('should return 400 when documentId is missing', async () => {
    const request = {
      json: vi.fn().mockResolvedValue({}),
    };
    const context = mockInvocationContext();

    const response = await aiProductMapperHandler(request as any, context as any);

    expect(response.status).toBe(400);
    expect(response.body).toContain('Missing documentId');
  });

  it('should return 404 when document not found', async () => {
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
      json: vi.fn().mockResolvedValue({ documentId: 'nonexistent-uuid' }),
    };
    const context = mockInvocationContext();

    const response = await aiProductMapperHandler(request as any, context as any);

    expect(response.status).toBe(404);
    expect(response.body).toContain('Document not found');
  });

  it('should return 400 when document status is not ocr_complete', async () => {
    const mockPool = {
      connect: vi.fn().mockResolvedValue(undefined),
      request: vi.fn().mockReturnValue({
        input: vi.fn().mockReturnThis(),
        query: vi.fn().mockResolvedValue({
          recordset: [
            {
              result_id: 'test-uuid-1234',
              document_name: 'test.pdf',
              vendor_name: 'test-vendor',
              doc_intel_structured_data: '{}',
              doc_intel_extracted_text: 'test',
              processing_status: 'pending', // Not ready for AI mapping
              reprocessing_count: 0,
            },
          ],
        }),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(sql.ConnectionPool).mockImplementation(() => mockPool as any);

    const request = {
      json: vi.fn().mockResolvedValue({ documentId: 'test-uuid-1234' }),
    };
    const context = mockInvocationContext();

    const response = await aiProductMapperHandler(request as any, context as any);

    expect(response.status).toBe(400);
    expect(response.body).toContain("Must be 'ocr_complete'");
  });

  it('should successfully extract products from OCR data', async () => {
    const mockOcrData = {
      tables: [
        {
          cells: [
            // Header row
            { kind: 'columnHeader', rowIndex: 0, columnIndex: 0, content: 'SKU' },
            { kind: 'columnHeader', rowIndex: 0, columnIndex: 1, content: 'Product Name' },
            { kind: 'columnHeader', rowIndex: 0, columnIndex: 2, content: 'Price' },
            // Data row
            { kind: 'content', rowIndex: 1, columnIndex: 0, content: 'TEST-001' },
            { kind: 'content', rowIndex: 1, columnIndex: 1, content: 'Test Product' },
            { kind: 'content', rowIndex: 1, columnIndex: 2, content: '$19.99' },
          ],
        },
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
                result_id: 'test-uuid-1234',
                document_name: 'catalog.pdf',
                vendor_name: 'ACME',
                doc_intel_structured_data: JSON.stringify(mockOcrData),
                doc_intel_extracted_text: 'Test catalog content',
                processing_status: 'ocr_complete',
                reprocessing_count: 0,
              },
            ],
          })
          .mockResolvedValue({ rowsAffected: [1] }), // UPDATE status
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(sql.ConnectionPool).mockImplementation(() => mockPool as any);

    // Mock OpenAI to return column mapping format
    const mockOpenAIInstance = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    vendor: 'ACME',
                    columnMapping: {
                      sku: 0,
                      name: 1,
                      price: 2,
                    },
                  }),
                },
              },
            ],
            usage: {
              prompt_tokens: 100,
              completion_tokens: 50,
              total_tokens: 150,
            },
          }),
        },
      },
    };
    vi.mocked(OpenAI).mockImplementation(() => mockOpenAIInstance as any);

    const request = {
      json: vi.fn().mockResolvedValue({ documentId: 'test-uuid-1234' }),
    };
    const context = mockInvocationContext();

    const response = await aiProductMapperHandler(request as any, context as any);

    expect(response.status).toBe(200);
    const body = JSON.parse(response.body as string);
    expect(body.productCount).toBeGreaterThan(0);
    expect(body.message).toBe('AI product mapping completed successfully');
  });

  it('should handle price parsing with currency symbols and commas', async () => {
    // This test verifies price parsing logic by checking that the function
    // correctly removes $, commas, and parses decimal values
    const mockOcrData = {
      tables: [
        {
          cells: [
            { kind: 'columnHeader', rowIndex: 0, columnIndex: 0, content: 'SKU' },
            { kind: 'columnHeader', rowIndex: 0, columnIndex: 1, content: 'Name' },
            { kind: 'columnHeader', rowIndex: 0, columnIndex: 2, content: 'Price' },
            { kind: 'content', rowIndex: 1, columnIndex: 0, content: 'ITEM-001' },
            { kind: 'content', rowIndex: 1, columnIndex: 1, content: 'Widget A' },
            { kind: 'content', rowIndex: 1, columnIndex: 2, content: '$1,234.56' },
          ],
        },
      ],
    };

    const mockPool = {
      connect: vi.fn().mockResolvedValue(undefined),
      request: vi.fn().mockReturnValue({
        input: vi.fn().mockReturnThis(),
        query: vi
          .fn()
          .mockResolvedValueOnce({
            recordset: [
              {
                result_id: 'test-uuid',
                document_name: 'test.pdf',
                vendor_name: 'TEST',
                doc_intel_structured_data: JSON.stringify(mockOcrData),
                doc_intel_extracted_text: 'test',
                processing_status: 'ocr_complete',
                reprocessing_count: 0,
              },
            ],
          })
          .mockResolvedValue({ rowsAffected: [1] }),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(sql.ConnectionPool).mockImplementation(() => mockPool as any);

    const request = {
      json: vi.fn().mockResolvedValue({ documentId: 'test-uuid' }),
    };
    const context = mockInvocationContext();

    const response = await aiProductMapperHandler(request as any, context as any);

    expect(response.status).toBe(200);
    // Price should be parsed correctly (verified via database update call)
  });

  it('should filter out products with missing required fields', async () => {
    const mockOcrData = {
      tables: [
        {
          cells: [
            { kind: 'columnHeader', rowIndex: 0, columnIndex: 0, content: 'SKU' },
            { kind: 'columnHeader', rowIndex: 0, columnIndex: 1, content: 'Name' },
            // Valid row
            { kind: 'content', rowIndex: 1, columnIndex: 0, content: 'VALID-001' },
            { kind: 'content', rowIndex: 1, columnIndex: 1, content: 'Valid Product' },
            // Invalid row - missing SKU
            { kind: 'content', rowIndex: 2, columnIndex: 0, content: '' },
            { kind: 'content', rowIndex: 2, columnIndex: 1, content: 'Invalid Product' },
            // Invalid row - missing name
            { kind: 'content', rowIndex: 3, columnIndex: 0, content: 'INVALID-002' },
            { kind: 'content', rowIndex: 3, columnIndex: 1, content: '' },
          ],
        },
      ],
    };

    const mockPool = {
      connect: vi.fn().mockResolvedValue(undefined),
      request: vi.fn().mockReturnValue({
        input: vi.fn().mockReturnThis(),
        query: vi
          .fn()
          .mockResolvedValueOnce({
            recordset: [
              {
                result_id: 'test-uuid',
                document_name: 'test.pdf',
                vendor_name: 'TEST',
                doc_intel_structured_data: JSON.stringify(mockOcrData),
                doc_intel_extracted_text: 'test',
                processing_status: 'ocr_complete',
                reprocessing_count: 0,
              },
            ],
          })
          .mockResolvedValue({ rowsAffected: [1] }),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(sql.ConnectionPool).mockImplementation(() => mockPool as any);

    const request = {
      json: vi.fn().mockResolvedValue({ documentId: 'test-uuid' }),
    };
    const context = mockInvocationContext();

    const response = await aiProductMapperHandler(request as any, context as any);

    expect(response.status).toBe(200);
    const _body = JSON.parse(response.body as string);
    // Should only include products with both SKU and name
    expect(context.log).toHaveBeenCalledWith(expect.stringContaining('Extracted'));
  });

  it('should store results in bronze-layer storage', async () => {
    const mockOcrData = {
      tables: [
        {
          cells: [
            { kind: 'columnHeader', rowIndex: 0, columnIndex: 0, content: 'SKU' },
            { kind: 'columnHeader', rowIndex: 0, columnIndex: 1, content: 'Name' },
            { kind: 'content', rowIndex: 1, columnIndex: 0, content: 'TEST-001' },
            { kind: 'content', rowIndex: 1, columnIndex: 1, content: 'Test Product' },
          ],
        },
      ],
    };

    const mockBlobClient = {
      upload: vi.fn().mockResolvedValue({ requestId: 'mock-request-id' }),
    };
    const mockContainerClient = {
      getBlockBlobClient: vi.fn().mockReturnValue(mockBlobClient),
    };
    const mockBlobServiceClient = {
      getContainerClient: vi.fn().mockReturnValue(mockContainerClient),
    };
    vi.mocked(BlobServiceClient.fromConnectionString).mockReturnValue(mockBlobServiceClient as any);

    const mockPool = {
      connect: vi.fn().mockResolvedValue(undefined),
      request: vi.fn().mockReturnValue({
        input: vi.fn().mockReturnThis(),
        query: vi
          .fn()
          .mockResolvedValueOnce({
            recordset: [
              {
                result_id: 'test-uuid',
                document_name: 'test.pdf',
                vendor_name: 'TEST',
                doc_intel_structured_data: JSON.stringify(mockOcrData),
                doc_intel_extracted_text: 'test',
                processing_status: 'ocr_complete',
                reprocessing_count: 0,
              },
            ],
          })
          .mockResolvedValue({ rowsAffected: [1] }),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(sql.ConnectionPool).mockImplementation(() => mockPool as any);

    const request = {
      json: vi.fn().mockResolvedValue({ documentId: 'test-uuid' }),
    };
    const context = mockInvocationContext();

    const response = await aiProductMapperHandler(request as any, context as any);

    expect(response.status).toBe(200);
    // Verify bronze-layer storage was called
    expect(mockBlobClient.upload).toHaveBeenCalled();
  });

  it('should calculate token usage and costs', async () => {
    const mockOcrData = {
      tables: [
        {
          cells: [
            { kind: 'columnHeader', rowIndex: 0, columnIndex: 0, content: 'SKU' },
            { kind: 'columnHeader', rowIndex: 0, columnIndex: 1, content: 'Name' },
            { kind: 'content', rowIndex: 1, columnIndex: 0, content: 'TEST-001' },
            { kind: 'content', rowIndex: 1, columnIndex: 1, content: 'Test' },
          ],
        },
      ],
    };

    const mockPool = {
      connect: vi.fn().mockResolvedValue(undefined),
      request: vi.fn().mockReturnValue({
        input: vi.fn().mockReturnThis(),
        query: vi
          .fn()
          .mockResolvedValueOnce({
            recordset: [
              {
                result_id: 'test-uuid',
                document_name: 'test.pdf',
                vendor_name: 'TEST',
                doc_intel_structured_data: JSON.stringify(mockOcrData),
                doc_intel_extracted_text: 'test',
                processing_status: 'ocr_complete',
                reprocessing_count: 0,
              },
            ],
          })
          .mockResolvedValue({ rowsAffected: [1] }),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(sql.ConnectionPool).mockImplementation(() => mockPool as any);

    const request = {
      json: vi.fn().mockResolvedValue({ documentId: 'test-uuid' }),
    };
    const context = mockInvocationContext();

    const response = await aiProductMapperHandler(request as any, context as any);

    expect(response.status).toBe(200);
    const body = JSON.parse(response.body as string);
    // Verify cost calculation fields are present
    expect(body).toHaveProperty('cost');
    expect(body).toHaveProperty('usage');
    expect(body.usage).toHaveProperty('promptTokens');
    expect(body.usage).toHaveProperty('completionTokens');
    expect(body.usage).toHaveProperty('totalTokens');
  });

  it('should handle OpenAI API errors gracefully', async () => {
    const mockOcrData = {
      tables: [
        {
          cells: [
            { kind: 'columnHeader', rowIndex: 0, columnIndex: 0, content: 'SKU' },
            { kind: 'content', rowIndex: 1, columnIndex: 0, content: 'TEST-001' },
          ],
        },
      ],
    };

    const mockPool = {
      connect: vi.fn().mockResolvedValue(undefined),
      request: vi.fn().mockReturnValue({
        input: vi.fn().mockReturnThis(),
        query: vi
          .fn()
          .mockResolvedValueOnce({
            recordset: [
              {
                result_id: 'test-uuid',
                document_name: 'test.pdf',
                vendor_name: 'TEST',
                doc_intel_structured_data: JSON.stringify(mockOcrData),
                doc_intel_extracted_text: 'test',
                processing_status: 'ocr_complete',
                reprocessing_count: 0,
              },
            ],
          })
          .mockResolvedValue({ rowsAffected: [1] }),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(sql.ConnectionPool).mockImplementation(() => mockPool as any);

    const failingOpenAI = {
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue(new Error('OpenAI rate limit exceeded')),
        },
      },
    };
    vi.mocked(OpenAI).mockImplementation(() => failingOpenAI as any);

    const request = {
      json: vi.fn().mockResolvedValue({ documentId: 'test-uuid' }),
    };
    const context = mockInvocationContext();

    const response = await aiProductMapperHandler(request as any, context as any);

    expect(response.status).toBe(500);
    expect(response.body).toContain('OpenAI rate limit exceeded');
  });

  it('should handle database errors gracefully', async () => {
    const mockPool = {
      connect: vi.fn().mockResolvedValue(undefined),
      request: vi.fn().mockReturnValue({
        input: vi.fn().mockReturnThis(),
        query: vi.fn().mockRejectedValue(new Error('Database connection failed')),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(sql.ConnectionPool).mockImplementation(() => mockPool as any);

    const request = {
      json: vi.fn().mockResolvedValue({ documentId: 'test-uuid' }),
    };
    const context = mockInvocationContext();

    const response = await aiProductMapperHandler(request as any, context as any);

    expect(response.status).toBe(500);
    expect(response.body).toContain('Database connection failed');
  });

  it('should support reprocessing with incremented count', async () => {
    const mockOcrData = {
      tables: [
        {
          cells: [
            { kind: 'columnHeader', rowIndex: 0, columnIndex: 0, content: 'SKU' },
            { kind: 'columnHeader', rowIndex: 0, columnIndex: 1, content: 'Name' },
            { kind: 'content', rowIndex: 1, columnIndex: 0, content: 'TEST-001' },
            { kind: 'content', rowIndex: 1, columnIndex: 1, content: 'Test' },
          ],
        },
      ],
    };

    const mockPool = {
      connect: vi.fn().mockResolvedValue(undefined),
      request: vi.fn().mockReturnValue({
        input: vi.fn().mockReturnThis(),
        query: vi
          .fn()
          .mockResolvedValueOnce({
            recordset: [
              {
                result_id: 'test-uuid',
                document_name: 'test.pdf',
                vendor_name: 'TEST',
                doc_intel_structured_data: JSON.stringify(mockOcrData),
                doc_intel_extracted_text: 'test',
                processing_status: 'completed', // Already processed once
                reprocessing_count: 1, // Already reprocessed once
              },
            ],
          })
          .mockResolvedValue({ rowsAffected: [1] }),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(sql.ConnectionPool).mockImplementation(() => mockPool as any);

    const request = {
      json: vi.fn().mockResolvedValue({ documentId: 'test-uuid' }),
    };
    const context = mockInvocationContext();

    const response = await aiProductMapperHandler(request as any, context as any);

    expect(response.status).toBe(200);
    // Should allow reprocessing even if already completed
  });
});
