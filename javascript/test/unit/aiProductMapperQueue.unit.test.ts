import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the aiProductMapper module
vi.mock('../../src/functions/aiProductMapper');

import { aiProductMapperHandler } from '../../src/functions/aiProductMapper';
import { aiProductMapperQueueTrigger } from '../../src/functions/aiProductMapperQueue';
import { mockInvocationContext } from './setup/mocks';

describe('AI Product Mapper Queue - Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should process valid queue message with documentId', async () => {
    vi.mocked(aiProductMapperHandler).mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        productCount: 5,
        status: 'completed',
      }),
    } as any);

    const queueMessage = {
      documentId: 'test-uuid-1234',
    };
    const context = mockInvocationContext();

    await aiProductMapperQueueTrigger(queueMessage, context as any);

    expect(aiProductMapperHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        json: expect.any(Function),
      }),
      context
    );
    expect(context.log).toHaveBeenCalledWith(
      expect.stringContaining('Queue trigger: Processing AI mapping')
    );
    expect(context.log).toHaveBeenCalledWith(
      expect.stringContaining('Queue processing complete: 5 products extracted')
    );
  });

  it('should parse string-encoded JSON messages', async () => {
    vi.mocked(aiProductMapperHandler).mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        productCount: 3,
        status: 'completed',
      }),
    } as any);

    const queueMessage = JSON.stringify({
      documentId: 'test-uuid-5678',
    });
    const context = mockInvocationContext();

    await aiProductMapperQueueTrigger(queueMessage, context as any);

    expect(aiProductMapperHandler).toHaveBeenCalled();
    expect(context.error).not.toHaveBeenCalled();
  });

  it('should throw error when documentId is missing', async () => {
    const queueMessage = {
      // Missing documentId
      someOtherField: 'value',
    };
    const context = mockInvocationContext();

    await expect(aiProductMapperQueueTrigger(queueMessage, context as any)).rejects.toThrow(
      'Queue message missing documentId'
    );

    expect(context.error).toHaveBeenCalledWith(expect.stringContaining('Queue processing failed'));
  });

  it('should throw error when aiProductMapperHandler fails', async () => {
    vi.mocked(aiProductMapperHandler).mockResolvedValue({
      status: 500,
      body: JSON.stringify({ error: 'Database error' }),
    } as any);

    const queueMessage = {
      documentId: 'test-uuid-1234',
    };
    const context = mockInvocationContext();

    await expect(aiProductMapperQueueTrigger(queueMessage, context as any)).rejects.toThrow(
      'AI mapping failed with status 500'
    );

    expect(context.error).toHaveBeenCalledWith(expect.stringContaining('Queue processing failed'));
  });

  it('should throw error when aiProductMapperHandler throws', async () => {
    vi.mocked(aiProductMapperHandler).mockRejectedValue(new Error('OpenAI timeout'));

    const queueMessage = {
      documentId: 'test-uuid-1234',
    };
    const context = mockInvocationContext();

    await expect(aiProductMapperQueueTrigger(queueMessage, context as any)).rejects.toThrow(
      'OpenAI timeout'
    );

    expect(context.error).toHaveBeenCalledWith(expect.stringContaining('OpenAI timeout'));
  });

  it('should call handler with correct mock request structure', async () => {
    vi.mocked(aiProductMapperHandler).mockResolvedValue({
      status: 200,
      body: JSON.stringify({ productCount: 1, status: 'completed' }),
    } as any);

    const queueMessage = {
      documentId: 'test-uuid-9999',
    };
    const context = mockInvocationContext();

    await aiProductMapperQueueTrigger(queueMessage, context as any);

    // Verify the mock request passed to handler
    const mockRequest = vi.mocked(aiProductMapperHandler).mock.calls[0][0];
    expect(mockRequest).toHaveProperty('json');
    expect(typeof mockRequest.json).toBe('function');

    // Verify the json() function returns correct documentId
    const body = await mockRequest.json();
    expect(body).toEqual({ documentId: 'test-uuid-9999' });
  });

  it('should handle different documentId formats', async () => {
    vi.mocked(aiProductMapperHandler).mockResolvedValue({
      status: 200,
      body: JSON.stringify({ productCount: 2, status: 'completed' }),
    } as any);

    const testCases = [
      '123e4567-e89b-12d3-a456-426614174000', // Standard UUID
      'test-id-123', // Custom ID format
      'ACME-DOC-2024-001', // Alphanumeric
    ];

    for (const documentId of testCases) {
      const queueMessage = { documentId };
      const context = mockInvocationContext();

      await aiProductMapperQueueTrigger(queueMessage, context as any);

      expect(aiProductMapperHandler).toHaveBeenCalled();
      expect(context.error).not.toHaveBeenCalled();
      vi.clearAllMocks();
      vi.mocked(aiProductMapperHandler).mockResolvedValue({
        status: 200,
        body: JSON.stringify({ productCount: 2, status: 'completed' }),
      } as any);
    }
  });

  it('should log success message with product count', async () => {
    vi.mocked(aiProductMapperHandler).mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        productCount: 15,
        status: 'completed',
        aiTokensUsed: 1200,
      }),
    } as any);

    const queueMessage = { documentId: 'test-uuid' };
    const context = mockInvocationContext();

    await aiProductMapperQueueTrigger(queueMessage, context as any);

    expect(context.log).toHaveBeenCalledWith(expect.stringContaining('15 products extracted'));
  });

  it('should propagate errors for queue retry mechanism', async () => {
    // When an error is thrown, the queue should retry the message
    vi.mocked(aiProductMapperHandler).mockRejectedValue(new Error('Temporary network issue'));

    const queueMessage = { documentId: 'test-uuid' };
    const context = mockInvocationContext();

    // Expect error to be thrown (not caught)
    await expect(aiProductMapperQueueTrigger(queueMessage, context as any)).rejects.toThrow(
      'Temporary network issue'
    );

    // Error should be logged
    expect(context.error).toHaveBeenCalled();
  });

  it('should handle malformed JSON in string messages', async () => {
    const malformedJson = '{ invalid json }';
    const context = mockInvocationContext();

    await expect(aiProductMapperQueueTrigger(malformedJson, context as any)).rejects.toThrow();

    expect(context.error).toHaveBeenCalled();
  });

  it('should handle empty queue message', async () => {
    const emptyMessage = {};
    const context = mockInvocationContext();

    await expect(aiProductMapperQueueTrigger(emptyMessage, context as any)).rejects.toThrow(
      'Queue message missing documentId'
    );
  });

  it('should handle null documentId', async () => {
    const messageWithNullId = {
      documentId: null,
    };
    const context = mockInvocationContext();

    await expect(aiProductMapperQueueTrigger(messageWithNullId, context as any)).rejects.toThrow(
      'Queue message missing documentId'
    );
  });

  it('should handle empty string documentId', async () => {
    const messageWithEmptyId = {
      documentId: '',
    };
    const context = mockInvocationContext();

    await expect(aiProductMapperQueueTrigger(messageWithEmptyId, context as any)).rejects.toThrow(
      'Queue message missing documentId'
    );
  });
});
