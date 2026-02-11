import * as azurenative from '@pulumi/azure-native';
import * as pulumi from '@pulumi/pulumi';
import { getAppLocation, getResourceGroup, isDemoMode } from './config';

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

  // Stack-specific plan configuration
  // dev: Consumption Y1 (serverless, low cost for dev)
  // staging: Basic B1 (dedicated, no quota issues, production-ready)
  // const isStaging = stack === 'staging';
  // const planConfig = isStaging
  //   ? {
  //       kind: 'app' as const,
  //       sku: { name: 'B1', tier: 'Basic' },
  //       reserved: false, // Windows
  //     }
  //   : {
  //       kind: 'functionapp' as const,
  //       sku: { name: 'Y1', tier: 'Dynamic' },
  //       reserved: true, // Linux for dev
  //     };

  // Create App Service Plan with stack-specific configuration
  const appServicePlan = new azurenative.web.AppServicePlan(`${stack}-function-plan`, {
    resourceGroupName: getResourceGroup(),
    location: getAppLocation(),
    name: `${stack}-function-plan`,
    kind: 'functionapp',
    sku: {
      name: 'Y1',
      tier: 'Dynamic',
    },
  });

  // --- Azure Functions Deployment ---

  // Create/manage the Function App with proper plan linkage (matching working example)
  const functionApp = new azurenative.web.WebApp(`${stack}-function-app`, {
    resourceGroupName: getResourceGroup(),
    location: getAppLocation(), // MUST match App Service Plan location
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
        { name: 'APPINSIGHTS_SAMPLING_PERCENTAGE', value: stack === 'staging' ? '100' : '20' }, // Sample 20% to reduce costs

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

        // Function App URL (required for config validation and client links)
        {
          name: 'FUNCTION_APP_URL',
          value: pulumi.interpolate`https://${stack}-vvocr-functions.azurewebsites.net`,
        },
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
