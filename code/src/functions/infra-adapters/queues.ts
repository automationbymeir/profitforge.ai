import { app, InvocationContext } from '@azure/functions';
import { createAIService, createOCRService } from '../../services/index.js';

import { QueueClient, QueueServiceClient } from '@azure/storage-queue';

/**
 * Message types for type-safe queue operations
 */
export interface OCRQueueMessage {
  documentId: string;
  blobPath: string;
}

export interface AIMappingQueueMessage {
  documentId: string;
}

/**
 * QueueService - Encapsulates Azure Storage Queue operations
 *
 * Provides centralized methods for:
 * - Sending messages to queues
 * - Type-safe message handling
 * - Queue initialization
 *
 * Uses singleton QueueServiceClient for connection reuse.
 */
export class QueueService {
  private queueServiceClient: QueueServiceClient;
  private queueClients: Map<string, QueueClient> = new Map();

  constructor(connectionString: string) {
    this.queueServiceClient = QueueServiceClient.fromConnectionString(connectionString);
  }

  /**
   * Get or create a queue client (with caching)
   */
  private async getQueueClient(queueName: string): Promise<QueueClient> {
    if (!this.queueClients.has(queueName)) {
      const queueClient = this.queueServiceClient.getQueueClient(queueName);
      await queueClient.createIfNotExists();
      this.queueClients.set(queueName, queueClient);
    }
    return this.queueClients.get(queueName)!;
  }

  /**
   * Send a message to a queue
   * @param queueName - Name of the queue
   * @param message - Message object (will be JSON stringified and base64 encoded)
   */
  async sendMessage<T = unknown>(queueName: string, message: T): Promise<void> {
    const queueClient = await this.getQueueClient(queueName);
    const messageText = Buffer.from(JSON.stringify(message)).toString('base64');
    await queueClient.sendMessage(messageText);
  }

  /**
   * Send OCR processing message
   */
  async queueOCRProcessing(documentId: string, blobPath: string): Promise<void> {
    const queueName = process.env.OCR_QUEUE_NAME || 'ocr-queue';
    const message: OCRQueueMessage = { documentId, blobPath };
    await this.sendMessage(queueName, message);
  }

  /**
   * Send AI mapping message
   */
  async queueAIMapping(documentId: string): Promise<void> {
    const queueName = process.env.AI_MAPPING_QUEUE_NAME || 'ai-mapping-queue';
    const message: AIMappingQueueMessage = { documentId };
    await this.sendMessage(queueName, message);
  }
}

/**
 * OCR Queue Trigger - Ultra-thin handler
 *
 * Triggered by messages in "ocr-queue" storage queue
 * Delegates all logic to OCRService
 */
export async function ocrQueueHandler(
  queueItem: unknown,
  context: InvocationContext
): Promise<void> {
  try {
    const message = typeof queueItem === 'string' ? JSON.parse(queueItem) : queueItem;
    const { documentId, blobPath } = message as OCRQueueMessage;

    context.log(`🔔 OCR Queue: Processing document ${documentId} from ${blobPath}`);

    if (!documentId || !blobPath) {
      throw new Error('Queue message missing documentId or blobPath');
    }

    const ocrService = await createOCRService();
    await ocrService.processDocumentFromQueue(documentId, blobPath);

    context.log(`✅ OCR complete for ${documentId}`);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    context.error(`❌ OCR failed: ${errorMessage}`);
    throw error; // Trigger queue retry
  }
}

app.storageQueue('ocrQueue', {
  queueName: 'ocr-queue',
  connection: 'STORAGE_CONNECTION_STRING',
  handler: ocrQueueHandler,
});

/**
 * AI Product Mapper Queue Trigger
 *
 * TRIGGERED BY: Messages in "ai-mapping-queue" storage queue
 *
 * PURPOSE:
 * - Decouples OCR processing from AI mapping
 * - Provides automatic retry on failures (queue retry policy)
 * - Better scalability for high-volume processing
 *
 * WORKFLOW:
 * 1. OCR completes → documentProcessor.ts sends message to queue
 * 2. Queue trigger fires → this function processes message
 * 3. Calls AIService.mapProducts() for business logic
 * 4. On success: message deleted from queue
 * 5. On failure: message returned to queue for retry (up to 5 times by default)
 *
 * MESSAGE FORMAT:
 * {
 *   "documentId": "uuid-string"
 * }
 *
 * NOTES:
 * - HTTP endpoint /api/aiProductMapper still available for manual/UI reprocessing
 * - Both queue trigger and HTTP endpoint use same AIService
 * - Queue provides automatic retry and poison message handling
 */
export async function aiProductMapperQueueTrigger(
  queueItem: unknown,
  context: InvocationContext
): Promise<void> {
  try {
    // Parse queue message
    const message = typeof queueItem === 'string' ? JSON.parse(queueItem) : queueItem;
    const documentId = message.documentId;

    context.log(`🔔 Queue trigger: Processing AI mapping for document ${documentId}`);

    if (!documentId) {
      throw new Error('Queue message missing documentId');
    }

    // Use AIService for mapping logic
    const aiService = await createAIService();
    const result = await aiService.mapProducts(documentId);

    context.log(
      `✅ Queue processing complete: ${result.mappingResultJson.productCount} products extracted`
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    context.error(`❌ Queue processing failed: ${errorMessage}`);
    // Throw to trigger queue retry mechanism
    throw error;
  }
}

app.storageQueue('aiProductMapperQueue', {
  queueName: 'ai-mapping-queue',
  connection: 'STORAGE_CONNECTION_STRING',
  handler: aiProductMapperQueueTrigger,
});
