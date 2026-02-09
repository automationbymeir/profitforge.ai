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
   * List blobs in a container with optional prefix
   */
  async listBlobs(containerName: string, prefix?: string): Promise<string[]> {
    const containerClient = this.blobServiceClient.getContainerClient(containerName);
    const blobNames: string[] = [];

    for await (const blob of containerClient.listBlobsFlat({ prefix })) {
      blobNames.push(blob.name);
    }

    return blobNames;
  }

  /**
   * Get the document path for a vendor
   * Finds the first PDF file uploaded for the given vendor
   *
   * @param vendorName - Vendor name to find document for
   * @returns Document path in format: vendorName/filename.pdf
   * @throws Error if no PDF document found for vendor
   */
  async getDocumentPathForVendor(vendorName: string): Promise<string> {
    // List blobs under vendor prefix
    const blobs = await this.listBlobs('uploads', `${vendorName}/`);

    // Find PDF files
    const pdfFiles = blobs.filter((blob) => blob.toLowerCase().endsWith('.pdf'));

    if (pdfFiles.length === 0) {
      throw new Error(`No PDF document found for vendor ${vendorName}`);
    }

    // Return the first PDF (assuming one document per vendor for now)
    return pdfFiles[0];
  }

  /**
   * Check if OCR cache exists and return metadata
   * Returns null if cache doesn't exist
   */
  async checkOCRCache(
    containerName: string,
    cachePath: string
  ): Promise<{
    cost: number;
    confidenceScore?: number;
    ocrStartTime: number;
    ocrEndTime: number;
    pageCount: number;
    tableCount: number;
  } | null> {
    try {
      const containerClient = this.blobServiceClient.getContainerClient(containerName);
      const blobClient = containerClient.getBlobClient(cachePath);

      const exists = await blobClient.exists();
      if (!exists) {
        return null;
      }

      // Download and parse cached OCR results
      const downloadResponse = await blobClient.download();
      if (!downloadResponse.readableStreamBody) {
        return null;
      }

      const chunks: Buffer[] = [];
      for await (const chunk of downloadResponse.readableStreamBody) {
        chunks.push(Buffer.from(chunk));
      }
      const buffer = Buffer.concat(chunks);
      const cachedData = JSON.parse(buffer.toString('utf-8'));

      // Return only metadata needed for DB
      return {
        cost: cachedData.metaData?.processingCost || 0,
        confidenceScore: cachedData.metaData?.confidenceScore,
        ocrStartTime: cachedData.metaData?.ocrStartTime || 0,
        ocrEndTime: cachedData.metaData?.ocrEndTime || 0,
        pageCount: cachedData.ocrResponse?.pages?.length || 0,
        tableCount: cachedData.ocrResponse?.tables?.length || 0,
      };
    } catch (error) {
      console.error(`❌ Error checking OCR cache at ${cachePath}:`, error);
      return null;
    }
  }

  /**
   * Download PDF blob for OCR processing
   * Returns buffer containing the PDF file
   */
  async downloadPdfForOCR(containerName: string, blobPath: string): Promise<Buffer> {
    try {
      const containerClient = this.blobServiceClient.getContainerClient(containerName);
      const blobClient = containerClient.getBlobClient(blobPath);

      const exists = await blobClient.exists();
      if (!exists) {
        throw new Error(`Blob not found: ${containerName}/${blobPath}`);
      }

      const downloadResponse = await blobClient.download();
      if (!downloadResponse.readableStreamBody) {
        throw new Error(`Failed to download blob stream: ${containerName}/${blobPath}`);
      }

      const chunks: Buffer[] = [];
      for await (const chunk of downloadResponse.readableStreamBody) {
        chunks.push(Buffer.from(chunk));
      }

      return Buffer.concat(chunks);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to download PDF for OCR from ${blobPath}: ${errorMsg}`);
    }
  }

  /**
   * Upload OCR results with metadata to blob storage
   */
  async uploadOCRResults(
    containerName: string,
    cachePath: string,
    ocrResponse: unknown,
    metadata: {
      ocrStartTime: number;
      ocrEndTime: number;
      processingCost: number;
      confidenceScore?: number;
    }
  ): Promise<{ url: string }> {
    try {
      const ocrResult = {
        metaData: metadata,
        ocrResponse,
      };

      const jsonBuffer = Buffer.from(JSON.stringify(ocrResult, null, 2));
      return await this.uploadBlob(containerName, cachePath, jsonBuffer, 'application/json');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to upload OCR results to ${cachePath}: ${errorMsg}`);
    }
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
   * Get blob size in bytes
   *
   * @param blobPath - Path to the blob (assumes 'uploads' container)
   * @returns File size in bytes
   * @throws Error if blob not found
   */
  async getBlobSize(blobPath: string): Promise<number> {
    const containerClient = this.blobServiceClient.getContainerClient('uploads');
    const blockBlobClient = containerClient.getBlockBlobClient(blobPath);

    if (!(await blockBlobClient.exists())) {
      throw new Error(`Blob not found: uploads/${blobPath}`);
    }

    const properties = await blockBlobClient.getProperties();
    return properties.contentLength || 0;
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

  /**
   * Download blob content as Buffer
   */
  async downloadBlob(containerName: string, blobPath: string): Promise<Buffer | null> {
    const containerClient = this.blobServiceClient.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobPath);

    if (!(await blockBlobClient.exists())) {
      return null;
    }

    const downloadResponse = await blockBlobClient.download(0);

    if (!downloadResponse.readableStreamBody) {
      return null;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of downloadResponse.readableStreamBody) {
      chunks.push(Buffer.from(chunk));
    }

    return Buffer.concat(chunks);
  }

  /**
   * Upload OCR structured data (Document Intelligence JSON) to bronze layer
   *
   * Stores the OCR result as: <vendorName>/ocr-azure.json
   * usage: uploadOcrData('bronze-container', 'VENDOR_01', ocrDataJson);
   */
  async uploadOcrData(
    containerName: string,
    vendorName: string,
    ocrDataJson: string
  ): Promise<{ url: string }> {
    const blobPath = `${vendorName}/ocr-azure.json`;
    const buffer = Buffer.from(ocrDataJson, 'utf-8');

    return this.uploadBlob(containerName, blobPath, buffer, 'application/json');
  }
}
