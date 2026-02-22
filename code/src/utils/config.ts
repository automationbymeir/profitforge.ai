/**
 * Configuration Management
 * Centralized environment variable validation and access
 */

import { DEFAULT_RATE_LIMITS } from './constants.js';
import { assertDefined } from './typeGuards.js';

interface AppConfig {
  // Storage
  storageConnectionString: string;
  storageAccountName: string;
  storageContainerDocuments: string;

  // Database
  sqlConnectionString: string;

  // Azure AI Services
  documentIntelligenceEndpoint: string;
  documentIntelligenceKey: string;
  aiProjectEndpoint: string;
  aiProjectKey: string;

  // Security & Rate Limiting
  isDemoMode: boolean;
  demoApiKey?: string;
  maxDailyUploads: number;
  maxUploadsPerIpPerHour: number;
  maxFileSizeMB: number;
  functionAppURL: string;
}

let cachedConfig: AppConfig | null = null;

/**
 * Get validated configuration (cached after first call)
 * Throws on missing required environment variables
 */
export function getConfig(): AppConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  // Required variables
  assertDefined(process.env.FUNCTION_APP_URL, 'FUNCTION_APP_URL environment variable is required');
  // Required variables
  assertDefined(
    process.env.STORAGE_CONNECTION_STRING,
    'STORAGE_CONNECTION_STRING environment variable is required'
  );
  assertDefined(
    process.env.SQL_CONNECTION_STRING,
    'SQL_CONNECTION_STRING environment variable is required'
  );
  assertDefined(
    process.env.DOCUMENT_INTELLIGENCE_ENDPOINT,
    'DOCUMENT_INTELLIGENCE_ENDPOINT environment variable is required'
  );
  assertDefined(
    process.env.DOCUMENT_INTELLIGENCE_KEY,
    'DOCUMENT_INTELLIGENCE_KEY environment variable is required'
  );
  assertDefined(
    process.env.AI_PROJECT_ENDPOINT,
    'AI_PROJECT_ENDPOINT environment variable is required'
  );
  assertDefined(process.env.AI_PROJECT_KEY, 'AI_PROJECT_KEY environment variable is required');

  const isDemoMode = process.env.IS_DEMO_MODE === 'true';

  // Demo mode requires API key
  if (isDemoMode) {
    assertDefined(process.env.DEMO_API_KEY, 'DEMO_API_KEY is required when IS_DEMO_MODE=true');
  }

  cachedConfig = {
    storageConnectionString: process.env.STORAGE_CONNECTION_STRING,
    storageAccountName: process.env.STORAGE_ACCOUNT_NAME || '',
    storageContainerDocuments: process.env.STORAGE_CONTAINER_DOCUMENTS || 'uploads',

    sqlConnectionString: process.env.SQL_CONNECTION_STRING,

    documentIntelligenceEndpoint: process.env.DOCUMENT_INTELLIGENCE_ENDPOINT,
    documentIntelligenceKey: process.env.DOCUMENT_INTELLIGENCE_KEY,
    aiProjectEndpoint: process.env.AI_PROJECT_ENDPOINT,
    aiProjectKey: process.env.AI_PROJECT_KEY,

    isDemoMode,
    demoApiKey: process.env.DEMO_API_KEY,
    maxDailyUploads: parseInt(
      process.env.MAX_DAILY_UPLOADS || String(DEFAULT_RATE_LIMITS.MAX_DAILY_UPLOADS),
      10
    ),
    maxUploadsPerIpPerHour: parseInt(
      process.env.MAX_UPLOADS_PER_IP_PER_HOUR ||
        String(DEFAULT_RATE_LIMITS.MAX_UPLOADS_PER_IP_PER_HOUR),
      10
    ),
    maxFileSizeMB: parseInt(
      process.env.MAX_FILE_SIZE_MB || String(DEFAULT_RATE_LIMITS.MAX_FILE_SIZE_MB),
      10
    ),
    functionAppURL: process.env.FUNCTION_APP_URL,
  };

  return cachedConfig;
}

/**
 * Reset cached configuration (for testing)
 */
export function resetConfig(): void {
  cachedConfig = null;
}

/**
 * Check if running in demo mode
 */
export function isDemoMode(): boolean {
  return getConfig().isDemoMode;
}

/**
 * Get storage connection string
 */
export function getStorageConnectionString(): string {
  return getConfig().storageConnectionString;
}

/**
 * Get SQL connection string
 */
