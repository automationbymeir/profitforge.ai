import * as pulumi from '@pulumi/pulumi';

/**
 * Pulumi configuration helper
 * All values come from Pulumi.<stack>.yaml config files
 * No hardcoded values - everything is stack-specific
 */

const config = new pulumi.Config('ai-pipeline');
const azureConfig = new pulumi.Config('azure-native');

// Demo mode configuration
export const isDemoMode = config.getBoolean('demoMode') || false;

// Get resource group from Pulumi config
export function getResourceGroup(): string {
  return config.require('resourceGroup');
}

// Get Azure location from provider config (defaults to provider's location)
export function getLocation(): string {
  return azureConfig.require('location');
}

// Get Azure location from provider config (defaults to provider's location)
export function getServerLocation(): string {
  return azureConfig.get('serverLocation') || azureConfig.require('location');
}

// Get existing resource names from Pulumi config
export function getCognitiveServicesName(): string {
  return config.get('cognitiveServicesName') || '';
}

export function getAIHubName(): string {
  return config.get('aiHubName') || '';
}

export function getAIProjectName(): string {
  return config.get('aiProjectName') || '';
}

export function getSqlServerHost(): string {
  return config.require('sqlServerHost');
}

export function getSqlDatabaseName(): string {
  return config.require('sqlDatabaseName');
}

export function getStorageAccountName(): string {
  return config.require('storageAccountName');
}

export function getStorageContainerDocuments(): string {
  return config.require('storageContainerDocuments');
}
