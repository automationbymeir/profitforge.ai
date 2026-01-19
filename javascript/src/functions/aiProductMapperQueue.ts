import { app, InvocationContext } from "@azure/functions";
import { aiProductMapperHandler } from "./aiProductMapper.js";

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
 * 3. Calls shared aiProductMapperHandler logic
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
 * - Both queue trigger and HTTP endpoint use same aiProductMapperHandler
 * - Queue provides automatic retry and poison message handling
 */
export async function aiProductMapperQueueTrigger(
  queueItem: unknown,
  context: InvocationContext
): Promise<void> {
  try {
    // Parse queue message
    const message = typeof queueItem === "string" ? JSON.parse(queueItem) : queueItem;
    const documentId = message.documentId;

    context.log(`🔔 Queue trigger: Processing AI mapping for document ${documentId}`);

    if (!documentId) {
      throw new Error("Queue message missing documentId");
    }

    // Create mock HTTP request for handler
    const mockRequest = {
      json: async () => ({ documentId }),
    } as any;

    // Call shared handler logic
    const response = await aiProductMapperHandler(mockRequest, context);

    if (response.status !== 200) {
      throw new Error(`AI mapping failed with status ${response.status}: ${response.body}`);
    }

    const result = JSON.parse(response.body as string);
    context.log(`✅ Queue processing complete: ${result.productCount} products extracted`);
  } catch (error: any) {
    context.error(`❌ Queue processing failed: ${error.message}`);
    // Throw to trigger queue retry mechanism
    throw error;
  }
}

app.storageQueue("aiProductMapperQueue", {
  queueName: "ai-mapping-queue",
  connection: "STORAGE_CONNECTION_STRING",
  handler: aiProductMapperQueueTrigger,
});
