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
import { config as loadEnv } from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { cleanQueue } from '../../tools/cleanup';
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
let useLocalFunctions: boolean = false;

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
 */

export default async function globalSetup() {
  console.log(`\n🔧 Setting up integration test environment...\n`);

  // Load .env.integration from the setup folder (optional in CI/CD)
  const envPath = resolve(__dirname, '.env');
  let envVars: Record<string, string> = {};

  if (existsSync(envPath)) {
    const dotenvConfigOutput = loadEnv({ path: envPath, override: true });
    console.log('✓ Loaded .env');
    envVars = dotenvConfigOutput.parsed || {};
    useLocalFunctions = process.env.FUNCTION_APP_URL?.includes('http://localhost:') || false;
    console.log('localFunctions:', useLocalFunctions);
  } else {
    // In CI/CD, env vars are already set in process.env
    console.log('✓ Using environment variables from process.env (CI/CD mode)');
    // Extract only the vars we need for Functions
    const requiredVars = [
      'SQL_CONNECTION_STRING',
      'STORAGE_CONNECTION_STRING',
      'DOCUMENT_INTELLIGENCE_KEY',
      'DOCUMENT_INTELLIGENCE_ENDPOINT',
      'AI_PROJECT_KEY',
      'AI_PROJECT_ENDPOINT',
      'FUNCTION_APP_URL',
    ];
    for (const key of requiredVars) {
      if (process.env[key]) {
        envVars[key] = process.env[key] as string;
      }
    }
  }

  // Register signal handlers for Ctrl+C and other interrupts
  registerSignalHandlers(cleanup);

  try {
    if (useLocalFunctions) {
      console.log('📍 Mode: Local Functions with production Azure resources\n');

      // Clean up old test data first to prevent stale triggers
      await cleanQueue();

      // Start local Functions app with injected environment variables
      console.log('✓ Injecting e2e test environment variables');
      functionsProcess = await startFunctions(FUNC_LOG_PATH, FUNC_ERROR_LOG_PATH, envVars);
    } else {
      console.log(`📍 Mode: Deployed Functions at ${process.env.FUNCTION_APP_URL}\n`);
    }

    await waitForFunctions(process.env.FUNCTION_APP_URL);

    // Return teardown function
    return cleanup;
  } catch (error) {
    console.error('\n❌ Failed to setup test environment:', error);

    // Cleanup on failure
    await cleanup();

    throw error;
  }
}
