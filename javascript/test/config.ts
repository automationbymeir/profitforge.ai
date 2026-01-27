/**
 * Shared test configuration
 *
 * Loads environment variables for different test modes.
 * - Integration tests: Uses .env.integration with Azurite + Docker SQL
 * - E2E tests: Uses .env.e2e with real Azure credentials (gitignored)
 * - CI/CD: Uses environment variables from GitHub Actions secrets
 */

export type TestMode = 'unit' | 'integration' | 'e2e';

// Well-known connection strings for local emulators (integration tests only)
// These are public knowledge and safe to commit - they only work with local Docker containers

// Azurite emulator connection string (Microsoft's standard dev storage account)
export const AZURITE_CONNECTION_STRING =
  'DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;QueueEndpoint=http://127.0.0.1:10001/devstoreaccount1;TableEndpoint=http://127.0.0.1:10002/devstoreaccount1;';

// Docker SQL Server connection string (matches docker-compose.test.yml)
// Password: TestPassword123! (defined in test/integration/setup/docker-compose.test.yml)
export const SQL_CONNECTION_STRING =
  'Server=localhost,1433;Database=master;User Id=sa;Password=TestPassword123!;Encrypt=false;TrustServerCertificate=true';

/**
 * Base configuration shared across test modes
 */
function getBaseConfig(): Record<string, string> {
  return {
    FUNCTIONS_WORKER_RUNTIME: 'node',
    // EnableWorkerIndexing: Enables Azure Functions v4 worker indexing for faster cold starts
    AzureWebJobsFeatureFlags: 'EnableWorkerIndexing',
  };
}

/**
 * Validate required environment variables are present
 */
function validateRequiredVars(mode: TestMode, requiredVars: string[]): void {
  const missing = requiredVars.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(
      `${mode.toUpperCase()} tests require environment variables. Missing: ${missing.join(', ')}\n` +
        `Local development: Create javascript/.env.${mode} (see .env.${mode}.example)\n` +
        `CI/CD: Configure GitHub secrets`
    );
  }
}

/**
 * Get configuration for a specific test mode
 * All modes require explicit environment variable configuration (no defaults)
 */
export function getTestConfig(mode: TestMode): Record<string, string> {
  if (mode === 'unit') {
    // Unit tests use mocked services, minimal config needed
    return {
      FUNCTIONS_WORKER_RUNTIME: 'node',
      NODE_ENV: 'test',
    };
  }

  if (mode === 'integration') {
    // Integration tests use local emulators (Azurite + Docker SQL)
    // No environment variables needed - uses well-known connection strings

    return {
      ...getBaseConfig(),
      // AzureWebJobsSecretStorageType: Store Functions secrets in local files (not Azure KeyVault)
      AzureWebJobsSecretStorageType: 'files',
      // AzureWebJobsStorage: Special value tells Functions runtime to use Azurite emulator
      AzureWebJobsStorage: 'UseDevelopmentStorage=true',

      // Database (Docker SQL Server Edge)
      // Connection string matches docker-compose.test.yml configuration
      SQL_CONNECTION_STRING: SQL_CONNECTION_STRING,

      // Storage (Azurite emulator)
      // Uses Microsoft's standard development storage account credentials
      STORAGE_CONNECTION_STRING: AZURITE_CONNECTION_STRING,
      STORAGE_CONTAINER_DOCUMENTS: 'uploads',

      // AI Services (mocked in integration tests)
      // These endpoints don't need to be real since integration tests mock the Azure SDK
      AI_PROJECT_ENDPOINT: 'https://mock-ai.cognitiveservices.azure.com',
      AI_PROJECT_KEY: 'MOCK_KEY_NOT_REAL',
      DOCUMENT_INTELLIGENCE_ENDPOINT: 'https://mock-doc-intel.cognitiveservices.azure.com/',
      DOCUMENT_INTELLIGENCE_KEY: 'MOCK_KEY_NOT_REAL',

      // Test settings
      FUNCTION_APP_URL: 'http://localhost:7071',
      IS_DEMO_MODE: 'false',
      MAX_FILE_SIZE_MB: '10',
    };
  }

  if (mode === 'e2e') {
    // E2E tests use REAL Azure resources - requires .env.e2e or GitHub secrets
    const requiredVars = [
      'SQL_CONNECTION_STRING',
      'STORAGE_CONNECTION_STRING',
      'AI_PROJECT_ENDPOINT',
      'AI_PROJECT_KEY',
      'DOCUMENT_INTELLIGENCE_ENDPOINT',
      'DOCUMENT_INTELLIGENCE_KEY',
    ];
    validateRequiredVars(mode, requiredVars);

    return {
      ...getBaseConfig(),
      // AzureWebJobsStorage: Use the real storage connection string for Functions runtime
      AzureWebJobsStorage: process.env.STORAGE_CONNECTION_STRING!,

      // Database (Real Azure SQL or deployed SQL Server)
      SQL_CONNECTION_STRING: process.env.SQL_CONNECTION_STRING!,

      // Storage (Real Azure Storage Account)
      STORAGE_CONNECTION_STRING: process.env.STORAGE_CONNECTION_STRING!,
      STORAGE_CONTAINER_DOCUMENTS: process.env.STORAGE_CONTAINER_DOCUMENTS || 'uploads',

      // AI Services (Real Azure AI Services)
      AI_PROJECT_ENDPOINT: process.env.AI_PROJECT_ENDPOINT!,
      AI_PROJECT_KEY: process.env.AI_PROJECT_KEY!,
      DOCUMENT_INTELLIGENCE_ENDPOINT: process.env.DOCUMENT_INTELLIGENCE_ENDPOINT!,
      DOCUMENT_INTELLIGENCE_KEY: process.env.DOCUMENT_INTELLIGENCE_KEY!,

      // Test settings
      FUNCTION_APP_URL: process.env.FUNCTION_APP_URL || 'http://localhost:7071',
      IS_DEMO_MODE: process.env.IS_DEMO_MODE || 'false',
      MAX_FILE_SIZE_MB: process.env.MAX_FILE_SIZE_MB || '10',
    };
  }

  throw new Error(`Unknown test mode: ${mode}`);
}
