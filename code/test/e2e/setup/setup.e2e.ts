/**
 * E2E Processing Test Setup
 *
 * Tests using REAL Azure AI services (Document Intelligence, OpenAI) on dev stack.
 * These are expensive and slow - only for critical happy paths.
 */

import { afterAll } from 'vitest';
import { cleanBlobs, cleanDatabase } from '../../tools/cleanup';

// skip cleanup if using local functions
const useLocalFunctions = process.env.FUNCTION_APP_URL?.includes('http://localhost:');
console.log(`Using local Functions app: ${useLocalFunctions}`);
afterAll(async () => {
  if (useLocalFunctions) {
    console.log('⚠️  Skipping e2e cleanup (using local Functions app)');
    return;
  }
  console.log('🧹 Cleaning up e2e test data...');
  // Clean blobs (non-critical if it fails)
  try {
    await cleanBlobs();
    console.log('✓ Blobs cleaned');
  } catch (error) {
    console.warn('⚠️  Blob cleanup failed (non-critical):', error);
  }
  // Clean database
  try {
    await cleanDatabase();
    console.log('✓ Database cleaned');
  } catch (error) {
    console.error('❌ Database cleanup failed:', error);
    throw error;
  }
});
