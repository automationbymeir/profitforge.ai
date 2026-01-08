// Use SST's global azurenative provider

export interface DatabaseResources {
  sqlServer: azurenative.sql.Server;
  sqlDatabase: azurenative.sql.Database;
}

export function createDatabaseResources(
  resourceGroupName: string | $util.Output<string>,
  location: string = "eastus",
  adminLogin: string = "sqladmin",
  adminPassword: string | $util.Output<string>
): DatabaseResources {
  // SQL Server
  const sqlServer = new azurenative.sql.Server("vendordata-sql", {
    resourceGroupName,
    location,
    administratorLogin: adminLogin,
    administratorLoginPassword: adminPassword,
    version: "12.0",
    minimalTlsVersion: "1.2",
  });

  // SQL Database
  const sqlDatabase = new azurenative.sql.Database("products-db", {
    resourceGroupName,
    serverName: sqlServer.name,
    location,
    sku: {
      name: "Basic", // Basic tier (cheapest, ~$5/month)
      tier: "Basic",
      capacity: 5, // 5 DTUs
    },
    requestedBackupStorageRedundancy: "Local",
  });

  return {
    sqlServer,
    sqlDatabase,
  };
}
