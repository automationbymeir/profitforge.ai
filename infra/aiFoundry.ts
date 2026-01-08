// Use SST's global azurenative provider

export interface AIFoundryResources {
  aiHub: azurenative.machinelearningservices.Workspace;
  aiProject: azurenative.machinelearningservices.Workspace;
}

export function createAIFoundryResources(
  resourceGroupName: string | $util.Output<string>,
  location: string = "eastus",
  keyVaultId: string | $util.Output<string>,
  storageAccountId: string | $util.Output<string>,
  appInsightsId: string | $util.Output<string>
): AIFoundryResources {
  // Azure AI Hub (parent workspace)
  const aiHub = new azurenative.machinelearningservices.Workspace("aihub", {
    resourceGroupName,
    location,
    kind: "Hub",
    sku: {
      name: "Basic",
      tier: "Basic",
    },
    identity: {
      type: "SystemAssigned",
    },
    keyVault: keyVaultId,
    storageAccount: storageAccountId,
    applicationInsights: appInsightsId,
    friendlyName: "Document Intelligence AI Hub",
    description: "Azure AI Foundry Hub for multi-model document processing",
  });

  // Azure AI Project (child workspace)
  const aiProject = new azurenative.machinelearningservices.Workspace("aiproject", {
    resourceGroupName,
    location,
    kind: "Project",
    sku: {
      name: "Basic",
      tier: "Basic",
    },
    identity: {
      type: "SystemAssigned",
    },
    hubResourceId: aiHub.id,
    friendlyName: "Document Processing Project",
    description: "POC for vendor catalog processing with multi-model comparison",
  });

  return {
    aiHub,
    aiProject,
  };
}
