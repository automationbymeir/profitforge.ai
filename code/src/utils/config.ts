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
  return parseSqlConnectionString(connectionString);
}

/**
 * Get Function App URL
 */
export function getFunctionAppURL(): string {
  return getConfig().functionAppURL;
}

function parseSqlConnectionString(connectionString: string): string {
  // Fast path: already in correct format
  if (connectionString.startsWith('sqlserver://')) {
    return connectionString;
  }

  // Key mapping for normalization (lookup table vs multiple conditionals)
  const KEY_MAP: Record<string, string> = {
    server: 'host',
    datasource: 'host',
    host: 'host',
    database: 'database',
    initialcatalog: 'database',
    userid: 'user',
    user: 'user',
    uid: 'user',
    password: 'password',
    pwd: 'password',
    encrypt: 'encrypt',
    trustservercertificate: 'trustServerCertificate',
  };

  const params: Record<string, string> = {
    encrypt: 'true',
    trustServerCertificate: 'false',
  };
  let host = '';
  let port = '1433';

  // Single pass parsing
  const parts = connectionString.split(';');
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    if (!part) continue;

    const eqIndex = part.indexOf('=');
    if (eqIndex === -1) {
      // No '=' means it might be "host:port" format
      if (!host && part.includes(':')) {
        const colonIndex = part.indexOf(':');
        host = part.slice(0, colonIndex).trim();
        port = part.slice(colonIndex + 1).trim();
      } else if (!host) {
        host = part;
      }
      continue;
    }

    // Parse key=value (handle passwords with = in them)
    const key = part.slice(0, eqIndex).trim().toLowerCase().replace(/\s+/g, '');
    const value = part.slice(eqIndex + 1).trim();

    const normalizedKey = KEY_MAP[key];

    if (normalizedKey === 'host') {
      // Strip tcp: prefix and parse host:port or host,port
      const serverValue = value.startsWith('tcp:') ? value.slice(4) : value;
      const delimIndex = Math.max(serverValue.indexOf(':'), serverValue.indexOf(','));

      if (delimIndex !== -1) {
        host = serverValue.slice(0, delimIndex).trim();
        port = serverValue.slice(delimIndex + 1).trim();
      } else {
        host = serverValue;
      }
    } else if (normalizedKey) {
      params[normalizedKey] = value;
    } else {
      // Pass through unknown parameters
      params[key] = value;
    }
  }

  // Validate required fields (fail fast)
  if (!host) throw new Error('Failed to parse SQL connection string: missing host/server');
  if (!params.database) throw new Error('Failed to parse SQL connection string: missing database');
  if (!params.user) throw new Error('Failed to parse SQL connection string: missing user');
  if (!params.password) throw new Error('Failed to parse SQL connection string: missing password');

  // Build connection string (avoid array allocation for common case)
  const result = `sqlserver://${host}:${port};database=${params.database};user=${params.user};password=${params.password};encrypt=${params.encrypt};trustServerCertificate=${params.trustServerCertificate}`;

  // Append any extra parameters
  const extraParams: string[] = [];
  for (const key in params) {
    if (
      key !== 'database' &&
      key !== 'user' &&
      key !== 'password' &&
      key !== 'encrypt' &&
      key !== 'trustServerCertificate'
    ) {
      extraParams.push(`${key}=${params[key]}`);
    }
  }

  const finalResult = extraParams.length > 0 ? `${result};${extraParams.join(';')}` : result;

  // Debug log (mask password) - only log in development
  if (process.env.NODE_ENV !== 'production') {
    const debugResult = finalResult.replace(/password=[^;]+/, 'password=***');
    console.log('[Prisma] Converted connection string:', debugResult);
  }

  return finalResult;
}
