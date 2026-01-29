import { app, InvocationContext } from '@azure/functions';
import { getAIService } from '../services/index.js';

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
    const aiService = getAIService();
    const result = await aiService.mapProducts(documentId);

    context.log(`✅ Queue processing complete: ${result.productCount} products extracted`);
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
