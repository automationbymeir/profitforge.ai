import * as pulumi from '@pulumi/pulumi';
import { createAIFoundryResources } from './infra/aiFoundry';
import { createApplicationInsightsResources } from './infra/applicationInsights';
import { createCognitiveServices } from './infra/cognitiveServices';
import { getAIHubName, getAIProjectName, getLocation, getResourceGroup } from './infra/config';
import { createDatabaseResources } from './infra/database';
import { createFunctionAppResources } from './infra/functions';
import { createStorageResources } from './infra/storage';
// Unused resources commented out:
// import { createKeyVaultResources } from "./infra/keyVault";

// Get Pulumi configuration and stack
const config = new pulumi.Config();
const stack = pulumi.getStack();

// Get secrets from Pulumi config
const adminPassword = config.requireSecret('sqlAdminPassword');
const adminUsername = 'sqladmin';

// Use existing resource group
const resourceGroup = getResourceGroup();
const location = getLocation();

// --- SQL Infrastructure ---
const databaseResources = createDatabaseResources(
  resourceGroup,
  location,
  stack,
  adminUsername,
  adminPassword
);

// --- Storage Infrastructure ---
const {
  blobStorage,
  uploadsContainer: _uploadsContainer,
  storageConnectionString,
  functionBlobUrl,
} = createStorageResources(resourceGroup, location, stack);

// --- Application Insights (Monitoring) ---
const appInsightsResources = createApplicationInsightsResources(resourceGroup, location, stack);

// --- AI Services (Document Intelligence + OpenAI) ---
const cognitiveServices = createCognitiveServices(resourceGroup, location);

// --- AI Foundry (Hub + Project + GPT-4o Deployment) ---
const _aiFoundry = createAIFoundryResources(
  resourceGroup,
  location,
  cognitiveServices.openAiAccountName
);

// --- Azure Functions Infrastructure ---
const functionAppResources = createFunctionAppResources(
  storageConnectionString,
  functionBlobUrl,
  '', // Empty KeyVault URI for now (can add later if needed)
  cognitiveServices.docIntelEndpoint,
  cognitiveServices.docIntelPrimaryKey,
  pulumi.interpolate`https://${cognitiveServices.openAiAccountName}.openai.azure.com`,
  cognitiveServices.openAiPrimaryKey,
  databaseResources.connectionString,
  appInsightsResources.appInsights.connectionString,
  stack
);

// Export outputs
export const stage = stack;
export const outputLocation = location;
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
export const aiHubName = pulumi.output(getAIHubName());
export const aiProjectName = pulumi.output(getAIProjectName());

// --- Monitoring Outputs ---
export const appInsightsName = appInsightsResources.appInsights.name;
export const appInsightsInstrumentationKey = pulumi.secret(
  appInsightsResources.appInsights.instrumentationKey
);
export const logAnalyticsWorkspaceId = appInsightsResources.logAnalyticsWorkspace.customerId;

// --- Secrets (marked as secret outputs for runtime use) ---
export const outputDocumentIntelligenceKey = pulumi.secret(cognitiveServices.docIntelPrimaryKey);
export const outputOpenAIKey = pulumi.secret(cognitiveServices.openAiPrimaryKey);
export const outputDatabaseConnectionString = pulumi.secret(databaseResources.connectionString);
export const outputStorageConnectionString = pulumi.secret(storageConnectionString);
