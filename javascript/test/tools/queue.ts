#!/usr/bin/env tsx
/**
 * Azure Storage Queue Management Tool
 *
 * Usage:
 *   tsx test/tools/queue.ts view    - View messages in queue
 *   tsx test/tools/queue.ts purge   - Clear all messages
 *   tsx test/tools/queue.ts test    - Send a test message
 *
 * ============================================================================
 * HOW AZURE STORAGE QUEUES WORK
 * ============================================================================
 *
 * 1. ASYNCHRONOUS OPERATIONS:
 *    - When you add a message, it may take a few seconds to appear in queue
 *      statistics due to eventual consistency
 *    - The `approximateMessagesCount` is not real-time and can lag by 2-5 seconds
 *
 * 2. MESSAGE VISIBILITY & PEEK:
 *    - PEEK: Views messages without making them invisible (read-only operation)
 *    - DEQUEUE: Retrieves a message and makes it invisible for 30 seconds
 *    - During the 30-second "visibility timeout", other consumers can't see the message
 *    - This prevents multiple workers from processing the same message simultaneously
 *
 * 3. MESSAGE LIFECYCLE:
 *    a) Message added to queue
 *    b) Consumer dequeues message (becomes invisible for 30 seconds)
 *    c) Consumer processes message
 *    d) If successful: Consumer explicitly deletes message (removed from queue)
 *    e) If failed/timeout: Message becomes visible again after 30 seconds
 *    f) After 5 failed attempts: Message moves to poison queue
 *
 * 4. WHY MESSAGES "DISAPPEAR":
 *    - When Azure Functions consume messages, they become invisible
 *    - If processing fails, the message reappears after timeout
 *    - If you peek right after a consumer dequeues, you won't see the message
 *    - This is normal behavior - the message isn't deleted, just temporarily invisible
 *
 * 5. POISON QUEUE:
 *    - Messages that fail 5+ times are moved to "[queue-name]-poison"
 *    - These messages won't be retried automatically
 *    - Requires manual investigation and cleanup
 *    - Common causes: Invalid data, database errors, bugs in processing code
 *
 * ============================================================================
 */

import { QueueServiceClient } from '@azure/storage-queue';
import { readFileSync } from 'fs';
import { join } from 'path';

const QUEUE_NAME = 'ai-mapping-queue';
const COMMAND = process.argv[2] || 'view';

interface MessageInfo {
  messageId: string;
  dequeueCount: number;
  insertedOn: Date;
  expiresOn: Date;
  messageText: string;
}

/**
 * Get connection string from local.settings.json
 */
function getConnectionString(): string {
  let connectionString = process.env.STORAGE_CONNECTION_STRING;

  if (!connectionString) {
    try {
      const localSettings = JSON.parse(
        readFileSync(join(process.cwd(), 'local.settings.json'), 'utf-8')
      );
      connectionString = localSettings.Values.STORAGE_CONNECTION_STRING;
    } catch (_err) {
      throw new Error('STORAGE_CONNECTION_STRING not found in environment or local.settings.json');
    }
  }

  if (!connectionString) {
    throw new Error('STORAGE_CONNECTION_STRING not set');
  }

  return connectionString;
}

/**
 * Display queue messages in a formatted way
 */
function displayMessages(messages: MessageInfo[], isPoison: boolean = false) {
  if (messages.length === 0) {
    console.log('   (empty)\n');
    return;
  }

  messages.forEach((msg, i) => {
    console.log(`${i + 1}. Message ID: ${msg.messageId}`);
    console.log(
      `   Dequeue Count: ${msg.dequeueCount}${isPoison ? ' (FAILED - max retries exceeded)' : ''}`
    );
    console.log(`   Inserted: ${msg.insertedOn}`);
    console.log(`   Expires: ${msg.expiresOn}`);

    try {
      // Messages are base64 encoded
      const decoded = Buffer.from(msg.messageText, 'base64').toString('utf-8');
      const content = JSON.parse(decoded);
      console.log(`   Document ID: ${content.documentId}`);
      if (content.testMessage) console.log(`   [TEST MESSAGE]`);
    } catch {
      console.log(`   Content: ${msg.messageText.substring(0, 100)}...`);
    }
    console.log();
  });
}

/**
 * View messages in queue and poison queue
 */
