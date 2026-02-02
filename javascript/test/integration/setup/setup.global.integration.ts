/**
 * Vitest Global Setup for Integration Tests
 *
 * Manages the complete test environment lifecycle:
 * 1. Loads .env.integration (optional - has sensible defaults)
 * 2. Starts Docker containers (SQL Server + Azurite)
 * 3. Waits for database to be ready
 * 4. Sets up Azurite containers
 * 5. Starts Azure Functions app with injected environment variables
 * 6. Cleans up everything on completion
 *
 * Environment Variables:
 * - Loads from .env.integration if it exists (defaults to well-known emulator credentials)
 * - Integration tests use LOCAL emulators only (Docker SQL + Azurite)
 * - All credentials are public/safe to commit (only work on localhost)
 */

import { ChildProcess } from 'child_process';
import { DotenvConfigOutput, config as loadEnv } from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';
// import { getTestConfig } from '../../config.js';
import {
  registerSignalHandlers,
  startFunctions,
  stopFunctions,
  waitForFunctions,
} from '../../tools/setup-utils';
import { setupAzuriteContainers, startDocker, stopDocker, waitForDatabase } from './utils';

const FUNC_LOG_PATH = 'test/functions-integration-output.log';
const FUNC_ERROR_LOG_PATH = 'test/functions-integration-error.log';

let functionsProcess: ChildProcess | null = null;
let isCleaningUp = false;

async function cleanup() {
  if (isCleaningUp) return;
  isCleaningUp = true;

  console.log('\n🧹 Cleaning up test environment...\n');

  // Stop Functions first
  await stopFunctions(functionsProcess);

  // Stop Docker
  await stopDocker();

  console.log('\n✅ Test environment cleaned up!\n');
}

export default async function globalSetup() {
  console.log(`\n🔧 Setting up integration test environment...\n`);

  // Load .env.integration from the setup folder
  const envPath = resolve(__dirname, '.env.integration');
  let dotenvConfigOutput: DotenvConfigOutput;

  if (existsSync(envPath)) {
    dotenvConfigOutput = loadEnv({ path: envPath, override: false });
    console.log('✓ Loaded .env.integration');
  } else {
    throw new Error(
      'Missing .env.integration file. Copy from .env.integration in test/integration/setup/'
    );
  }

  // Register signal handlers for Ctrl+C and other interrupts
  registerSignalHandlers(cleanup);

  try {
    // Start Docker containers
    await startDocker();

    // Wait a bit for containers to initialize
    console.log('   (Waiting for containers to initialize...)');
    await new Promise((resolve) => setTimeout(resolve, 5000));

    await waitForDatabase();
    await setupAzuriteContainers();

    // Start Functions app with injected environment variables from process.env
    console.log('✓ Injecting integration test environment variables');
    functionsProcess = await startFunctions(
      FUNC_LOG_PATH,
      FUNC_ERROR_LOG_PATH,
      false,
      dotenvConfigOutput.parsed || {}
    );
    await waitForFunctions();

    console.log(`\n✅ Integration test environment ready!\n`);

    // Return teardown function
    return cleanup;
  } catch (error) {
    console.error('\n❌ Failed to setup test environment:', error);

    // Cleanup on failure
    await cleanup();

    throw error;
  }
}
