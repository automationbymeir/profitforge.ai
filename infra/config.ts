import * as pulumi from '@pulumi/pulumi';

/**
 * Pulumi configuration helper
 * All values come from Pulumi.<stack>.yaml config files
 * No hardcoded values - everything is stack-specific
 */

const config = new pulumi.Config('profitforge-ai');
const azureConfig = new pulumi.Config('azure-native');

// Demo mode configuration
export const isDemoMode = config.getBoolean('demoMode') || false;

// Get resource group from Pulumi config
export function getResourceGroup(): string {
  return config.require('resourceGroup');
}

// Get Azure location from provider config (defaults to provider's location)
export function getLocation(): string {
  return azureConfig.get('location') || 'eastus';
}

// Get Azure location from provider config (defaults to provider's location)
export function getAppLocation(): string {
  return azureConfig.get('appLocation') || 'israelcentral';
}

// Get existing resource names from Pulumi config
export function getCognitiveServicesName(): string {
  return config.require('cognitiveServicesName');
}

export function getAIHubName(): string {
  return config.require('aiHubName');
}

export function getAIProjectName(): string {
  return config.require('aiProjectName');
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
