import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock mssql before importing the handler
vi.mock('mssql');
vi.mock('../../../../../src/utils/database');

import { getResults } from '../../../../../src/functions/http/documents/get-results';
import { withDatabase } from '../../../../../src/utils/database';
import { mockInvocationContext } from '../../../setup/mocks';

describe('Get Results API - HTTP Handler - Unit Tests', () => {
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
    expect(response.jsonBody).toHaveLength(2);
    expect(response.jsonBody[0].result_id).toBe('uuid-1');
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
    expect(response.jsonBody).toHaveLength(1);
    expect(response.jsonBody[0].result_id).toBe(validUuid);
  });

  it('should filter by vendor', async () => {
    const mockResults = [
      {
        result_id: 'uuid-1',
        vendor_name: 'ACME',
        processing_status: 'completed',
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
    expect(response.jsonBody).toHaveLength(1);
    expect(response.jsonBody[0].vendor_name).toBe('ACME');
  });

  it('should filter by status', async () => {
    const mockResults = [
      {
        result_id: 'uuid-1',
        processing_status: 'completed',
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
        get: vi.fn((key: string) => (key === 'status' ? 'completed' : null)),
      },
    };
    const context = mockInvocationContext();

    const response = await getResults(request as any, context as any);

    expect(response.status).toBe(200);
    expect(response.jsonBody).toHaveLength(1);
    expect(response.jsonBody[0].processing_status).toBe('completed');
  });

  it('should return empty array for invalid resultId format', async () => {
    const request = {
      query: {
        get: vi.fn((key: string) => (key === 'resultId' ? 'invalid-uuid-format' : null)),
      },
    };
    const context = mockInvocationContext();

    const response = await getResults(request as any, context as any);

    expect(response.status).toBe(200);
    expect(response.jsonBody).toEqual([]);
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
  });
});
