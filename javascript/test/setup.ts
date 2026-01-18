// Test setup - runs before all tests
// Sets up environment variables and global test configuration

import { afterAll, beforeAll } from "vitest";

beforeAll(() => {
  // Set up test environment variables
  process.env.STORAGE_ACCOUNT_NAME = "testaccount";
  process.env.STORAGE_CONTAINER_DOCUMENTS = "uploads";
  process.env.STORAGE_CONNECTION_STRING =
    "DefaultEndpointsProtocol=https;AccountName=testaccount;AccountKey=dGVzdA==;EndpointSuffix=core.windows.net";
  process.env.SQL_CONNECTION_STRING =
    "Server=test;Database=test;User ID=test;Password=test;Encrypt=true;TrustServerCertificate=true;";
  process.env.DOCUMENT_INTELLIGENCE_ENDPOINT = "https://test.cognitiveservices.azure.com/";
  process.env.DOCUMENT_INTELLIGENCE_KEY = "test-key";
  process.env.AI_PROJECT_ENDPOINT = "https://test.openai.azure.com";
  process.env.AI_PROJECT_KEY = "test-api-key";
});

afterAll(() => {
  // Cleanup if needed
});
