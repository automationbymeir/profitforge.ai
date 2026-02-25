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

  return {
    appInsights,
    logAnalyticsWorkspace,
  };
}
