/**
 * Integration Test Per-Test suite Cleanup
 *
 * Tests using Supertest (HTTP), Docker SQL Server (DB), Azurite (blob/queue), and mocked AI.
 * Auto-starts/stops Docker containers and cleans up after tests.
 */

import { afterEach } from 'vitest';
import { cleanTestDatabase } from '../common/utils';
import { cleanAzuriteBlobs, cleanAzuriteQueue } from './utils';

afterEach(async () => {
  // Clean up after each test to ensure isolation
  try {
    await cleanTestDatabase();
    await cleanAzuriteBlobs();
    await cleanAzuriteQueue();
  } catch (error) {
    console.warn('⚠️  Cleanup warning:', error);
  }
});
