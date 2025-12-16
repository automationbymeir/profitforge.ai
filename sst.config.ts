/// <reference path="./.sst/platform/config.d.ts" />

import { Pulumi } from "sst/pulumi";
import * as pulumi from "@pulumi/pulumi";
import * as azure from "@pulumi/azure-native";
import { createStorageResources } from "./infra/storage.js";
import { createDatabaseResources } from "./infra/database.js";
import { createKeyVaultResources } from "./infra/keyVault.js";
import { createFunctionAppResources } from "./infra/functions.js";
import { createCognitiveServicesResources } from "./infra/cognitiveServices.js";
import { createApplicationInsightsResources } from "./infra/applicationInsights.js";

export default $config({
  app(input) {
    return {
      name: "profitforge",
      home: "azure",
    };
  },

  async run() {
    // Use Pulumi component for Azure infrastructure
    const infra = new Pulumi("azure-infrastructure", async () => {
      const config = new pulumi.Config();
      const location = config.get("location") || "eastus";
      const sqlAdminPassword = config.requireSecret("sqlAdminPassword");
      
      // Get current Azure client config
      const clientConfig = await azure.authorization.getClientConfig();
      const tenantId = clientConfig.tenantId;
      const objectId = clientConfig.objectId;

      // Create resource group
      const resourceGroup = new azure.resources.ResourceGroup("rg-vendordata-prod", {
        location,
      });

      // Create storage resources
      const storage = createStorageResources(resourceGroup.name, location);

      // Create database resources
      const database = createDatabaseResources(
        resourceGroup.name,
        location,
        "sqladmin",
        sqlAdminPassword
      );

      // Create Key Vault
      const keyVault = createKeyVaultResources(
        resourceGroup.name,
        location,
        tenantId,
        objectId
      );

      // Get storage account connection string for Functions
      const storageKeys = azure.storage.listStorageAccountKeysOutput({
        resourceGroupName: resourceGroup.name,
        accountName: storage.blobStorage.name,
      });
      const storageConnectionString = pulumi.interpolate`DefaultEndpointsProtocol=https;AccountName=${storage.blobStorage.name};AccountKey=${storageKeys.keys[0].value};EndpointSuffix=core.windows.net`;

      // Create Function App
      const functions = createFunctionAppResources(
        resourceGroup.name,
        location,
        storageConnectionString,
        keyVault.keyVault.properties.vaultUri
      );

      // Create Cognitive Services (Document Intelligence)
      const cognitiveServices = createCognitiveServicesResources(
        resourceGroup.name,
        location
      );

      // Create Application Insights
      const appInsights = createApplicationInsightsResources(
        resourceGroup.name,
        location
      );

      // Export outputs
      return {
        resourceGroupName: resourceGroup.name,
        dataLakeAccountName: storage.dataLake.name,
        dataLakeFilesystemName: storage.dataLakeFilesystem.name,
        blobStorageAccountName: storage.blobStorage.name,
        sqlServerName: database.sqlServer.name,
        sqlDatabaseName: database.sqlDatabase.name,
        keyVaultName: keyVault.keyVault.name,
        keyVaultUri: keyVault.keyVault.properties.vaultUri,
        functionAppName: functions.functionApp.name,
        documentIntelligenceEndpoint: cognitiveServices.documentIntelligence.properties.endpoint,
        appInsightsInstrumentationKey: appInsights.appInsights.instrumentationKey,
      };
    });

    return {
      resourceGroupName: infra.resourceGroupName,
      dataLakeAccountName: infra.dataLakeAccountName,
      dataLakeFilesystemName: infra.dataLakeFilesystemName,
      blobStorageAccountName: infra.blobStorageAccountName,
      sqlServerName: infra.sqlServerName,
      sqlDatabaseName: infra.sqlDatabaseName,
      keyVaultName: infra.keyVaultName,
      keyVaultUri: infra.keyVaultUri,
      functionAppName: infra.functionAppName,
      documentIntelligenceEndpoint: infra.documentIntelligenceEndpoint,
      appInsightsInstrumentationKey: infra.appInsightsInstrumentationKey,
    };
  },
});
