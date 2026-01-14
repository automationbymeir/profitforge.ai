// Use SST's global azurenative provider

import * as azurenative from "@pulumi/azure-native";
import * as command from "@pulumi/command";
import * as pulumi from "@pulumi/pulumi";
import * as mssql from "@pulumiverse/mssql";
import * as crypto from "crypto";
import * as fs from "fs";

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
  adminPassword: pulumi.Output<string>
): DatabaseResources {
  // Create SQL Server
  const sqlServer = new azurenative.sql.Server(`${stack}-vvocr-sql`, {
    resourceGroupName: resourceGroupName,
    location: location,
    administratorLogin: adminUsername,
    administratorLoginPassword: adminPassword,
    version: "12.0",
    minimalTlsVersion: "1.2",
    publicNetworkAccess: azurenative.sql.ServerNetworkAccessFlag.Enabled,
  });

  // Allow Azure services and resources within the same region to access
  new azurenative.sql.FirewallRule(`${stack}-allow-azure`, {
    resourceGroupName: resourceGroupName,
    serverName: sqlServer.name,
    startIpAddress: "0.0.0.0",
    endIpAddress: "255.255.255.255",
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

  // Wait for database to be fully "ready" for connections (Azure SQL Serverless warmup)
  const waitForDb = new command.local.Command(
    "wait-for-db",
    {
      create: "sleep 45",
    },
    { dependsOn: [sqlDatabase] }
  );

  // Build connection string
  const sqlConnectionString = pulumi.interpolate`Server=tcp:${sqlServer.fullyQualifiedDomainName},1433;Database=${sqlDatabase.name};User ID=${adminUsername};Password=${adminPassword};Encrypt=true;TrustServerCertificate=false;Connection Timeout=30;`;

  // Configure MSSQL Provider
  const mssqlProvider = new mssql.Provider(
    "mssql-provider",
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
  const schemaScriptContentRaw = fs.readFileSync("infra/vvocr-schema.sql", "utf8");
  const schemaScriptContent = schemaScriptContentRaw
    .replace(/^GO\s*$/gm, "")
    .replace(/^\s*GO\s*$/gm, "");

  const schemaHash = crypto.createHash("md5").update(schemaScriptContent).digest("hex");

  const deploySchema = new mssql.Script(
    "deploy-schema",
    {
      databaseId: database.id,
      updateScript: `
        ${schemaScriptContent}
        
        -- Track schema version for Pulumi
        IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'vvocr') EXEC('CREATE SCHEMA vvocr');
        IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'schema_migrations' AND schema_id = SCHEMA_ID('vvocr'))
        BEGIN
            CREATE TABLE vvocr.schema_migrations (version_hash VARCHAR(64) PRIMARY KEY, applied_at DATETIME2 DEFAULT GETUTCDATE());
        END
        
        -- Update or Insert version
        IF EXISTS (SELECT * FROM vvocr.schema_migrations)
            UPDATE vvocr.schema_migrations SET version_hash = '${schemaHash}', applied_at = GETUTCDATE();
        ELSE
            INSERT INTO vvocr.schema_migrations (version_hash) VALUES ('${schemaHash}');
      `,
      readScript: `
        IF EXISTS (SELECT * FROM sys.tables WHERE name = 'schema_migrations' AND schema_id = SCHEMA_ID('vvocr'))
          SELECT TOP 1 [version_hash] as [hash] FROM [vvocr].[schema_migrations]
        ELSE
          SELECT '' as [hash]
      `,
      state: {
        hash: schemaHash,
      },
    },
    {
      provider: mssqlProvider,
      dependsOn: [sqlDatabase],
    }
  );

  // Helper to create views safely as separate Pulumi resources
  const createView = (name: string, definition: string) => {
    return new mssql.Script(
      `view-${name}`,
      {
        databaseId: database.id,
        updateScript: `IF OBJECT_ID('vvocr.${name}', 'V') IS NOT NULL DROP VIEW vvocr.${name}; EXEC('${definition.replace(
          /'/g,
          "''"
        )}');`,
        readScript: `IF OBJECT_ID('vvocr.${name}', 'V') IS NOT NULL SELECT 'exists' as [status] ELSE SELECT '' as [status]`,
        state: { status: "exists" },
      },
      { provider: mssqlProvider, dependsOn: [deploySchema] }
    );
  };

  createView(
    "v_recent_processing_summary",
    `
  CREATE VIEW vvocr.v_recent_processing_summary AS
  SELECT 
      r.result_id,
      r.document_name,
      r.processing_status,
      r.ai_model_used,
      r.doc_intel_confidence_score,
      r.ai_confidence_score,
      r.total_cost_usd,
      r.processing_duration_ms,
      r.requires_manual_review,
      r.uploaded_at,
      r.processing_completed_at,
      q.validation_status as review_status
  FROM vvocr.document_processing_results r
  LEFT JOIN vvocr.manual_review_queue q ON r.result_id = q.result_id
  WHERE r.uploaded_at >= DATEADD(day, -7, GETUTCDATE());
  `
  );

  createView(
    "v_daily_cost_summary",
    `
  CREATE VIEW vvocr.v_daily_cost_summary AS
  SELECT 
      tracking_date,
      service_name,
      SUM(units_consumed) as total_units,
      SUM(total_cost_usd) as total_cost_usd,
      COUNT(*) as transaction_count
  FROM vvocr.cost_tracking
  GROUP BY tracking_date, service_name;
  `
  );

  createView(
    "v_processing_performance",
    `
  CREATE VIEW vvocr.v_processing_performance AS
  SELECT 
      e.execution_run_id,
      e.execution_type,
      e.ai_model_used,
      e.documents_processed,
      e.documents_succeeded,
      e.documents_failed,
      e.total_cost_usd,
      e.avg_processing_time_ms,
      e.avg_confidence_score,
      e.execution_started_at,
      e.execution_duration_ms
  FROM vvocr.execution_log e
  WHERE e.execution_completed_at IS NOT NULL;
  `
  );

  return {
    sqlServer,
    sqlDatabase,
    connectionString: sqlConnectionString,
  };
}
