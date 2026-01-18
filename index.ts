import * as pulumi from "@pulumi/pulumi";
import { createAIFoundryResources } from "./infra/aiFoundry";
import { createCognitiveServices } from "./infra/cognitiveServices";
import { azureConfig } from "./infra/config";
import { createDatabaseResources } from "./infra/database";
import { createFunctionAppResources } from "./infra/functions";
import { createStorageResources } from "./infra/storage";
// Unused resources commented out:
// import { createApplicationInsightsResources } from "./infra/applicationInsights";
// import { createKeyVaultResources } from "./infra/keyVault";

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

// --- Storage Infrastructure ---
const { blobStorage, uploadsContainer, storageConnectionString, functionBlobUrl } =
  createStorageResources(azureConfig.resourceGroup, azureConfig.location, stack);

// --- AI Services (Document Intelligence + OpenAI) ---
const cognitiveServices = createCognitiveServices(azureConfig.resourceGroup, azureConfig.location);

// --- AI Foundry (Hub + Project + GPT-4o Deployment) ---
const aiFoundry = createAIFoundryResources(
  azureConfig.resourceGroup,
  azureConfig.location,
  cognitiveServices.openAiAccountName
);

// --- Azure Functions Infrastructure ---
const functionAppResources = createFunctionAppResources(
  storageConnectionString,
  functionBlobUrl,
  "", // Empty KeyVault URI for now (can add later if needed)
  cognitiveServices.docIntelEndpoint,
  cognitiveServices.docIntelPrimaryKey,
  pulumi.interpolate`https://${cognitiveServices.openAiAccountName}.openai.azure.com`,
  cognitiveServices.openAiPrimaryKey,
  databaseResources.connectionString,
  stack
);

// Export outputs
export const stage = stack;
export const outputLocation = azureConfig.location;
export const storageAccountName = blobStorage.name;
export const sqlServerName = databaseResources.sqlServer.name;
export const sqlServerFqdn = databaseResources.sqlServer.fullyQualifiedDomainName;
export const sqlDatabaseName = databaseResources.sqlDatabase.name;

// --- Azure Functions Infrastructure ---
export const functionAppName = functionAppResources.functionApp.name;
export const functionAppEndpoint = pulumi.interpolate`https://${functionAppResources.functionApp.defaultHostName}`;

// --- AI Services Outputs ---
export const docIntelAccountName = cognitiveServices.docIntelAccountName;
export const docIntelEndpoint = cognitiveServices.docIntelEndpoint;
export const openAiAccountName = cognitiveServices.openAiAccountName;
export const aiHubName = pulumi.output(azureConfig.aiHubName);
export const aiProjectName = pulumi.output(azureConfig.aiProjectName);

// --- Secrets (marked as secret outputs for runtime use) ---
export const outputDocumentIntelligenceKey = pulumi.secret(cognitiveServices.docIntelPrimaryKey);
export const outputOpenAIKey = pulumi.secret(cognitiveServices.openAiPrimaryKey);
export const outputDatabaseConnectionString = pulumi.secret(databaseResources.connectionString);
export const outputStorageConnectionString = pulumi.secret(storageConnectionString);
