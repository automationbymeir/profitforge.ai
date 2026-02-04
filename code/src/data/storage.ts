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
    buffer: Buffer,
    contentType?: string
  ): Promise<{ url: string }> {
    const containerClient = this.blobServiceClient.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobPath);

    // Upload with content type metadata
    await blockBlobClient.upload(buffer, buffer.length, {
      blobHTTPHeaders: contentType ? { blobContentType: contentType } : undefined,
    });

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
   * Get blob properties (metadata)
   */
  async getBlobProperties(containerName: string, blobPath: string) {
    const containerClient = this.blobServiceClient.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobPath);

    if (!(await blockBlobClient.exists())) {
      throw new Error(`Blob not found: ${containerName}/${blobPath}`);
    }

    const properties = await blockBlobClient.getProperties();

    return {
      contentType: properties.contentType,
      contentLength: properties.contentLength,
      createdOn: properties.createdOn,
      lastModified: properties.lastModified,
    };
  }
}
