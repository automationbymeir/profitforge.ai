/**
 * Vitest Global Setup for E2E Tests
 *
 * E2E tests use production Azure resources (database, blob storage, AI services).
 * Two modes:
 * 1. Local dev: Start local Functions app with production credentials
 * 2. CI/CD: Use deployed Functions app (FUNCTION_APP_URL env var)
 */

import { ChildProcess } from 'child_process';
import { config } from 'dotenv';
import { existsSync, unlinkSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { getTestConfig, TestMode } from '../../config.js';
import { cleanBlobs, cleanQueue } from '../../tools/cleanup';
import {
  registerSignalHandlers,
  startFunctions,
  stopFunctions,
  waitForFunctions,
} from '../../tools/setup-utils.js';

const SETTINGS_PATH = 'local.settings.json';
const FUNC_LOG_PATH = 'test/functions-e2e-output.log';
const FUNC_ERROR_LOG_PATH = 'test/functions-e2e-error.log';

let functionsProcess: ChildProcess | null = null;
let isCleaningUp = false;
const useLocalFunctions = process.env.FUNCTION_APP_URL?.includes('http://localhost:');

/**
 * Cleanup function
 */
async function cleanup() {
  if (isCleaningUp) return;
  isCleaningUp = true;

  console.log('\n🧹 Cleaning up test environment...\n');

  // Stop Functions if we started it locally
  if (useLocalFunctions) {
    await stopFunctions(functionsProcess);

    // Delete local.settings.json (e2e-specific config)
    if (existsSync(SETTINGS_PATH)) {
      unlinkSync(SETTINGS_PATH);
      console.log('✓ Deleted local.settings.json');
    }
  }

  console.log('\n✅ Test environment cleaned up!\n');
}

/**
 * Global setup for e2e tests
}

/**
 * Clean up old test data from production Azure before starting tests
 * 
 * Note: We only clean blobs and queue messages, NOT the database because:
 * - Database records don't trigger any automation (only blobs/queues do)
 * - Tests create isolated data with unique test vendor names
 * - Preserving old test data helps with debugging
 */
async function cleanupOldTestData(): Promise<void> {
  try {
    console.log('🧹 Cleaning up old test data from Azure...');

    // Use existing cleanup functions
    await cleanBlobs();
    await cleanQueue();

    console.log('✓ Old test data cleaned');
  } catch (error) {
    console.warn('⚠️  Failed to clean old test data (non-critical):', error);
  }
}

export default async function globalSetup() {
  const mode = 'e2e' as TestMode;
  console.log('\n🔧 Setting up e2e test environment...\n');

  // Load .env.e2e file if it exists (local development)
  const envPath = resolve(process.cwd(), '.env.e2e');
  if (existsSync(envPath)) {
    config({ path: envPath });
    console.log('✓ Loaded .env.e2e');
  } else if (useLocalFunctions) {
    console.warn('⚠️  Warning: .env.e2e not found. E2E tests require real Azure credentials.');
    console.warn('   Create .env.e2e from .env.e2e.example\n');
  }

  // Register signal handlers for Ctrl+C and other interrupts
  registerSignalHandlers(cleanup);

  try {
    if (useLocalFunctions) {
      console.log('📍 Mode: Local Functions with production Azure resources\n');

      // Clean up old test data first to prevent stale triggers
      await cleanupOldTestData();

      const settings = {
        IsEncrypted: false,
        Values: getTestConfig(mode),
      };

      writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
      console.log('✓ Configured local.settings.json for e2e tests');

      // 4. Start local Functions app
      functionsProcess = await startFunctions(FUNC_LOG_PATH, FUNC_ERROR_LOG_PATH, true);
    } else {
      console.log(`📍 Mode: Deployed Functions at ${process.env.FUNCTION_APP_URL}\n`);
    }

    console.log(`   (Waiting for Functions at ${process.env.FUNCTION_APP_URL})...`);
    await waitForFunctions(`${process.env.FUNCTION_APP_URL}/api/helloWorld`, 60);
    console.log('\n✅ e2e test environment ready!\n');

    // Return teardown function
    return cleanup;
  } catch (error) {
    console.error('\n❌ Failed to setup test environment:', error);

    // Cleanup on failure
    await cleanup();

    throw error;
  }
}
