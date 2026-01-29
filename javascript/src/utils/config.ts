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
  assertDefined(
    process.env.AI_PROJECT_KEY,
    'AI_PROJECT_KEY environment variable is required'
  );

  const isDemoMode = process.env.IS_DEMO_MODE === 'true';
  
  // Demo mode requires API key
  if (isDemoMode) {
    assertDefined(
      process.env.DEMO_API_KEY,
      'DEMO_API_KEY is required when IS_DEMO_MODE=true'
    );
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
    maxDailyUploads: parseInt(process.env.MAX_DAILY_UPLOADS || String(DEFAULT_RATE_LIMITS.MAX_DAILY_UPLOADS), 10),
    maxUploadsPerIpPerHour: parseInt(process.env.MAX_UPLOADS_PER_IP_PER_HOUR || String(DEFAULT_RATE_LIMITS.MAX_UPLOADS_PER_IP_PER_HOUR), 10),
    maxFileSizeMB: parseInt(process.env.MAX_FILE_SIZE_MB || String(DEFAULT_RATE_LIMITS.MAX_FILE_SIZE_MB), 10),
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
