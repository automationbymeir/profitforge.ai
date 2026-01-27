/**
 * Shared test configuration
 *
 * Defines environment variables for different test modes.
 * Used by vitest global setup to configure local.settings.json
 */

export const testConfig = {
  integration: {
    FUNCTIONS_WORKER_RUNTIME: "node",
    AzureWebJobsStorage: "UseDevelopmentStorage=true",
    AzureWebJobsSecretStorageType: "files",

    // Local test database (Docker SQL Server Edge)
    SQL_CONNECTION_STRING:
      "Server=localhost,1433;Database=master;User Id=sa;Password=TestPassword123!;Encrypt=false;TrustServerCertificate=true",

    // Azurite storage emulator
    STORAGE_CONNECTION_STRING:
      "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;QueueEndpoint=http://127.0.0.1:10001/devstoreaccount1;TableEndpoint=http://127.0.0.1:10002/devstoreaccount1;",
    AZURE_STORAGE_TABLE_CONNECTION_STRING:
      "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;TableEndpoint=http://127.0.0.1:10002/devstoreaccount1;",
    STORAGE_ACCOUNT_NAME: "devstoreaccount1",
    STORAGE_CONTAINER_DOCUMENTS: "uploads",

    // Mock AI credentials (calls are mocked in tests)
    AI_PROJECT_ENDPOINT: "https://mock-ai.cognitiveservices.azure.com",
    AI_PROJECT_KEY: "mock-ai-project-key-12345",
    DOCUMENT_INTELLIGENCE_ENDPOINT: "https://mock-doc-intel.cognitiveservices.azure.com/",
    DOCUMENT_INTELLIGENCE_KEY: "mock-doc-intel-key-12345",

    // Test settings
    FUNCTION_APP_URL: "http://localhost:7071",
    IS_DEMO_MODE: "false",
    MAX_FILE_SIZE_MB: "10",
  },

  e2e: {
    FUNCTIONS_WORKER_RUNTIME: "node",
    AzureWebJobsStorage:
      "DefaultEndpointsProtocol=https;AccountName=deveitanpvstorage;AccountKey=MXQDUdIHdPb/Q3+yn55o9V4pO9pgPNbxn5pWvd414xu5ihNSCwi8Zhw2+mkLHnJ6AE/3jVO94XjP+AStV6kwfA==;EndpointSuffix=core.windows.net",
    AzureWebJobsFeatureFlags: "EnableWorkerIndexing",
    SQL_CONNECTION_STRING:
      "Server=tcp:dev-eitan-vvocr-sql0d3c18e3.database.windows.net,1433;Database=dev-eitan-vvocr-db;User ID=sqladmin;Password=MySecurePassword123!;Encrypt=true;TrustServerCertificate=false;Connection Timeout=30;",
    STORAGE_CONNECTION_STRING:
      "DefaultEndpointsProtocol=https;AccountName=deveitanpvstorage;AccountKey=MXQDUdIHdPb/Q3+yn55o9V4pO9pgPNbxn5pWvd414xu5ihNSCwi8Zhw2+mkLHnJ6AE/3jVO94XjP+AStV6kwfA==;EndpointSuffix=core.windows.net",
    STORAGE_CONTAINER_DOCUMENTS: "uploads",
    AI_PROJECT_ENDPOINT: "https://openai-accounteaf7e319.openai.azure.com",
    AI_PROJECT_KEY:
      "FbU0O8bzcWfgSqbQDSDGfqigtw0104wLeSmuuSfTZ4C0p3nv1TeGJQQJ99CAACYeBjFXJ3w3AAAAACOGrzn5",
    DOCUMENT_INTELLIGENCE_ENDPOINT: "https://eastus.api.cognitive.microsoft.com/",
    DOCUMENT_INTELLIGENCE_KEY:
      "1cr78iW9CBkGwdvjP3tft0pEzpf9EVNWbp5hxlmz5Au0RYEcJeU4JQQJ99BLACYeBjFXJ3w3AAALACOG7O6h",

    // Test settings
    FUNCTION_APP_URL: "http://localhost:7071",
    IS_DEMO_MODE: "false",
    MAX_FILE_SIZE_MB: "10",
  },
};

export type TestMode = keyof typeof testConfig;
