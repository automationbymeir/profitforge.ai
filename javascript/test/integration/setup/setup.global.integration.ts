/**
 * Vitest Global Setup
 *
 * Manages the complete test environment lifecycle:
 * 1. Backs up and configures local.settings.json
 * 2. Starts Docker containers (SQL Server + Azurite)
 * 3. Starts Azure Functions app
 * 4. Cleans up everything on completion
 */

import { BlobServiceClient } from "@azure/storage-blob";
import { ChildProcess, spawn } from "child_process";
import { existsSync, unlinkSync, writeFileSync } from "fs";
import sql from "mssql";
import { getTestConfig } from "../../config.js";
import {
  registerSignalHandlers,
  startFunctions,
  stopFunctions,
  waitForFunctions,
} from "../../tools/setup-utils.js";

const SETTINGS_PATH = "local.settings.json";
const FUNC_LOG_PATH = "test/functions-integration-output.log";
const FUNC_ERROR_LOG_PATH = "test/functions-integration-error.log";
const config = getTestConfig("integration");

let dockerProcess: ChildProcess | null = null;
let functionsProcess: ChildProcess | null = null;
let isCleaningUp = false;

async function cleanup() {
  if (isCleaningUp) return;
  isCleaningUp = true;

  console.log("\n🧹 Cleaning up test environment...\n");

  // Stop Functions first
  await stopFunctions(functionsProcess);

  // Stop Docker
  await stopDocker();

  // Delete local.settings.json (e2e-specific config)
  if (existsSync(SETTINGS_PATH)) {
    unlinkSync(SETTINGS_PATH);
    console.log("✓ Deleted local.settings.json");
  }

  console.log("\n✅ Test environment cleaned up!\n");
}

async function waitForDatabase(maxAttempts = 30): Promise<void> {
  const connectionString = config.SQL_CONNECTION_STRING;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const pool = new sql.ConnectionPool(connectionString);
      await pool.connect();
      await pool.close();
      console.log("✓ Database is ready");
      return;
    } catch (error) {
      if (i === maxAttempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

async function setupAzuriteContainers(): Promise<void> {
  const storageConnectionString = config.STORAGE_CONNECTION_STRING;
  const blobServiceClient = BlobServiceClient.fromConnectionString(storageConnectionString);

  // Create the "uploads" container that Functions app expects
  const uploadsContainer = blobServiceClient.getContainerClient("uploads");
  if (!(await uploadsContainer.exists())) {
    await uploadsContainer.create();
    console.log("✓ Created 'uploads' blob container");
  }

  // Also create bronze-layer for OCR results
  const bronzeContainer = blobServiceClient.getContainerClient("bronze-layer");
  if (!(await bronzeContainer.exists())) {
    await bronzeContainer.create();
    console.log("✓ Created 'bronze-layer' blob container");
  }
}

function startDocker(): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log("🐳 Starting Docker containers...");

    dockerProcess = spawn(
      "docker",
      ["compose", "-f", "test/integration/setup/docker-compose.test.yml", "up", "-d"],
      {
        stdio: "pipe",
      }
    );

    let output = "";
    dockerProcess.stdout?.on("data", (data) => {
      output += data.toString();
    });

    dockerProcess.stderr?.on("data", (data) => {
      output += data.toString();
    });

    dockerProcess.on("close", (code) => {
      if (code === 0) {
        console.log("✓ Docker containers started");
        resolve();
      } else {
        reject(new Error(`Docker failed with code ${code}: ${output}`));
      }
    });
  });
}

function stopDocker(): Promise<void> {
  return new Promise((resolve) => {
    console.log("🐳 Stopping Docker containers...");

    const stop = spawn(
      "docker",
      ["compose", "-f", "test/integration/setup/docker-compose.test.yml", "down", "-v"],
      {
        stdio: "pipe",
      }
    );

    stop.on("close", () => {
      console.log("✓ Docker containers stopped");
      resolve();
    });
  });
}

export default async function globalSetup() {
  const mode = "integration";

  console.log(`\n🔧 Setting up ${mode} test environment...\n`);

  // Register signal handlers for Ctrl+C and other interrupts
  registerSignalHandlers(cleanup);

  const settings = {
    IsEncrypted: false,
    Values: config,
  };

  try {
    writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
    console.log(`✓ Configured local.settings.json for ${mode} tests`);

    // 3. Start Docker containers
    await startDocker();

    // Wait a bit for containers to initialize
    console.log("   (Waiting for containers to initialize...)");
    await new Promise((resolve) => setTimeout(resolve, 5000));

    await waitForDatabase();
    await setupAzuriteContainers();

    // 4. Start Functions app
    // Unset any production environment variables that would override local.settings.json
    // This prevents E2E env vars from leaking into integration tests
    delete process.env.SQL_CONNECTION_STRING;
    delete process.env.STORAGE_CONNECTION_STRING;
    delete process.env.AI_PROJECT_ENDPOINT;
    delete process.env.AI_PROJECT_KEY;
    delete process.env.DOCUMENT_INTELLIGENCE_ENDPOINT;
    delete process.env.DOCUMENT_INTELLIGENCE_KEY;
    delete process.env.FUNCTION_APP_URL;

    functionsProcess = await startFunctions(FUNC_LOG_PATH, FUNC_ERROR_LOG_PATH, false);
    await waitForFunctions();

    console.log(`\n✅ ${mode} test environment ready!\n`);

    // Return teardown function
    return cleanup;
  } catch (error) {
    console.error("\n❌ Failed to setup test environment:", error);

    // Cleanup on failure
    await cleanup();

    throw error;
  }
}
