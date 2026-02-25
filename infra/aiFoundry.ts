import * as azurenative from '@pulumi/azure-native';
import * as pulumi from '@pulumi/pulumi';
import { getAIHubName, getAIProjectName, isDemoMode } from './config';

export interface AIFoundryResources {
  aiHub: pulumi.Output<azurenative.machinelearningservices.GetWorkspaceResult>;
  aiProject: pulumi.Output<azurenative.machinelearningservices.GetWorkspaceResult>;
}

export function createAIFoundryResources(
  resourceGroupName: string,
  location: string,
  stack: string,
  storageAccountId: pulumi.Input<string>,
  appInsightsId: pulumi.Input<string>
): AIFoundryResources {
  if (isDemoMode) {
    // Create new AI Hub for demo
    const aiHubResource = new azurenative.machinelearningservices.Workspace(`${stack}-ai-hub`, {
      resourceGroupName,
      workspaceName: `${stack}-ai-hub`,
      location,
      kind: 'Hub',
      sku: {
        name: 'Basic',
        tier: 'Basic',
      },
      identity: {
        type: azurenative.machinelearningservices.ResourceIdentityType.SystemAssigned,
      },
      storageAccount: storageAccountId,
      applicationInsights: appInsightsId,
      publicNetworkAccess: azurenative.machinelearningservices.PublicNetworkAccessType.Enabled,
    });

    // Create AI Project within the Hub
    const aiProjectResource = new azurenative.machinelearningservices.Workspace(
      `${stack}-ai-project`,
      {
        resourceGroupName,
        workspaceName: `${stack}-ai-project`,
        location,
        kind: 'Project',
        hubResourceId: aiHubResource.id,
        sku: {
          name: 'Basic',
          tier: 'Basic',
        },
        identity: {
          type: azurenative.machinelearningservices.ResourceIdentityType.SystemAssigned,
        },
        publicNetworkAccess: azurenative.machinelearningservices.PublicNetworkAccessType.Enabled,
      },
      { dependsOn: [aiHubResource] }
    );

    const aiHub = azurenative.machinelearningservices.getWorkspaceOutput({
      resourceGroupName,
      workspaceName: aiHubResource.name,
    });

    const aiProject = azurenative.machinelearningservices.getWorkspaceOutput({
      resourceGroupName,
      workspaceName: aiProjectResource.name,
    });

    return { aiHub, aiProject };
  } else {
    // Reference existing AI Hub and Project
    const aiHub = azurenative.machinelearningservices.getWorkspaceOutput({
      resourceGroupName,
      workspaceName: getAIHubName(),
    });

    const aiProject = azurenative.machinelearningservices.getWorkspaceOutput({
      resourceGroupName,
      workspaceName: getAIProjectName(),
    });

    return { aiHub, aiProject };
  }
}
