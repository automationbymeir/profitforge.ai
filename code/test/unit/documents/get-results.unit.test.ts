import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getResults } from '../../../src/functions/http/documents/get-results';
import * as servicesModule from '../../../src/services/index';
import { mockInvocationContext } from '../setup/mocks';

describe('Get Results API - HTTP Handler - Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should retrieve results without filters (default behavior)', async () => {
    const mockResults = [
      {
        resultId: 'uuid-1',
        documentName: 'catalog1.pdf',
        vendorName: 'ACME',
        processingStatus: 'completed',
        createdAt: new Date(),
      },
      {
        resultId: 'uuid-2',
        documentName: 'catalog2.pdf',
        vendorName: 'TEST',
        processingStatus: 'completed',
        createdAt: new Date(),
      },
    ];

    // Mock createDocumentService to return an object with getResults
    vi.mocked(servicesModule.createDocumentService).mockResolvedValue({
      getResults: vi.fn().mockResolvedValue(mockResults),
    } as any);

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
      resultId: validUuid,
      documentName: 'specific.pdf',
      vendorName: 'ACME',
      processingStatus: 'completed',
    };

    vi.mocked(servicesModule.createDocumentService).mockResolvedValue({
      getDocument: vi.fn().mockResolvedValue(mockResult),
    } as any);

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
        resultId: 'uuid-1',
        vendorName: 'ACME',
        processingStatus: 'completed',
      },
    ];

    vi.mocked(servicesModule.createDocumentService).mockResolvedValue({
      getResults: vi.fn().mockResolvedValue(mockResults),
    } as any);

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
        resultId: 'uuid-1',
        processingStatus: 'completed',
      },
    ];

    vi.mocked(servicesModule.createDocumentService).mockResolvedValue({
      getResults: vi.fn().mockResolvedValue(mockResults),
    } as any);

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
    vi.mocked(servicesModule.createDocumentService).mockRejectedValue(
      new Error('Database connection failed')
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
