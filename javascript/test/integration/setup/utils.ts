/**
 * Integration Test Setup Utilities
 *
 * Helpers for managing local blob storage, queues, Docker, and database in integration tests.
 * Uses environment variables loaded from .env.integration (or defaults)
 */

import { BlobServiceClient } from '@azure/storage-blob';
import { QueueServiceClient } from '@azure/storage-queue';
import { ChildProcess, spawn } from 'child_process';
import sql from 'mssql';

// Module-level variables
let dockerProcess: ChildProcess | null = null;
let pool: sql.ConnectionPool | null = null;

/**
 * Get Azurite blob service client
 */
export function getAzuriteBlobClient(): BlobServiceClient {
  const connectionString = process.env.STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error('STORAGE_CONNECTION_STRING environment variable is required');
  }
  return BlobServiceClient.fromConnectionString(connectionString);
}

/**
 * Get Azurite queue service client
 */
export function getAzuriteQueueClient(): QueueServiceClient {
  const connectionString = process.env.STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error('STORAGE_CONNECTION_STRING environment variable is required');
  }
  return QueueServiceClient.fromConnectionString(connectionString);
}

/**
 * Set up Azurite containers for integration tests
 * Creates the containers that the Functions app expects
 */
export async function setupAzuriteContainers(): Promise<void> {
  const blobClient = getAzuriteBlobClient();

  // Create the "uploads" container that Functions app expects
  const uploadsContainer = blobClient.getContainerClient('uploads');
  if (!(await uploadsContainer.exists())) {
    await uploadsContainer.create();
    console.log("✓ Created 'uploads' blob container");
  }

  // Also create bronze-layer for OCR results
  const bronzeContainer = blobClient.getContainerClient('bronze-layer');
  if (!(await bronzeContainer.exists())) {
    await bronzeContainer.create();
    console.log("✓ Created 'bronze-layer' blob container");
  }

  // Create test queue (using default queue name)
  const queueClient = getAzuriteQueueClient();
  const queueInstance = queueClient.getQueueClient('ocr-processing');
  if (!(await queueInstance.exists())) {
    await queueInstance.create();
    console.log("✓ Created 'ocr-processing' queue");
  }
}

/**
 * Clean all blobs from test containers
 */
export async function cleanAzuriteBlobs(): Promise<void> {
  const blobClient = getAzuriteBlobClient();

  // Clean both containers
  const containers = ['uploads', 'bronze-layer'];
  for (const containerName of containers) {
    const containerClient = blobClient.getContainerClient(containerName);
    if (await containerClient.exists()) {
      for await (const blob of containerClient.listBlobsFlat()) {
        await containerClient.deleteBlob(blob.name);
      }
    }
  }
}

/**
 * Clean all messages from test queue
 */
export async function cleanAzuriteQueue(): Promise<void> {
  const queueClient = getAzuriteQueueClient();
  const queueInstance = queueClient.getQueueClient('ocr-processing');

  if (await queueInstance.exists()) {
    await queueInstance.clearMessages();
  }
}

/**
 * Test Database Utilities deployed with dockerised SQL Server Edge
 *
 * Helpers for managing the test database (Docker SQL Server Edge).
 * EXACT match of production database - same schema, same field names.
 */

export function startDocker(): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log('🐳 Starting Docker containers...');

    dockerProcess = spawn(
      'docker',
      ['compose', '-f', 'test/integration/setup/docker-compose.test.yml', 'up', '-d'],
      {
        stdio: 'pipe',
      }
    );

    let output = '';
    dockerProcess.stdout?.on('data', (data) => {
      output += data.toString();
    });

    dockerProcess.stderr?.on('data', (data) => {
      output += data.toString();
    });

    dockerProcess.on('close', (code) => {
      if (code === 0) {
        console.log('✓ Docker containers started');
        resolve();
      } else {
        reject(new Error(`Docker failed with code ${code}: ${output}`));
      }
    });
  });
}

export function stopDocker(): Promise<void> {
  return new Promise((resolve) => {
    console.log('🐳 Stopping Docker containers...');

    const stop = spawn(
      'docker',
      ['compose', '-f', 'test/integration/setup/docker-compose.test.yml', 'down', '-v'],
      {
        stdio: 'pipe',
      }
    );

    stop.on('close', () => {
      console.log('✓ Docker containers stopped');
      resolve();
    });
  });
}

/**
 * Get or create database connection pool
 */
export async function getTestDbPool(): Promise<sql.ConnectionPool> {
  if (pool && pool.connected) {
    return pool;
  }

  const connectionString = process.env.SQL_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error('SQL_CONNECTION_STRING environment variable is required');
  }

  pool = new sql.ConnectionPool(connectionString);
  await pool.connect();
  return pool;
}

/**
 * Close database connection pool
 */
export async function closeTestDbPool(): Promise<void> {
  if (pool) {
    await pool.close();
    pool = null;
  }
}

/**
 * Wait for database to be ready (with retry logic)
 * Used by global setup to ensure Docker SQL Server is ready before starting tests
 */
export async function waitForDatabase(maxAttempts: number = 30): Promise<void> {
  const connectionString = process.env.SQL_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error('SQL_CONNECTION_STRING environment variable is required');
  }

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const testPool = new sql.ConnectionPool(connectionString);
      await testPool.connect();
      await testPool.close();
      console.log('✓ Database is ready');
      return;
    } catch (error) {
      if (i === maxAttempts - 1) {
        throw new Error(`Database failed to start after ${maxAttempts} attempts: ${error}`);
      }
      // Wait 2 seconds between attempts
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

/**
 * Clean all test data from database
 */
export async function cleanTestDatabase(): Promise<void> {
  const db = await getTestDbPool();

  // Delete in correct order (respect foreign keys)
  // Note: Using raw SQL here is fine for test cleanup as repositories don't have deleteAll methods
  await db.request().query('DELETE FROM vvocr.vendor_products');
  await db.request().query('DELETE FROM vvocr.document_processing_results');
}
