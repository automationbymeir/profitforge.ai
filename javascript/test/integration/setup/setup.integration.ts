/**
 * Integration Test Setup
 *
 * Tests using Supertest (HTTP), Docker SQL Server (DB), Azurite (blob/queue), and mocked AI.
 * Auto-starts/stops Docker containers and cleans up after tests.
 */

import { afterAll, afterEach, beforeAll } from 'vitest';
import { mockAIEnvironmentVariables } from '../helpers/azure-ai-mocks';
import { cleanAzuriteBlobs, cleanAzuriteQueue, setupAzuriteContainers } from '../helpers/azurite';
import { cleanTestDatabase, closeTestDbPool, getTestDbPool } from '../helpers/test-db';

beforeAll(async () => {
  console.log('🔧 Setting up integration test environment...');

  // Set environment for integration tests
  process.env.NODE_ENV = 'test';
  process.env.FUNCTIONS_WORKER_RUNTIME = 'node';

  // Mock AI service credentials (we'll mock the actual calls)
  mockAIEnvironmentVariables();

  // Use Azurite for blob/queue
  process.env.STORAGE_CONNECTION_STRING =
    'DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;QueueEndpoint=http://127.0.0.1:10001/devstoreaccount1;';

  // Use test database (SQL Server Edge in Docker)
  process.env.SQL_CONNECTION_STRING =
    'Server=localhost,1433;Database=master;User Id=sa;Password=TestPassword123!;Encrypt=false;TrustServerCertificate=true';

  try {
    // Wait for database to be ready
    await getTestDbPool();
    console.log('✓ Test database connected (SQL Server edge)');

    // Set up Azurite containers
    await setupAzuriteContainers();
    console.log('✓ Azurite containers ready');
  } catch (error) {
    console.error('Failed to set up test infrastructure:', error);
    throw error;
  }
}, 30000);

afterEach(async () => {
  // Clean up after each test to ensure isolation
  try {
    await cleanTestDatabase();
    await cleanAzuriteBlobs();
    await cleanAzuriteQueue();
  } catch (error) {
    console.warn('Cleanup warning:', error);
  }
});

afterAll(async () => {
  console.log('🧹 Cleaning up integration test environment...');

  // Close connections
  await closeTestDbPool();

  console.log('✅ Test infrastructure cleaned up');
});
