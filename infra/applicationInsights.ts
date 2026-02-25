import * as azurenative from '@pulumi/azure-native';
import * as pulumi from '@pulumi/pulumi';

export interface ApplicationInsightsResources {
  appInsights: azurenative.applicationinsights.Component;
  logAnalyticsWorkspace: azurenative.operationalinsights.Workspace;
}

export function createApplicationInsightsResources(
  resourceGroupName: pulumi.Input<string>,
  location: string = 'eastus',
  stack: string,
  isDemoMode: boolean = false
): ApplicationInsightsResources {
  const resourcePrefix = `${stack}-vvocr`;
  const retentionDays = isDemoMode ? 7 : 30; // Shorter retention for demo to save costs

  // Create Log Analytics Workspace (now required for App Insights)
  const logAnalyticsWorkspace = new azurenative.operationalinsights.Workspace(
    `${resourcePrefix}-log-analytics`,
    {
      resourceGroupName,
      location,
      sku: {
        name: 'PerGB2018',
      },
      retentionInDays: retentionDays,
    }
  );

  const appInsights = new azurenative.applicationinsights.Component(`${resourcePrefix}-insights`, {
    resourceGroupName,
    location,
    kind: 'web',
    applicationType: 'web',
    requestSource: 'rest',
    workspaceResourceId: logAnalyticsWorkspace.id,
    ingestionMode: 'LogAnalytics',
  });

  // Log cost monitoring recommendation for demo mode
  if (isDemoMode && stack) {
    pulumi.log.info(
      `Demo mode enabled. Please configure cost alerts in Azure Portal:\n` +
        `1. Navigate to Cost Management + Billing > Budgets\n` +
        `2. Create budget for resource group: ${resourceGroupName}\n` +
        `3. Recommended monthly budget: $20-30 for demo stack\n` +
        `4. Set alert at 80% and 100% thresholds`
    );
  }

  return {
    appInsights,
    logAnalyticsWorkspace,
  };
}
