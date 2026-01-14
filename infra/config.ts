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

  // Storage (now managed by Pulumi)
  storageAccountName: string;
  storageContainerDocuments: string;

  // Key Vault (currently unused - to be added later if needed)
  keyVaultName: string;

  // SQL Database (managed by Pulumi)
  sqlServer: string;
  sqlDatabase: string;

  // AI Services (currently unused - commented out in index.ts)
  aiHubName: string;
  aiProjectName: string;
  cognitiveServicesName: string;
  documentIntelligenceEndpoint: string;
  
  // Existing Function App Resources (Created by Client)
  functionAppName: string;
  functionAppPlanName: string;
}

// All stages use client's existing resources
export const azureConfig: AzureConfig = {
  location: "israelcentral", // Deploy resources closer to Israel
  resourceGroup: "dragonfruit-dev-3P-Meir-rg",
  storageAccountName: "dragonfrstorage593005773",
  storageContainerDocuments: "df-documents",
  keyVaultName: "dragonfrkeyvaulte9dc603b",
  sqlServer: "df-dev-pfsql.database.windows.net",
  sqlDatabase: "df-dev-main",
  aiHubName: "dragonfruit-dev-3P-Meir-aihub",
  aiProjectName: "dragonfruit-dev-3P-Meir-project",
  cognitiveServicesName: "dragonfruit-dev-3P-Meir-docintel",
  documentIntelligenceEndpoint: "https://eastus.api.cognitive.microsoft.com/",
  functionAppName: "dev-meir-vvocr-functions",
  functionAppPlanName: "EastUSLinuxDynamicPlan",
};
