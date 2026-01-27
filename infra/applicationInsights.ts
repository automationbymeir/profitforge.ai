import * as azurenative from '@pulumi/azure-native';
import * as pulumi from '@pulumi/pulumi';

export interface ApplicationInsightsResources {
  appInsights: azurenative.applicationinsights.Component;
  logAnalyticsWorkspace: azurenative.operationalinsights.Workspace;
}

export function createApplicationInsightsResources(
  resourceGroupName: pulumi.Input<string>,
  location: string = 'eastus',
  stack?: string
): ApplicationInsightsResources {
  const resourcePrefix = stack ? `${stack}-vvocr` : 'vvocr';

  // Create Log Analytics Workspace (now required for App Insights)
  const logAnalyticsWorkspace = new azurenative.operationalinsights.Workspace(
    `${resourcePrefix}-log-analytics`,
    {
      resourceGroupName,
      location,
      sku: {
        name: 'PerGB2018',
      },
      retentionInDays: 30,
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
