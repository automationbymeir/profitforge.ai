/**
 * Vitest Global Setup for E2E Tests
 *
 * E2E tests use production Azure resources (database, blob storage, AI services).
 *
 * Environment Variable Loading Strategy:
 * =====================================
 *
 * Dev Environment:
 * - Automatically loads .env.e2e file if it exists
 * - .env.e2e should contain all Azure credentials and FUNCTION_APP_URL=http://localhost:7071
 * - Global setup loads vars BEFORE starting Functions app
 *
 * CI Environment (GitHub Actions):
 * - Uses GitHub Secrets exported as environment variables
 * - No .env.e2e file needed
 * - FUNCTION_APP_URL points to deployed Azure Functions app
 *
 * Two Execution Modes:
 * ====================
 *
 * 1. Local Functions (FUNCTION_APP_URL=http://localhost:7071):
 *    - Starts local Functions app with env vars injected
 *    - Uses production Azure resources (DB, Storage, AI)
 *    - Command: npm run test:e2e:local
 *
 * 2. Deployed Functions (FUNCTION_APP_URL=https://...):
 *    - Uses already-deployed Functions app
 *    - No local Functions startup needed
 *    - Command: npm run test:e2e
 */

import { ChildProcess } from 'child_process';
import { config } from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { getTestConfig, TestMode } from '../../config.js';
import { cleanBlobs, cleanQueue } from '../../tools/cleanup';
import {
  registerSignalHandlers,
  startFunctions,
  stopFunctions,
  waitForFunctions,
} from '../../tools/setup-utils.js';

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

  // Load environment variables
  // Priority: 1) Existing env vars (CI), 2) .env.e2e file (Dev)
  const envPath = resolve(process.cwd(), '.env.e2e');
  const hasEnvFile = existsSync(envPath);
  const hasEnvVars = !!process.env.FUNCTION_APP_URL;

  if (hasEnvFile) {
    // Dev: Load from .env.e2e (won't override existing env vars)
    config({ path: envPath, override: false });
    console.log('✓ Loaded .env.e2e (dev mode)');
  } else if (hasEnvVars) {
    // CI: Using environment variables from GitHub secrets
    console.log('✓ Using environment variables (CI mode)');
  } else {
    console.error('\n❌ No environment configuration found!');
    console.error('   Dev: Create .env.e2e from .env.e2e.example');
    console.error('   CI: Ensure GitHub secrets are configured\n');
    throw new Error('Missing environment configuration');
  }

  // Validate required environment variables
  if (!process.env.FUNCTION_APP_URL) {
    throw new Error('FUNCTION_APP_URL is required');
  }

  // Register signal handlers for Ctrl+C and other interrupts
  registerSignalHandlers(cleanup);

  try {
    if (useLocalFunctions) {
      console.log('📍 Mode: Local Functions with production Azure resources\n');

      // Clean up old test data first to prevent stale triggers
      await cleanupOldTestData();

      // Start local Functions app with injected environment variables
      console.log('✓ Injecting e2e test environment variables');
      functionsProcess = await startFunctions(
        FUNC_LOG_PATH,
        FUNC_ERROR_LOG_PATH,
        true,
        getTestConfig(mode)
      );
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
