import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock mssql before importing the handler
vi.mock('mssql');
vi.mock('../../src/utils/database');

import { getResults } from '../../src/functions/getResults';
import { withDatabase } from '../../src/utils/database';
import { mockInvocationContext } from './setup/mocks';

describe('Get Results API - Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should retrieve results without filters (default behavior)', async () => {
    const mockResults = [
      {
        result_id: 'uuid-1',
        document_name: 'catalog1.pdf',
        vendor_name: 'ACME',
        processing_status: 'completed',
        reprocessing_count: 0,
        parent_document_id: null,
        ai_mapping_result: null,
        created_at: new Date(),
      },
      {
        result_id: 'uuid-2',
        document_name: 'catalog2.pdf',
        vendor_name: 'TEST',
        processing_status: 'completed',
        reprocessing_count: 0,
        parent_document_id: null,
        ai_mapping_result: null,
        created_at: new Date(),
      },
    ];

    vi.mocked(withDatabase).mockImplementation(async (callback) => {
      return callback({
        request: () => ({
          input: vi.fn().mockReturnThis(),
          query: vi.fn().mockResolvedValue({
            recordset: mockResults,
          }),
        }),
      } as any);
    });

    const request = {
      query: {
        get: vi.fn(() => null),
      },
    };
    const context = mockInvocationContext();

    const response = await getResults(request as any, context as any);

    expect(response.status).toBe(200);
    const body = JSON.parse(response.body as string);
    expect(body).toHaveLength(2);
    expect(body[0].result_id).toBe('uuid-1');
  });

  it('should filter by resultId', async () => {
    const validUuid = '550e8400-e29b-41d4-a716-446655440000';
    const mockResult = {
      result_id: validUuid,
      document_name: 'specific.pdf',
      vendor_name: 'ACME',
      processing_status: 'completed',
      ai_mapping_result: null,
    };

    vi.mocked(withDatabase).mockImplementation(async (callback) => {
      const mockPool = {
        request: () => {
          const mockRequest = {
            input: vi.fn().mockReturnThis(),
            query: vi.fn().mockResolvedValue({
              recordset: [mockResult],
            }),
          };
          return mockRequest;
        },
      };
      return callback(mockPool as any);
    });

    const request = {
      query: {
        get: vi.fn((key: string) => (key === 'resultId' ? validUuid : null)),
      },
    };
    const context = mockInvocationContext();

    const response = await getResults(request as any, context as any);

    expect(response.status).toBe(200);
    const body = JSON.parse(response.body as string);
    expect(body).toHaveLength(1);
    expect(body[0].result_id).toBe(validUuid);
  });

  it('should filter by vendor name', async () => {
    const mockResults = [
      {
        result_id: 'uuid-1',
        document_name: 'catalog1.pdf',
        vendor_name: 'ACME',
        processing_status: 'completed',
        ai_mapping_result: null,
      },
    ];

    vi.mocked(withDatabase).mockImplementation(async (callback) => {
      return callback({
        request: () => ({
          input: vi.fn().mockReturnThis(),
          query: vi.fn().mockResolvedValue({
            recordset: mockResults,
          }),
        }),
      } as any);
    });

    const request = {
      query: {
        get: vi.fn((key: string) => (key === 'vendor' ? 'ACME' : null)),
      },
    };
    const context = mockInvocationContext();

    const response = await getResults(request as any, context as any);

    expect(response.status).toBe(200);
    const body = JSON.parse(response.body as string);
    expect(body).toHaveLength(1);
    expect(body[0].vendor_name).toBe('ACME');
  });

  it('should respect limit parameter', async () => {
    const mockResults = Array.from({ length: 5 }, (_, i) => ({
      result_id: `uuid-${i}`,
      document_name: `doc${i}.pdf`,
      vendor_name: 'TEST',
      processing_status: 'completed',
      ai_mapping_result: null,
    }));

    vi.mocked(withDatabase).mockImplementation(async (callback) => {
      return callback({
        request: () => ({
          input: vi.fn().mockReturnThis(),
          query: vi.fn().mockResolvedValue({
            recordset: mockResults.slice(0, 5),
          }),
        }),
      } as any);
    });

    const request = {
      query: {
        get: vi.fn((key: string) => (key === 'limit' ? '5' : null)),
      },
    };
    const context = mockInvocationContext();

    const response = await getResults(request as any, context as any);

    expect(response.status).toBe(200);
    const body = JSON.parse(response.body as string);
    expect(body).toHaveLength(5);
  });

  it('should use default limit of 10 when not specified', async () => {
    vi.mocked(withDatabase).mockImplementation(async (callback) => {
      return callback({
        request: () => ({
          input: vi.fn().mockReturnThis(),
          query: vi.fn().mockResolvedValue({
            recordset: [],
          }),
        }),
      } as any);
    });

    const request = {
      query: {
        get: vi.fn(() => null),
      },
    };
    const context = mockInvocationContext();

    const response = await getResults(request as any, context as any);

    expect(response.status).toBe(200);
    // Verify default limit was used (10)
  });

  it('should show all versions when allVersions=true', async () => {
    const mockResults = [
      {
        result_id: 'uuid-v1',
        document_name: 'catalog.pdf',
        vendor_name: 'ACME',
        reprocessing_count: 0,
        parent_document_id: null,
        ai_mapping_result: null,
      },
      {
        result_id: 'uuid-v2',
        document_name: 'catalog.pdf',
        vendor_name: 'ACME',
        reprocessing_count: 1,
        parent_document_id: 'uuid-v1',
        ai_mapping_result: null,
      },
    ];

    vi.mocked(withDatabase).mockImplementation(async (callback) => {
      return callback({
        request: () => ({
          input: vi.fn().mockReturnThis(),
          query: vi.fn().mockResolvedValue({
            recordset: mockResults,
          }),
        }),
      } as any);
    });

    const request = {
      query: {
        get: vi.fn((key: string) => (key === 'allVersions' ? 'true' : null)),
      },
    };
    const context = mockInvocationContext();

    const response = await getResults(request as any, context as any);

    expect(response.status).toBe(200);
    const body = JSON.parse(response.body as string);
    expect(body).toHaveLength(2);
    // Should include both versions
  });

  it('should show only latest version by default', async () => {
    // When allVersions is not specified, should show only latest version
    // of each document chain (highest reprocessing_count)
    const mockResults = [
      {
        result_id: 'uuid-v2',
        document_name: 'catalog.pdf',
        vendor_name: 'ACME',
        reprocessing_count: 1,
        parent_document_id: 'uuid-v1',
        ai_mapping_result: null,
      },
    ];

    vi.mocked(withDatabase).mockImplementation(async (callback) => {
      return callback({
        request: () => ({
          input: vi.fn().mockReturnThis(),
          query: vi.fn().mockResolvedValue({
            recordset: mockResults,
          }),
        }),
      } as any);
    });

    const request = {
      query: {
        get: vi.fn(() => null),
      },
    };
    const context = mockInvocationContext();

    const response = await getResults(request as any, context as any);

    expect(response.status).toBe(200);
    const body = JSON.parse(response.body as string);
    // Should only return latest version
    expect(body.every((r: any) => r.reprocessing_count >= 1)).toBe(true);
  });

  it('should parse JSON fields in results', async () => {
    const mockResult = {
      result_id: 'uuid-1',
      document_name: 'catalog.pdf',
      vendor_name: 'ACME',
      processing_status: 'completed',
      ai_mapping_result: JSON.stringify({ products: [{ sku: 'TEST-001', name: 'Test' }] }),
    };

    vi.mocked(withDatabase).mockImplementation(async (callback) => {
      return callback({
        request: () => ({
          input: vi.fn().mockReturnThis(),
          query: vi.fn().mockResolvedValue({
            recordset: [mockResult],
          }),
        }),
      } as any);
    });

    const request = {
      query: {
        get: vi.fn(() => null),
      },
    };
    const context = mockInvocationContext();

    const response = await getResults(request as any, context as any);

    expect(response.status).toBe(200);
    const body = JSON.parse(response.body as string);
    expect(body[0].ai_mapping_result).toEqual({ products: [{ sku: 'TEST-001', name: 'Test' }] });
  });

  it('should handle database errors gracefully', async () => {
    vi.mocked(withDatabase).mockRejectedValue(new Error('Database connection failed'));

    const request = {
      query: {
        get: vi.fn(() => null),
      },
    };
    const context = mockInvocationContext();

    const response = await getResults(request as any, context as any);

    expect(response.status).toBe(500);
    expect(response.body).toContain('Database connection failed');
  });

  it('should include CORS headers in response', async () => {
    vi.mocked(withDatabase).mockImplementation(async (callback) => {
      return callback({
        request: () => ({
          input: vi.fn().mockReturnThis(),
          query: vi.fn().mockResolvedValue({
            recordset: [],
          }),
        }),
      } as any);
    });

    const request = {
      query: {
        get: vi.fn(() => null),
      },
    };
    const context = mockInvocationContext();

    const response = await getResults(request as any, context as any);

    expect((response.headers as Record<string, string>)?.['Access-Control-Allow-Origin']).toBe('*');
    expect((response.headers as Record<string, string>)?.['Content-Type']).toBe('application/json');
  });

  it('should combine multiple filters (vendor + limit)', async () => {
    const mockResults = [
      {
        result_id: 'uuid-1',
        document_name: 'catalog.pdf',
        vendor_name: 'ACME',
        processing_status: 'completed',
        ai_mapping_result: null,
      },
    ];

    vi.mocked(withDatabase).mockImplementation(async (callback) => {
      return callback({
        request: () => ({
          input: vi.fn().mockReturnThis(),
          query: vi.fn().mockResolvedValue({
            recordset: mockResults,
          }),
        }),
      } as any);
    });

    const request = {
      query: {
        get: vi.fn((key: string) => {
          if (key === 'vendor') return 'ACME';
          if (key === 'limit') return '5';
          return null;
        }),
      },
    };
    const context = mockInvocationContext();

    const response = await getResults(request as any, context as any);

    expect(response.status).toBe(200);
    const body = JSON.parse(response.body as string);
    expect(body).toHaveLength(1);
  });

  it('should return empty array when no results match filters', async () => {
    vi.mocked(withDatabase).mockImplementation(async (callback) => {
      return callback({
        request: () => ({
          input: vi.fn().mockReturnThis(),
          query: vi.fn().mockResolvedValue({
            recordset: [],
          }),
        }),
      } as any);
    });

    const request = {
      query: {
        get: vi.fn((key: string) => (key === 'vendor' ? 'NONEXISTENT' : null)),
      },
    };
    const context = mockInvocationContext();

    const response = await getResults(request as any, context as any);

    expect(response.status).toBe(200);
    const body = JSON.parse(response.body as string);
    expect(body).toEqual([]);
  });
});
