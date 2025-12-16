import * as pulumi from "@pulumi/pulumi";
import * as azure from "@pulumi/azure-native";

export interface DatabaseResources {
  sqlServer: azure.sql.Server;
  sqlDatabase: azure.sql.Database;
}

export function createDatabaseResources(
  resourceGroupName: pulumi.Input<string>,
  location: string = "eastus",
  adminLogin: string = "sqladmin",
  adminPassword: pulumi.Input<string>
): DatabaseResources {
  // SQL Server
  const sqlServer = new azure.sql.Server("vendordata-sql", {
    resourceGroupName,
    location,
    administratorLogin: adminLogin,
    administratorLoginPassword: adminPassword,
    version: "12.0",
    minimalTlsVersion: "1.2",
  });

  // SQL Database
  const sqlDatabase = new azure.sql.Database("products-db", {
    resourceGroupName,
    serverName: sqlServer.name,
    location,
    sku: {
      name: "S1", // Standard S1 tier
      tier: "Standard",
    },
    requestedBackupStorageRedundancy: "Local",
  });

  return {
    sqlServer,
    sqlDatabase,
  };
}
