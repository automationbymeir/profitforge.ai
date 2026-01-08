import * as azurenative from "@pulumi/azure-native";
import * as pulumi from "@pulumi/pulumi";
import { azureConfig } from "./infra/config";

// Get Pulumi configuration and stack
const config = new pulumi.Config();
const stack = pulumi.getStack();
const location = azureConfig.location;

// Get secrets from Pulumi config
const documentIntelligenceKey = config.requireSecret("documentIntelligenceKey");
const sqlAdminPassword = config.requireSecret("sqlAdminPassword");

// Reference existing Azure resource group
const existingRgPromise = azurenative.resources.getResourceGroup({
  resourceGroupName: azureConfig.resourceGroup,
});
const resourceGroupName = pulumi.output(existingRgPromise).apply((rg) => rg.name);

// Create Azure SQL Database Serverless
// Note: When project is complete, schemas will be manually migrated to production DB

// Create SQL Server
const sqlServer = new azurenative.sql.Server(`${stack}-vvocr-sql`, {
  resourceGroupName: resourceGroupName,
  location: location,
  administratorLogin: "sqladmin",
  administratorLoginPassword: sqlAdminPassword,
  version: "12.0",
  minimalTlsVersion: "1.2",
  publicNetworkAccess: azurenative.sql.ServerNetworkAccessFlag.Enabled,
});

// Allow Azure services and resources within the same region to access
// This includes: Azure Functions, Container Apps, Logic Apps, etc. in the same subscription
new azurenative.sql.FirewallRule(`${stack}-allow-azure`, {
  resourceGroupName: resourceGroupName,
  serverName: sqlServer.name,
  startIpAddress: "0.0.0.0",
  endIpAddress: "0.0.0.0",
});

// Create Serverless Database
const sqlDatabase = new azurenative.sql.Database(`${stack}-vvocr-db`, {
  resourceGroupName: resourceGroupName,
  serverName: sqlServer.name,
  location: location,
  sku: {
    name: "GP_S_Gen5",
    tier: "GeneralPurpose",
    family: "Gen5",
    capacity: 1, // 1 vCore
  },
  autoPauseDelay: 60, // Auto-pause after 60 minutes of inactivity
  minCapacity: 0.5, // Minimum 0.5 vCore
  maxSizeBytes: 2147483648, // 2GB
});

// Build connection string
const sqlConnectionString = pulumi.interpolate`Server=tcp:${sqlServer.fullyQualifiedDomainName},1433;Database=${sqlDatabase.name};User ID=sqladmin;Password=${sqlAdminPassword};Encrypt=true;TrustServerCertificate=false;Connection Timeout=30;`;

// Reference existing storage account
const existingStoragePromise = azurenative.storage.getStorageAccount({
  resourceGroupName: azureConfig.resourceGroup,
  accountName: azureConfig.storageAccountName,
});

// Reference existing Key Vault
const existingKeyVaultPromise = azurenative.keyvault.getVault({
  resourceGroupName: azureConfig.resourceGroup,
  vaultName: azureConfig.keyVaultName,
});

// Export outputs
export const stage = stack;
export const outputLocation = location;
export const outputResourceGroupName = resourceGroupName;
export const storageAccountName = pulumi.output(existingStoragePromise).apply((sa) => sa.name);
export const keyVaultName = pulumi.output(existingKeyVaultPromise).apply((kv) => kv.name);
export const keyVaultUrl = pulumi
  .output(existingKeyVaultPromise)
  .apply((kv) => kv.properties.vaultUri);
export const sqlServerName = sqlServer.name;
export const sqlServerFqdn = sqlServer.fullyQualifiedDomainName;
export const sqlDatabaseName = sqlDatabase.name;

// AI Services configuration (from existing resources)
export const aiHubName = azureConfig.aiHubName;
export const aiProjectName = azureConfig.aiProjectName;
export const documentIntelligenceEndpoint = azureConfig.documentIntelligenceEndpoint;

// Secrets for runtime use in functions (marked as secret outputs)
export const outputDocumentIntelligenceKey = pulumi.secret(documentIntelligenceKey);
export const outputSqlConnectionString = pulumi.secret(sqlConnectionString);
