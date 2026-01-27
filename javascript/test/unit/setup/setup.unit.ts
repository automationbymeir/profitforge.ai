/**
 * Unit Test Setup
 *
 * Fast, isolated tests with all external dependencies mocked.
 * No database, no Azure services, no network calls.
 */

// Set environment variables BEFORE any imports (so they're available at module load time)
process.env.NODE_ENV = 'test';
process.env.FUNCTIONS_WORKER_RUNTIME = 'node';

// Azure AI Services (mocked credentials for unit tests)
process.env.AI_PROJECT_ENDPOINT = 'https://mock-ai.cognitiveservices.azure.com/';
process.env.AI_PROJECT_KEY = 'mock-ai-project-key-12345';
process.env.AZURE_AI_PROJECT_CONNECTION_STRING =
  'InstrumentationKey=00000000-0000-0000-0000-000000000000';
process.env.AZURE_AI_PROJECT_ENDPOINT = 'https://mock-ai.cognitiveservices.azure.com/';
process.env.AZURE_AI_PROJECT_NAME = 'mock-ai-project';

// Azure OpenAI (mocked credentials for unit tests)
process.env.AZURE_OPENAI_ENDPOINT = 'https://mock-openai.openai.azure.com/';
process.env.AZURE_OPENAI_API_KEY = 'mock-openai-api-key-12345';
process.env.AZURE_OPENAI_DEPLOYMENT = 'gpt-4';
process.env.AZURE_OPENAI_API_VERSION = '2024-02-15-preview';

// Azure Document Intelligence (mocked credentials for unit tests)
process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT =
  'https://mock-doc-intel.cognitiveservices.azure.com/';
process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY = 'mock-doc-intel-key-12345';

// Storage (mocked credentials for unit tests)
process.env.STORAGE_CONNECTION_STRING =
  'DefaultEndpointsProtocol=https;AccountName=mockaccount;AccountKey=bW9ja2tleQ==;EndpointSuffix=core.windows.net';
process.env.AZURE_STORAGE_TABLE_CONNECTION_STRING =
  'DefaultEndpointsProtocol=https;AccountName=mockaccount;AccountKey=bW9ja2tleQ==;EndpointSuffix=core.windows.net';

// Database (mocked connection string for unit tests)
process.env.SQL_CONNECTION_STRING =
  'Server=mock-server;Database=mock-db;User Id=mock-user;Password=mock-pass;';

import { afterAll, afterEach, vi } from 'vitest';

afterEach(() => {
  // Clear all mocks after each test
  vi.clearAllMocks();
});

afterAll(() => {
  // Clean up
  vi.restoreAllMocks();
});
