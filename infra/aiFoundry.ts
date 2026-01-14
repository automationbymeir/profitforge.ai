import * as azurenative from "@pulumi/azure-native";
import * as pulumi from "@pulumi/pulumi";
import { azureConfig } from "./config";

export interface AIFoundryResources {
  aiHub: pulumi.Output<azurenative.machinelearningservices.GetWorkspaceResult>;
  aiProject: pulumi.Output<azurenative.machinelearningservices.GetWorkspaceResult>;
}

export function createAIFoundryResources(
  resourceGroupName: string,
  location: string = "eastus",
  openaiAccountName: pulumi.Input<string>
): AIFoundryResources {
  // Reference existing AI Hub
  const aiHub = azurenative.machinelearningservices.getWorkspaceOutput({
    resourceGroupName,
    workspaceName: azureConfig.aiHubName,
  });

  // Reference existing AI Project
  const aiProject = azurenative.machinelearningservices.getWorkspaceOutput({
    resourceGroupName,
    workspaceName: azureConfig.aiProjectName,
  });

  // GPT-4o Deployment in the Project (OpenAI Account sub-resource)
  // ...
  const gpt4oDeployment = new azurenative.cognitiveservices.Deployment("gpt4o", {
    deploymentName: "gpt-4o",
    accountName: openaiAccountName,
    resourceGroupName: resourceGroupName,
    properties: {
      model: {
        format: "OpenAI",
        name: "gpt-4o",
        version: "2024-05-13",
      },
    },
    sku: {
      name: "GlobalStandard",
      capacity: 10, // 10k TPM
    },
  });

  return {
    aiHub,
    aiProject,
  };
}
