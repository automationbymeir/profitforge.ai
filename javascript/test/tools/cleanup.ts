#!/usr/bin/env tsx
/**
 * Cleanup test data from blob storage and database in remote resources (e2e)
 *
 * This TypeScript version is more reliable than the bash script as it:
 * - Uses Azure SDK directly (no Azure CLI required)
 * - Provides better error handling and logging
 * - Works consistently across platforms
 *
 * Usage:
 *   tsx test/tools/cleanup.ts           - Clean everything (default)
 *   tsx test/tools/cleanup.ts blobs     - Clean blobs only
 *   tsx test/tools/cleanup.ts db        - Clean database only
 */

import { BlobServiceClient } from '@azure/storage-blob';
import { readFileSync } from 'fs';
import sql from 'mssql';
import { join } from 'path';
import { purgeQueue } from './queue.js';

const CONTAINER_NAME = 'uploads';

/**
 * Get storage connection string from environment or local.settings.json
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
    throw new Error('STORAGE_CONNECTION_STRING is empty');
  }

  return connectionString;
}

/**
 * Get database connection string from environment or local.settings.json
 */
function getDbConnectionString(): string {
  let connectionString = process.env.SQL_CONNECTION_STRING;

  if (!connectionString) {
    try {
      const localSettings = JSON.parse(
        readFileSync(join(process.cwd(), 'local.settings.json'), 'utf-8')
      );
      connectionString = localSettings.Values.SQL_CONNECTION_STRING;
    } catch (_err) {
      throw new Error('SQL_CONNECTION_STRING not found in environment or local.settings.json');
    }
  }

  if (!connectionString) {
    throw new Error('SQL_CONNECTION_STRING is empty');
  }

  return connectionString;
}

/**
 * Clean all messages from the AI mapping queue
 * Delegates to purgeQueue() from queue.ts
 */
export async function cleanQueue() {
  await purgeQueue();
}

/**
 * Clean all blobs from the uploads container
 */
export async function cleanBlobs() {
  console.log('🗑️  Cleaning blob storage...');

  try {
    const connectionString = getConnectionString();
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);

    // Check if container exists
    const exists = await containerClient.exists();
    if (!exists) {
      console.log(`   Container '${CONTAINER_NAME}' does not exist`);
      return;
    }

    // List and delete all blobs
    let deletedCount = 0;
    for await (const blob of containerClient.listBlobsFlat()) {
      await containerClient.deleteBlob(blob.name);
      deletedCount++;
    }

    console.log(`✅ Blob storage cleaned (${deletedCount} blobs deleted)`);
  } catch (error: any) {
    console.error(`❌ Blob cleanup failed: ${error.message}`);
    throw error;
  }
}

/**
 * Clean all records from database tables
 */
export async function cleanDatabase() {
  console.log('🗑️  Cleaning database...');

  try {
    const connectionString = getDbConnectionString();
    const pool = new sql.ConnectionPool(connectionString);
    await pool.connect();

    // Get counts first
    const docCountResult = await pool
      .request()
      .query('SELECT COUNT(*) as count FROM vvocr.document_processing_results');
    const vendorProductsCount = await pool
      .request()
      .query('SELECT COUNT(*) as count FROM vvocr.vendor_products');

    const docCount = docCountResult.recordset[0].count;
    const productCount = vendorProductsCount.recordset[0].count;

    console.log(`   Document records: ${docCount}`);
    console.log(`   Vendor products: ${productCount}`);

    if (docCount === 0 && productCount === 0) {
      console.log(`✅ Database already clean`);
      await pool.close();
      return;
    }

    // Delete vendor_products first (child table with FK constraint)
    await pool.request().query('DELETE FROM vvocr.vendor_products');

    // Delete all document_processing_results records
    await pool.request().query('DELETE FROM vvocr.document_processing_results');

    console.log(`✅ Database cleaned (${docCount} documents, ${productCount} products deleted)`);

    await pool.close();
  } catch (error: any) {
    console.error(`❌ Database cleanup failed: ${error.message}`);
    throw error;
  }
}

/**
 * Main execution
 */
async function main() {
  const command = process.argv[2] || 'all';

  console.log('\n🗑️  Starting cleanup...\n');

  try {
    if (command === 'all' || command === 'blobs') {
      await cleanBlobs();
      console.log();
    }

    if (command === 'all' || command === 'queue') {
      await cleanQueue();
      console.log();
    }

    if (command === 'all' || command === 'db') {
      await cleanDatabase();
      console.log();
    }

    if (command !== 'all' && command !== 'blobs' && command !== 'queue' && command !== 'db') {
      console.error(`❌ Unknown command: ${command}`);
      console.log('\nUsage:');
      console.log('  tsx test/tools/cleanup.ts           - Clean everything');
      console.log('  tsx test/tools/cleanup.ts blobs     - Clean blobs only');
      console.log('  tsx test/tools/cleanup.ts queue     - Clean queue only');
      console.log('  tsx test/tools/cleanup.ts db        - Clean database only');
      process.exit(1);
    }

    console.log('✅ Cleanup complete\n');
  } catch (error: any) {
    console.error(`\n❌ Cleanup failed: ${error.message}\n`);
  }
}

// Only run main if called directly (not imported)
if (require.main === module) {
  main();
}
