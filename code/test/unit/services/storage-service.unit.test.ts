import { BlobServiceClient } from '@azure/storage-blob';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getStorageService, StorageService } from '../../../src/services/storage-service.js';
import { mockBlobServiceClient } from '../setup/mocks.js';

// Mock Azure Storage SDK
vi.mock('@azure/storage-blob');

describe('StorageService - Unit Tests', () => {
  let storageService: StorageService;
  let mockBlobClient: ReturnType<typeof mockBlobServiceClient>;
  let mockContainerClient: any;
  let mockBlockBlobClient: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockBlobClient = mockBlobServiceClient();
    // Extract the nested mocks for test assertions
    mockContainerClient = mockBlobClient.getContainerClient();
    mockBlockBlobClient = mockContainerClient.getBlockBlobClient();

    vi.mocked(BlobServiceClient).fromConnectionString = vi
      .fn()
      .mockReturnValue(mockBlobClient as any);

    storageService = new StorageService(
      'DefaultEndpointsProtocol=https;AccountName=test;AccountKey=test==;'
    );
  });

  describe('uploadBlob', () => {
    it('should upload blob to correct container', async () => {
      const content = Buffer.from('test pdf content');
      const containerName = 'uploads';
      const blobName = 'vendor/document.pdf';

      const result = await storageService.uploadBlob(containerName, blobName, content);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((mockContainerClient as any).getBlockBlobClient).toHaveBeenCalledWith(blobName);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((mockBlockBlobClient as any).upload).toHaveBeenCalledWith(content, content.length);
      expect(result.url).toBeDefined();
      expect(result.url).toContain('test.blob.core.windows.net');
    });

    it('should handle upload errors gracefully', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockBlockBlobClient as any).upload.mockRejectedValueOnce(new Error('Network error'));

      const content = Buffer.from('test content');
      const containerName = 'uploads';
      const blobName = 'test/file.pdf';

      await expect(storageService.uploadBlob(containerName, blobName, content)).rejects.toThrow(
        'Network error'
      );
    });
  });

  describe('deleteBlob', () => {
    it('should delete blob successfully', async () => {
      const containerName = 'uploads';
      const blobName = 'vendor/document.pdf';

      await storageService.deleteBlob(containerName, blobName);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((mockContainerClient as any).getBlockBlobClient).toHaveBeenCalledWith(blobName);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((mockBlockBlobClient as any).delete).toHaveBeenCalled();
    });

    it('should handle delete errors gracefully', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockBlockBlobClient as any).delete.mockRejectedValueOnce(new Error('Blob not found'));

      const containerName = 'uploads';
      const blobName = 'nonexistent.pdf';

      await expect(storageService.deleteBlob(containerName, blobName)).rejects.toThrow(
        'Blob not found'
      );
    });
  });

  describe('uploadToBronzeLayer', () => {
    it('should upload to bronze layer with metadata', async () => {
      const containerName = 'bronze-layer';
      const blobName = 'ocr-results/test-uuid.json';
      const data = { pages: [], tables: [] };

      await storageService.uploadToBronzeLayer(containerName, blobName, data);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((mockContainerClient as any).getBlockBlobClient).toHaveBeenCalledWith(blobName);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((mockBlockBlobClient as any).upload).toHaveBeenCalled();
    });

    it('should handle bronze layer upload errors', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockBlockBlobClient as any).upload.mockRejectedValueOnce(
        new Error('Storage quota exceeded')
      );

      const containerName = 'bronze-layer';
      const blobName = 'test/data.json';
      const data = {};

      await expect(
        storageService.uploadToBronzeLayer(containerName, blobName, data)
      ).rejects.toThrow('Storage quota exceeded');
    });
  });

  describe('singleton pattern', () => {
    it('should return same instance on multiple calls', () => {
      const instance1 = getStorageService();
      const instance2 = getStorageService();

      expect(instance1).toBe(instance2);
    });

    it('should use singleton BlobServiceClient', () => {
      const instance1 = getStorageService();
      const instance2 = getStorageService();

      // Both instances should share the same underlying client
      expect(instance1).toBe(instance2);
      expect(BlobServiceClient.fromConnectionString).toHaveBeenCalledTimes(1);
    });
  });
});
