import { BlobServiceClient } from '@azure/storage-blob';

/**
 * StorageService - Encapsulates Azure Blob Storage operations
 *
 * Provides centralized methods for:
 * - Uploading files to blob storage
 * - Deleting blobs
 * - Managing bronze-layer audit trail storage
 *
 * Uses singleton BlobServiceClient for connection reuse.
 */
export class StorageService {
  private blobServiceClient: BlobServiceClient;

  constructor(connectionString: string) {
    this.blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  }

  /**
   * Upload a file buffer to blob storage
   */
  async uploadBlob(
    containerName: string,
    blobPath: string,
    buffer: Buffer
  ): Promise<{ url: string }> {
    const containerClient = this.blobServiceClient.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobPath);

    await blockBlobClient.upload(buffer, buffer.length);

    return {
      url: blockBlobClient.url,
    };
  }

  /**
   * Delete a blob from storage
   */
  async deleteBlob(containerName: string, blobPath: string): Promise<void> {
    const containerClient = this.blobServiceClient.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobPath);

    await blockBlobClient.delete();
  }

  /**
   * Upload JSON data to bronze-layer storage for audit trail
   */
  async uploadToBronzeLayer(
    containerName: string,
    path: string,
    data: unknown
  ): Promise<{ url: string }> {
    const jsonBuffer = Buffer.from(JSON.stringify(data, null, 2));
    return this.uploadBlob(containerName, path, jsonBuffer);
  }

  /**
   * Upload text data to bronze-layer storage
   */
  async uploadTextToBronzeLayer(
    containerName: string,
    path: string,
    text: string
  ): Promise<{ url: string }> {
    const textBuffer = Buffer.from(text);
    return this.uploadBlob(containerName, path, textBuffer);
  }
}

// Singleton instance
let storageServiceInstance: StorageService | null = null;

/**
 * Get or create singleton StorageService instance
 */
export function getStorageService(): StorageService {
  if (!storageServiceInstance) {
    const connectionString = process.env.STORAGE_CONNECTION_STRING;
    if (!connectionString) {
      throw new Error('STORAGE_CONNECTION_STRING environment variable is not set');
    }
    storageServiceInstance = new StorageService(connectionString);
  }
  return storageServiceInstance;
}
