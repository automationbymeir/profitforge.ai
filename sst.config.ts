/// <reference path="./.sst/platform/config.d.ts" />
export default $config({
  app(input) {
    return {
      name: "profitforge",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage),
      home: "local",
      providers: {
        "azure-native": "3.12.0",
      },
    };
  },
  async run() {
    // Import Azure configuration
    const { azureConfig } = await import("./infra/config");

    // Initialize SST Secrets for runtime use in functions
    const documentIntelligenceKey = new sst.Secret("DOCUMENT_INTELLIGENCE_KEY");
    const sqlAdminPassword = new sst.Secret("SqlAdminPassword");

    // Get stage
    const stage = $app.stage;
    const location = azureConfig.location;

    // Reference existing Azure resource group (uses az CLI credentials)
    const existingRg = await azurenative.resources.getResourceGroup({
      resourceGroupName: azureConfig.resourceGroup,
    });
    const resourceGroupName = $output(existingRg.name);

    // Create Azure SQL Database Serverless
    // Note: When project is complete, schemas will be manually migrated to production DB

    // Create SQL Server
    const sqlServer = new azurenative.sql.Server(`${stage}-vvocr-sql`, {
      resourceGroupName: resourceGroupName,
      location: location,
      administratorLogin: "sqladmin",
      administratorLoginPassword: sqlAdminPassword.value,
      version: "12.0",
      minimalTlsVersion: "1.2",
      publicNetworkAccess: azurenative.sql.ServerNetworkAccessFlag.Enabled,
    });

    // Allow Azure services to access
    new azurenative.sql.FirewallRule(`${stage}-allow-azure`, {
      resourceGroupName: resourceGroupName,
      serverName: sqlServer.name,
      startIpAddress: "0.0.0.0",
      endIpAddress: "0.0.0.0",
    });

    // Allow your current IP (update this as needed)
    new azurenative.sql.FirewallRule(`${stage}-allow-dev`, {
      resourceGroupName: resourceGroupName,
      serverName: sqlServer.name,
      startIpAddress: "5.29.14.211",
      endIpAddress: "5.29.14.211",
    });

    // Create Serverless Database
    const sqlDatabase = new azurenative.sql.Database(`${stage}-vvocr-db`, {
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
    const sqlConnectionString = $interpolate`Server=tcp:${sqlServer.fullyQualifiedDomainName},1433;Database=${sqlDatabase.name};User ID=sqladmin;Password=${sqlAdminPassword.value};Encrypt=true;TrustServerCertificate=false;Connection Timeout=30;`;

    const database = {
      sqlServer: {
        name: sqlServer.name,
        fullyQualifiedDomainName: sqlServer.fullyQualifiedDomainName,
      },
      sqlDatabase: {
        name: sqlDatabase.name,
      },
    };

    // Reference existing storage account
    const existingStorage = await azurenative.storage.getStorageAccount({
      resourceGroupName: azureConfig.resourceGroup,
      accountName: azureConfig.storageAccountName,
    });

    // Reference existing Key Vault
    const existingKeyVault = await azurenative.keyvault.getVault({
      resourceGroupName: azureConfig.resourceGroup,
      vaultName: azureConfig.keyVaultName,
    });
    // Export outputs (including secrets for runtime access)
    return {
      stage,
      location,
      resourceGroupName: resourceGroupName,
      storageAccountName: $output(existingStorage.name),
      keyVaultName: $output(existingKeyVault.name),
      keyVaultUrl: $output(existingKeyVault.properties.vaultUri),
      sqlServerName: database.sqlServer.name,
      sqlServerFqdn: database.sqlServer.fullyQualifiedDomainName,
      sqlDatabaseName: database.sqlDatabase.name,
      // AI Services configuration
      aiHubName: azureConfig.aiHubName,
      aiProjectName: azureConfig.aiProjectName,
      documentIntelligenceEndpoint: azureConfig.documentIntelligenceEndpoint,
      // Secrets for runtime use in functions
      documentIntelligenceKey: documentIntelligenceKey.value,
      // sqlConnectionString: sqlConnectionString.value,
    };
  },
});
