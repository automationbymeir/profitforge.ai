import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getResults } from '../../../src/functions/http/documents/get-results';
import * as servicesModule from '../../../src/services/index';
import { mockInvocationContext } from '../setup/mocks';

// Mock the services module
vi.mock('../../../src/services/index.js', () => ({
  createDocumentService: vi.fn(),
}));

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
        created_at: new Date(),
      },
      {
        result_id: 'uuid-2',
        document_name: 'catalog2.pdf',
        vendor_name: 'TEST',
        processing_status: 'completed',
        created_at: new Date(),
      },
    ];

    // Mock createDocumentService to return an object with getResults
    vi.mocked(servicesModule.createDocumentService).mockImplementation(
      () =>
        ({
          getResults: vi.fn().mockResolvedValue(mockResults),
        }) as any
    );

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
    };

    vi.mocked(servicesModule.createDocumentService).mockImplementation(
      () =>
        ({
          getDocument: vi.fn().mockResolvedValue(mockResult),
        }) as any
    );

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

    vi.mocked(servicesModule.createDocumentService).mockImplementation(
      () =>
        ({
          getResults: vi.fn().mockResolvedValue(mockResults),
        }) as any
    );

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

    vi.mocked(servicesModule.createDocumentService).mockImplementation(
      () =>
        ({
          getResults: vi.fn().mockResolvedValue(mockResults),
        }) as any
    );

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

    // UUID validation returns 400 for invalid format
    expect(response.status).toBe(400);
    expect(response.jsonBody.error).toContain('Invalid UUID format');
  });

  it('should handle database errors gracefully', async () => {
    vi.mocked(servicesModule.createDocumentService).mockImplementation(
      () =>
        ({
          getResults: vi.fn().mockRejectedValue(new Error('Database connection failed')),
        }) as any
    );

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
