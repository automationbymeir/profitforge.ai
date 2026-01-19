#!/bin/bash
# Purge AI mapping queue before testing

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Purging ai-mapping-queue...${NC}"

# This would require Azure CLI:
# az storage message clear --queue-name ai-mapping-queue --connection-string "$STORAGE_CONNECTION_STRING"

# Alternative using Node.js
node -e "
const { QueueServiceClient } = require('@azure/storage-queue');

async function purgeQueue() {
  try {
    const connectionString = process.env.STORAGE_CONNECTION_STRING;
    if (!connectionString) {
      throw new Error('STORAGE_CONNECTION_STRING not set');
    }

    const queueServiceClient = QueueServiceClient.fromConnectionString(connectionString);
    const queueClient = queueServiceClient.getQueueClient('ai-mapping-queue');
    
    await queueClient.clearMessages();
    console.log('✅ Queue purged successfully');
    
    // Also purge poison queue if it exists
    const poisonQueueClient = queueServiceClient.getQueueClient('ai-mapping-queue-poison');
    try {
      await poisonQueueClient.clearMessages();
      console.log('✅ Poison queue purged successfully');
    } catch (e) {
      console.log('ℹ️  No poison queue to purge');
    }
  } catch (error) {
    console.error('❌ Error purging queue:', error.message);
    process.exit(1);
  }
}

purgeQueue();
"

echo -e "${GREEN}Queue purge complete${NC}"
