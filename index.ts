import * as azurenative from "@pulumi/azure-native";
import * as pulumi from "@pulumi/pulumi";
import { azureConfig } from "./infra/config";
import { createDatabaseResources } from "./infra/database";
import { createStorageResources } from "./infra/storage";
// Unused resources commented out:
// import { createApplicationInsightsResources } from "./infra/applicationInsights";
// import { createCognitiveServices } from "./infra/cognitiveServices";
// import { createAIFoundryResources } from "./infra/aiFoundry";

// Get Pulumi configuration and stack
const config = new pulumi.Config();
const stack = pulumi.getStack();

// Get secrets from Pulumi config
const documentIntelligenceKey = config.requireSecret("documentIntelligenceKey");
const adminPassword = config.requireSecret("sqlAdminPassword");
const adminUsername = "sqladmin";

// Use existing resource group

// --- SQL Infrastructure ---
const databaseResources = createDatabaseResources(
  azureConfig.resourceGroup,
  azureConfig.location,
  stack,
  adminUsername,
  adminPassword
);

// --- Create Storage Resources Directly ---
const { blobStorage, uploadsContainer } = createStorageResources(
  azureConfig.resourceGroup,
  azureConfig.location,
  stack
);

// Note: KeyVault to be created/managed later if needed
// Using storage account as the primary storage for functions

// Export outputs
export const stage = stack;
export const outputLocation = azureConfig.location;
export const storageAccountName = blobStorage.name;
export const sqlServerName = databaseResources.sqlServer.name;
export const sqlServerFqdn = databaseResources.sqlServer.fullyQualifiedDomainName;
export const sqlDatabaseName = databaseResources.sqlDatabase.name;

// Unused AI Services (commented out):
// export const keyVaultName = existingKeyVault.name;
// export const keyVaultUrl = existingKeyVault.properties.vaultUri;
// export const aiHubName = azureConfig.aiHubName;
// export const aiProjectName = azureConfig.aiProjectName;
// export const documentIntelligenceEndpoint = azureConfig.documentIntelligenceEndpoint;

// --- Azure Functions Infrastructure ---

// Unused AI Infrastructure (commented out):
// const appInsights = createApplicationInsightsResources(resourceGroupName, location);
// const cognitiveServices = createCognitiveServices(resourceGroupName, location);
// const aiFoundry = createAIFoundryResources(
//   resourceGroupName,
//   location,
//   cognitiveServices.openAiAccountName
// );

// Get primary storage key for connection string
const storageKeys = azurenative.storage.listStorageAccountKeysOutput({
  resourceGroupName: azureConfig.resourceGroup,
  accountName: blobStorage.name,
});
const storageConnectionString = pulumi.interpolate`DefaultEndpointsProtocol=https;AccountName=${blobStorage.name};AccountKey=${storageKeys.keys[0].value};EndpointSuffix=core.windows.net`;

// --- Create Function App Infrastructure ---

// Create App Service Plan (Consumption/Dynamic)
const plan = new azurenative.web.AppServicePlan(`${stack}-function-plan`, {
  resourceGroupName: azureConfig.resourceGroup,
  name: `${stack}-function-plan`,
  kind: "functionapp",
  sku: {
    name: "Y1",
    tier: "Dynamic",
  },
  // reserved: true, // Required for Linux
});

// --- Azure Functions Deployment ---

// Create container for deployment if it doesn't exist
const codeContainer = new azurenative.storage.BlobContainer(`${stack}-deployments`, {
  resourceGroupName: azureConfig.resourceGroup,
  accountName: blobStorage.name,
  containerName: `${stack}-deployments`,
  // publicAccess: azurenative.storage.PublicAccess.None,
});

// 1. Pack the built functions with flat structure for Azure Functions
const codeBlob = new azurenative.storage.Blob(`${stack}-functions-zip-v2`, {
  resourceGroupName: azureConfig.resourceGroup,
  accountName: blobStorage.name,
  containerName: codeContainer.name,
  source: new pulumi.asset.FileArchive("./javascript"),
  blobName: `${stack}-functions-v2.zip`, // Force new deployment
  type: azurenative.storage.BlobType.Block,
});

// Get SAS token for the function app to download the zip
const functionBlobSAS = azurenative.storage.listStorageAccountServiceSASOutput({
  accountName: blobStorage.name,
  protocols: azurenative.storage.HttpProtocol.Https,
  sharedAccessStartTime: "2023-01-01",
  sharedAccessExpiryTime: "2030-01-01",
  resourceGroupName: azureConfig.resourceGroup,
  resource: azurenative.storage.SignedResource.C,
  permissions: azurenative.storage.Permissions.R,
  canonicalizedResource: pulumi.interpolate`/blob/${blobStorage.name}/${codeContainer.name}`,
  contentType: "application/json",
  cacheControl: "max-age=5",
  contentDisposition: "inline",
  contentEncoding: "deflate",
});

const functionBlobUrl = pulumi.interpolate`https://${blobStorage.name}.blob.core.windows.net/${codeContainer.name}/${codeBlob.name}?${functionBlobSAS.serviceSasToken}`;

// Create/manage the Function App with proper plan linkage (matching working example)
const functionApp = new azurenative.web.WebApp(`${stack}-function-app`, {
  resourceGroupName: azureConfig.resourceGroup,
  name: `${stack}-vvocr-functions`,
  serverFarmId: plan.id, // Link to the App Service Plan
  kind: "functionapp",
  siteConfig: {
    appSettings: [
      { name: "AzureWebJobsStorage", value: storageConnectionString },
      { name: "FUNCTIONS_EXTENSION_VERSION", value: "~4" },
      { name: "FUNCTIONS_WORKER_RUNTIME", value: "node" },
      { name: "WEBSITE_NODE_DEFAULT_VERSION", value: "~20" },
      { name: "WEBSITE_RUN_FROM_PACKAGE", value: functionBlobUrl },
    ],
    http20Enabled: true,
    nodeVersion: "~20",
  },
});

export const functionAppName = functionApp.name;
export const functionAppEndpoint = pulumi.interpolate`https://${functionApp.defaultHostName}`;

// Secrets for runtime use in functions (marked as secret outputs)
export const outputDocumentIntelligenceKey = pulumi.secret(documentIntelligenceKey);
export const outputDatabaseConnectionString = pulumi.secret(databaseResources.connectionString);
