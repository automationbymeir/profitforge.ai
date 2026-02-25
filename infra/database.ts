// Use SST's global azurenative provider

import * as azurenative from '@pulumi/azure-native';
import * as command from '@pulumi/command';
import * as pulumi from '@pulumi/pulumi';
import * as mssql from '@pulumiverse/mssql';
import * as crypto from 'crypto';
import * as fs from 'fs';

export interface DatabaseResources {
  sqlServer: azurenative.sql.Server;
  sqlDatabase: azurenative.sql.Database;
  connectionString: pulumi.Output<string>;
}

export function createDatabaseResources(
  resourceGroupName: pulumi.Input<string>,
  location: string,
  stack: string,
  adminUsername: string,
  adminPassword: pulumi.Output<string>,
  isDemoMode: boolean = false
): DatabaseResources {
  // Create SQL Server
  const sqlServer = new azurenative.sql.Server(`${stack}-vvocr-sql`, {
    resourceGroupName: resourceGroupName,
    location: location,
    administratorLogin: adminUsername,
    administratorLoginPassword: adminPassword,
    version: '12.0',
    minimalTlsVersion: '1.2',
    publicNetworkAccess: azurenative.sql.ServerNetworkAccessFlag.Enabled,
  });

  // Allow Azure services and resources within the same region to access
  new azurenative.sql.FirewallRule(`${stack}-allow-azure`, {
    resourceGroupName: resourceGroupName,
    serverName: sqlServer.name,
    startIpAddress: '0.0.0.0',
    endIpAddress: '255.255.255.255',
  });

  // Create Serverless Database with demo-optimized settings
  const sqlDatabase = new azurenative.sql.Database(`${stack}-vvocr-db`, {
    resourceGroupName: resourceGroupName,
    serverName: sqlServer.name,
    location: location,
    sku: {
      name: 'GP_S_Gen5',
      tier: 'GeneralPurpose',
      family: 'Gen5',
      capacity: 1, // Demo: 0.5 vCore, otherwise 1 vCore
    },
    autoPauseDelay: isDemoMode ? 15 : 60, // Demo: 15min, otherwise 60min
    minCapacity: 0.5, // Minimum 0.5 vCore
    maxSizeBytes: isDemoMode ? 1073741824 : 2147483648, // Demo: 1GB, otherwise 2GB
  });

  // Wait for database to be fully "ready" for connections (Azure SQL Serverless warmup)
  const waitForDb = new command.local.Command(
    'wait-for-db',
    {
      create: 'sleep 45',
    },
    { dependsOn: [sqlDatabase] }
  );

  // Build connection string
  const sqlConnectionString = pulumi.interpolate`Server=tcp:${sqlServer.fullyQualifiedDomainName},1433;Database=${sqlDatabase.name};User ID=${adminUsername};Password=${adminPassword};Encrypt=true;TrustServerCertificate=false;Connection Timeout=30;`;

  // Configure MSSQL Provider
  const mssqlProvider = new mssql.Provider(
    'mssql-provider',
    {
      hostname: sqlServer.fullyQualifiedDomainName,
      port: 1433,
      sqlAuth: {
        username: adminUsername,
        password: adminPassword,
      },
    },
    { dependsOn: [waitForDb] }
  );

  // Get the actual Database ID (required by Script resource)
  const database = mssql.getDatabaseOutput(
    {
      name: sqlDatabase.name,
    },
    { provider: mssqlProvider }
  );

  // Deploy the full production SQL schema script
  const schemaScriptContentRaw = fs.readFileSync('infra/vvocr-schema.sql', 'utf8');
  const schemaScriptContent = schemaScriptContentRaw
    .replace(/^GO\s*$/gm, '')
    .replace(/^\s*GO\s*$/gm, '');

  const schemaHash = crypto.createHash('md5').update(schemaScriptContent).digest('hex');

  new mssql.Script(
    'deploy-schema',
    {
      databaseId: database.id,
      updateScript: schemaScriptContent,
      readScript: `SELECT '${schemaHash}' as [hash]`,
      state: {
        hash: schemaHash,
      },
    },
    {
      provider: mssqlProvider,
      dependsOn: [sqlDatabase],
    }
  );

  // Views removed - schema simplified to only document_processing_results and vendor_products
  // Re-add views when cost_tracking, execution_log, and manual_review_queue tables are added

  return {
    sqlServer,
    sqlDatabase,
    connectionString: sqlConnectionString,
  };
}
