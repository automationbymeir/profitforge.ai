/**
 * Azurite (Azure Storage Emulator) Utilities
 *
 * Helpers for managing local blob storage and queues in integration tests.
 */

import { BlobServiceClient } from '@azure/storage-blob';
import { QueueServiceClient } from '@azure/storage-queue';

// Azurite connection strings (local blob/queue emulator)
export const AZURITE_BLOB_CONNECTION_STRING =
  'DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;QueueEndpoint=http://127.0.0.1:10001/devstoreaccount1;';

export const AZURITE_QUEUE_CONNECTION_STRING = AZURITE_BLOB_CONNECTION_STRING;

// Azurite default credentials
const _AZURITE_ACCOUNT_NAME = 'devstoreaccount1';
const _AZURITE_ACCOUNT_KEY =
  'Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==';

export const TEST_CONTAINER_NAME = 'test-uploads';
export const TEST_QUEUE_NAME = 'test-mapping-queue';

/**
 * Get Azurite blob service client
 */
export function getAzuriteBlobClient(): BlobServiceClient {
  return BlobServiceClient.fromConnectionString(AZURITE_BLOB_CONNECTION_STRING);
}

/**
 * Get Azurite queue service client
 */
export function getAzuriteQueueClient(): QueueServiceClient {
  return QueueServiceClient.fromConnectionString(AZURITE_QUEUE_CONNECTION_STRING);
}

/**
 * Set up Azurite test containers (blob and queue)
 */
export async function setupAzuriteContainers(): Promise<void> {
  // Create blob container
  const blobClient = getAzuriteBlobClient();
  const containerClient = blobClient.getContainerClient(TEST_CONTAINER_NAME);

  if (!(await containerClient.exists())) {
    await containerClient.create();
  }

  // Create queue
  const queueClient = getAzuriteQueueClient();
  const queueInstance = queueClient.getQueueClient(TEST_QUEUE_NAME);

  if (!(await queueInstance.exists())) {
    await queueInstance.create();
  }
}

/**
 * Clean all blobs from test container
 */
export async function cleanAzuriteBlobs(): Promise<void> {
  const blobClient = getAzuriteBlobClient();
  const containerClient = blobClient.getContainerClient(TEST_CONTAINER_NAME);

  if (await containerClient.exists()) {
    for await (const blob of containerClient.listBlobsFlat()) {
      await containerClient.deleteBlob(blob.name);
    }
  }
}

/**
 * Clean all messages from test queue
 */
export async function cleanAzuriteQueue(): Promise<void> {
  const queueClient = getAzuriteQueueClient();
  const queueInstance = queueClient.getQueueClient(TEST_QUEUE_NAME);

  if (await queueInstance.exists()) {
    await queueInstance.clearMessages();
  }
}

/**
 * Upload a test blob to Azurite
 */
export async function uploadTestBlob(blobName: string, content: Buffer | string): Promise<string> {
  const blobClient = getAzuriteBlobClient();
  const containerClient = blobClient.getContainerClient(TEST_CONTAINER_NAME);
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  await blockBlobClient.upload(content, Buffer.byteLength(content));

  return blockBlobClient.url;
}

/**
 * Get blob content from Azurite
 */
export async function getTestBlob(blobName: string): Promise<Buffer> {
  const blobClient = getAzuriteBlobClient();
  const containerClient = blobClient.getContainerClient(TEST_CONTAINER_NAME);
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  const downloadResponse = await blockBlobClient.download();
  const chunks: Buffer[] = [];

  for await (const chunk of downloadResponse.readableStreamBody!) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

/**
 * Send a message to test queue
 */
export async function sendTestQueueMessage(message: any): Promise<void> {
  const queueClient = getAzuriteQueueClient();
  const queueInstance = queueClient.getQueueClient(TEST_QUEUE_NAME);

  await queueInstance.sendMessage(JSON.stringify(message));
}

/**
 * Get queue message count
 */
export async function getQueueMessageCount(): Promise<number> {
  const queueClient = getAzuriteQueueClient();
  const queueInstance = queueClient.getQueueClient(TEST_QUEUE_NAME);

  const properties = await queueInstance.getProperties();
  return properties.approximateMessagesCount || 0;
}