export function getSqlConnectionString(): string {
  return getConfig().sqlConnectionString;
}

/**
 * Convert SQL connection string to Prisma format
 * 
 * Prisma requires: sqlserver://HOST:PORT;database=DB;user=USER;password=PASS;encrypt=true
 * 
 * Supports multiple input formats:
 * 1. Already in Prisma format: sqlserver://host:port;database=...
 * 2. mssql semicolon format: host:port;database=...;user=...;password=...
 * 3. Azure SQL format: Server=host;Database=db;User Id=user;Password=pass
 * 
 * @returns Connection string in Prisma-compatible format
 */
export function getPrismaConnectionString(): string {
  const connectionString = getSqlConnectionString();
  
  // If already in correct format, return as-is
  if (connectionString.startsWith('sqlserver://')) {
    return connectionString;
  }
  
  // Parse connection string into key-value pairs
  const params: Record<string, string> = {};
  let host = '';
  let port = '1433';
  
  // Split by semicolon and parse
  const parts = connectionString.split(';').filter(p => p.trim());
  
  for (const part of parts) {
    const trimmed = part.trim();
    
    // Check if this is a key=value pair
    if (trimmed.includes('=')) {
      const [key, ...valueParts] = trimmed.split('=');
      const value = valueParts.join('='); // Handle passwords with = in them
      const normalizedKey = key.trim().toLowerCase().replace(/\s+/g, '');
      
      // Normalize keys to Prisma format
      if (normalizedKey === 'server' || normalizedKey === 'datasource' || normalizedKey === 'host') {
        // Extract host and port from "server.database.windows.net,1433" or "tcp:server.database.windows.net,1433"
        let serverValue = value.trim();
        
        // Strip tcp: prefix if present (common in Azure SQL connection strings)
        if (serverValue.toLowerCase().startsWith('tcp:')) {
          serverValue = serverValue.substring(4);
        }
        
        // Now parse host and port
        const serverParts = serverValue.split(/[,:]/);
        host = serverParts[0].trim();
        if (serverParts[1]) {
          port = serverParts[1].trim();
        }
      } else if (normalizedKey === 'database' || normalizedKey === 'initialcatalog') {
        params.database = value.trim();
      } else if (normalizedKey === 'userid' || normalizedKey === 'user' || normalizedKey === 'uid') {
        params.user = value.trim();
      } else if (normalizedKey === 'password' || normalizedKey === 'pwd') {
        params.password = value.trim();
      } else if (normalizedKey === 'encrypt') {
        params.encrypt = value.trim();
      } else if (normalizedKey === 'trustservercertificate') {
        params.trustServerCertificate = value.trim();
      } else {
        // Keep other params as-is
        params[normalizedKey] = value.trim();
      }
    } else if (!host && trimmed.includes(':')) {
      // This might be "host:port" format (first part without =)
      const [h, p] = trimmed.split(':');
      host = h.trim();
      port = p.trim();
    } else if (!host) {
      // Assume it's just a hostname
      host = trimmed;
    }
  }
  
  // Ensure we have minimum required fields
  if (!host) {
    throw new Error('Failed to parse SQL connection string: missing host/server');
  }
  if (!params.database) {
    throw new Error('Failed to parse SQL connection string: missing database');
  }
  if (!params.user) {
    throw new Error('Failed to parse SQL connection string: missing user');
  }
  if (!params.password) {
    throw new Error('Failed to parse SQL connection string: missing password');
  }
  
  // Build Prisma connection string
  const prismaParams = [
    `database=${params.database}`,
    `user=${params.user}`,
    `password=${params.password}`,
    `encrypt=${params.encrypt || 'true'}`,
    `trustServerCertificate=${params.trustServerCertificate || 'false'}`,
  ];
  
  // Add any additional parameters
  for (const [key, value] of Object.entries(params)) {
    if (!['database', 'user', 'password', 'encrypt', 'trustServerCertificate'].includes(key)) {
      prismaParams.push(`${key}=${value}`);
    }
  }
  
  const result = `sqlserver://${host}:${port};${prismaParams.join(';')}`;
  
  // Debug log (mask password)
  const debugResult = result.replace(/password=[^;]+/, 'password=***');
  console.log('[Prisma] Converted connection string:', debugResult);
  
  return result;
}

/**
 * Get Function App URL
 */
export function getFunctionAppURL(): string {
  return getConfig().functionAppURL;
}