async function viewQueue() {
  console.log(`\n📋 Viewing messages in queue: ${QUEUE_NAME}\n`);

  const connectionString = getConnectionString();
  const queueServiceClient = QueueServiceClient.fromConnectionString(connectionString);
  const queueClient = queueServiceClient.getQueueClient(QUEUE_NAME);
  const poisonQueueClient = queueServiceClient.getQueueClient(`${QUEUE_NAME}-poison`);

  // Main queue
  const properties = await queueClient.getProperties();

  console.log(`📊 MAIN QUEUE (${QUEUE_NAME})`);
  console.log(`   Total messages: ${properties.approximateMessagesCount ?? 0}\n`);

  const peekedMessages = await queueClient.peekMessages({ numberOfMessages: 10 });
  displayMessages(peekedMessages.peekedMessageItems, false);

  // Poison queue
  try {
    const poisonProps = await poisonQueueClient.getProperties();
    console.log(`☠️  POISON QUEUE (${QUEUE_NAME}-poison)`);
    console.log(`   Total messages: ${poisonProps.approximateMessagesCount ?? 0}`);
    console.log(`   (Messages that failed 5+ times)\n`);

    const poisonMessages = await poisonQueueClient.peekMessages({ numberOfMessages: 10 });
    displayMessages(poisonMessages.peekedMessageItems, true);

    if ((poisonProps.approximateMessagesCount ?? 0) > 0) {
      console.log("   💡 Tip: Run 'npm run queue:purge' to clear all messages\n");
    }
  } catch (_e) {
    console.log(`☠️  POISON QUEUE (${QUEUE_NAME}-poison)`);
    console.log(`   Queue doesn't exist yet\n`);
  }
}

/**
 * Purge all messages from queue and poison queue
 */
export async function purgeQueue() {
  console.log(`\n🗑️  Purging queue: ${QUEUE_NAME}\n`);

  const connectionString = getConnectionString();
  const queueServiceClient = QueueServiceClient.fromConnectionString(connectionString);

  // Clear main queue
  const queueClient = queueServiceClient.getQueueClient(QUEUE_NAME);
  const propsBeforeMain = await queueClient.getProperties();
  console.log(
    `📋 Main queue (${QUEUE_NAME}): ${propsBeforeMain.approximateMessagesCount ?? 0} messages`
  );

  if ((propsBeforeMain.approximateMessagesCount ?? 0) > 0) {
    await queueClient.clearMessages();
    console.log(`   ✅ Cleared`);
  } else {
    console.log(`   Already empty`);
  }

  // Clear poison queue
  const poisonQueueClient = queueServiceClient.getQueueClient(`${QUEUE_NAME}-poison`);
  try {
    const propsBeforePoison = await poisonQueueClient.getProperties();
    console.log(
      `\n☠️  Poison queue (${QUEUE_NAME}-poison): ${propsBeforePoison.approximateMessagesCount ?? 0} messages`
    );

    if ((propsBeforePoison.approximateMessagesCount ?? 0) > 0) {
      await poisonQueueClient.clearMessages();
      console.log(`   ✅ Cleared`);
    } else {
      console.log(`   Already empty`);
    }
  } catch (_e) {
    console.log(`   Queue doesn't exist (this is fine)`);
  }

  console.log(`\n✅ Purge complete\n`);
}

/**
 * Send a test message to the queue
 */
async function sendTestMessage() {
  console.log(`📤 Sending test message to ${QUEUE_NAME}...\n`);

  const connectionString = getConnectionString();
  const queueServiceClient = QueueServiceClient.fromConnectionString(connectionString);
  const queueClient = queueServiceClient.getQueueClient(QUEUE_NAME);

  // Create queue if it doesn't exist
  await queueClient.createIfNotExists();

  // Create test message
  const testMessage = {
    documentId: `TEST-${Date.now()}`,
    timestamp: new Date().toISOString(),
    testMessage: true,
  };

  // Send message (base64 encoded)
  await queueClient.sendMessage(Buffer.from(JSON.stringify(testMessage)).toString('base64'));

  console.log('✅ Test message sent successfully!');
  console.log(`   Document ID: ${testMessage.documentId}`);
  console.log('\n💡 Run: npm run queue:view to see the message');
  console.log('   Note: May take 2-5 seconds for message count to update (eventual consistency)\n');
}

/**
 * Show usage help
 */
function showHelp() {
  console.log(`
Azure Storage Queue Management Tool

Usage:
  npm run queue:view    - View messages in queue
  npm run queue:purge   - Clear all messages
  npm run queue:test    - Send a test message

Commands:
  view    View messages in main and poison queues (default)
  purge   Clear all messages from both queues
  test    Send a test message to the main queue
  help    Show this help message

Examples:
  npm run queue:view
  npm run queue:purge
  npm run queue:test
`);
}

// Main execution - only run if called directly (not imported)
if (require.main === module) {
  (async () => {
    try {
      switch (COMMAND) {
        case 'view':
          await viewQueue();
          break;
        case 'purge':
          await purgeQueue();
          break;
        case 'test':
          await sendTestMessage();
          break;
        case 'help':
          showHelp();
          break;
        default:
          console.error(`\n❌ Unknown command: ${COMMAND}\n`);
          showHelp();
          process.exit(1);
      }
    } catch (error: any) {
      console.error(`\n❌ Error: ${error.message}\n`);
      process.exit(1);
    }
  })();
}
