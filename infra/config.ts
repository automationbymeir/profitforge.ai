/**
 * Azure resource configuration
 * Uses client's existing Azure resources (dragonfruit - Meir's credentials)
 * Non-sensitive values only - secrets should use SST Secret
 */

export interface AzureConfig {
  // Azure Region
  location: string;

  // Resource naming
  resourceGroup: string;

  // Storage
  storageAccountName: string;
  storageContainerDocuments: string;

  // Key Vault
  keyVaultName: string;

  // SQL Database (in different RG: dragonfruit-dev-rg)
  sqlServer: string;
  sqlDatabase: string;

  // AI Services
  aiHubName: string;
  aiProjectName: string;
  documentIntelligenceEndpoint: string;
}

// All stages use client's existing resources
export const azureConfig: AzureConfig = {
  location: "eastus",
  resourceGroup: "dragonfruit-dev-3P-Meir-rg",
  storageAccountName: "dragonfruitdevsa",
  storageContainerDocuments: "df-documents",
  keyVaultName: "dragonfruitdevkv",
  sqlServer: "df-dev-pfsql.database.windows.net",
  sqlDatabase: "df-dev-main",
  aiHubName: "dragonfruit-dev-3P-Meir-aihub",
  aiProjectName: "dragonfruit-dev-3P-Meir-project",
  documentIntelligenceEndpoint: "https://eastus.api.cognitive.microsoft.com/",
};
