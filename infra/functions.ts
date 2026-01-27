import * as azurenative from '@pulumi/azure-native';
import * as pulumi from '@pulumi/pulumi';
import { azureConfig, isDemoMode } from './config';

export interface FunctionAppResources {
  functionApp: azurenative.web.WebApp;
  appServicePlan: azurenative.web.AppServicePlan;
}

export function createFunctionAppResources(
  storageConnectionString: pulumi.Input<string>,
  functionBlobUrl: pulumi.Input<string>,
  keyVaultUri: pulumi.Input<string>,
  documentIntelligenceEndpoint: pulumi.Input<string>,
  documentIntelligenceKey: pulumi.Input<string>,
  aiProjectEndpoint: pulumi.Input<string>,
  aiProjectKey: pulumi.Input<string>,
  sqlConnectionString: pulumi.Input<string>,
  appInsightsConnectionString: pulumi.Input<string>,
  stack: string
): FunctionAppResources {
  // --- Create Function App Infrastructure ---

  // Create App Service Plan (Consumption/Dynamic)
  const appServicePlan = new azurenative.web.AppServicePlan(`${stack}-function-plan`, {
    resourceGroupName: azureConfig.resourceGroup,
    location: azureConfig.location,
    name: `${stack}-function-plan`,
    kind: 'functionapp',
    sku: {
      name: 'Y1',
      tier: 'Dynamic',
    },
    // reserved: true, // Required for Linux
  });

  // --- Azure Functions Deployment ---

  // Create/manage the Function App with proper plan linkage (matching working example)
  const functionApp = new azurenative.web.WebApp(`${stack}-function-app`, {
    resourceGroupName: azureConfig.resourceGroup,
    location: azureConfig.location,
    name: `${stack}-vvocr-functions`,
    serverFarmId: appServicePlan.id, // Link to the App Service Plan
    kind: 'functionapp',
    siteConfig: {
      appSettings: [
        // Core Azure Functions settings
        { name: 'AzureWebJobsStorage', value: storageConnectionString },
        { name: 'FUNCTIONS_EXTENSION_VERSION', value: '~4' },
        { name: 'FUNCTIONS_WORKER_RUNTIME', value: 'node' },
        { name: 'WEBSITE_NODE_DEFAULT_VERSION', value: '~20' },
        { name: 'WEBSITE_RUN_FROM_PACKAGE', value: functionBlobUrl },

        // Application Insights (Monitoring)
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString },
        { name: 'APPINSIGHTS_SAMPLING_PERCENTAGE', value: '20' }, // Sample 20% to reduce costs

        // Storage settings for blob trigger and upload
        { name: 'STORAGE_CONNECTION_STRING', value: storageConnectionString },
        { name: 'STORAGE_CONTAINER_DOCUMENTS', value: 'uploads' },

        // Database connection
        { name: 'SQL_CONNECTION_STRING', value: sqlConnectionString },

        // Document Intelligence (OCR) settings
        { name: 'DOCUMENT_INTELLIGENCE_ENDPOINT', value: documentIntelligenceEndpoint },
        { name: 'DOCUMENT_INTELLIGENCE_KEY', value: documentIntelligenceKey },

        // OpenAI GPT-4o settings (for product mapping)
        { name: 'AI_PROJECT_ENDPOINT', value: aiProjectEndpoint },
        { name: 'AI_PROJECT_KEY', value: aiProjectKey },

        // Demo mode protection (controlled via pulumi config: demoMode)
        // Default: 0 (disabled) for client deployments
        // Demo: Set via 'pulumi config set demoMode true'
        { name: 'IS_DEMO_MODE', value: '' + isDemoMode },
        { name: 'MAX_DAILY_UPLOADS', value: isDemoMode ? '50' : '0' },
        { name: 'MAX_FILE_SIZE_MB', value: isDemoMode ? '10' : '0' },
        { name: 'MAX_UPLOADS_PER_IP_PER_HOUR', value: isDemoMode ? '10' : '0' },
        { name: 'DEMO_API_KEY', value: isDemoMode ? 'demo-key-change-me' : '' },
        { name: 'USAGE_RETENTION_DAYS', value: '30' },
      ],
      http20Enabled: true,
      nodeVersion: '~20',
    },
  });

  return {
    functionApp,
    appServicePlan,
  };
}
