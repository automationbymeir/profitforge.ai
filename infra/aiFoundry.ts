import * as azurenative from '@pulumi/azure-native';
import * as pulumi from '@pulumi/pulumi';
import { getAIHubName, getAIProjectName } from './config';

export interface AIFoundryResources {
  aiHub: pulumi.Output<azurenative.machinelearningservices.GetWorkspaceResult>;
  aiProject: pulumi.Output<azurenative.machinelearningservices.GetWorkspaceResult>;
}

export function createAIFoundryResources(
  resourceGroupName: string,
  _location: string = 'eastus',
  openaiAccountName: pulumi.Input<string>
): AIFoundryResources {
  // Reference existing AI Hub
  const aiHub = azurenative.machinelearningservices.getWorkspaceOutput({
    resourceGroupName,
    workspaceName: getAIHubName(),
  });

  // Reference existing AI Project
  const aiProject = azurenative.machinelearningservices.getWorkspaceOutput({
    resourceGroupName,
    workspaceName: getAIProjectName(),
  });

  // GPT-4o Deployment in the Project (OpenAI Account sub-resource)
  const _gpt4oDeployment = new azurenative.cognitiveservices.Deployment('gpt4o', {
    deploymentName: 'gpt-4o',
    accountName: openaiAccountName,
    resourceGroupName: resourceGroupName,
    properties: {
      model: {
        format: 'OpenAI',
        name: 'gpt-4o',
        version: '2024-05-13',
      },
    },
    sku: {
      name: 'GlobalStandard',
      capacity: 10, // 10k TPM
    },
  });

  // GPT-4o-mini Deployment (for testing with higher rate limits)
  const _gpt4oMiniDeployment = new azurenative.cognitiveservices.Deployment('gpt4oMini', {
    deploymentName: 'gpt-4o-mini',
    accountName: openaiAccountName,
    resourceGroupName: resourceGroupName,
    properties: {
      model: {
        format: 'OpenAI',
        name: 'gpt-4o-mini',
        version: '2024-07-18', // Latest stable version
      },
    },
    sku: {
      name: 'GlobalStandard',
      capacity: 50, // Higher capacity for testing - 50k TPM
    },
  });

  return {
    aiHub,
    aiProject,
  };
}
