import * as azurenative from "@pulumi/azure-native";
import * as pulumi from "@pulumi/pulumi";
import { azureConfig } from "./config";

export interface CognitiveServicesResources {
  docIntelAccountName: pulumi.Output<string>;
  docIntelEndpoint: pulumi.Output<string>;
  docIntelPrimaryKey: pulumi.Output<string>;
  openAiAccountName: pulumi.Output<string>;
  openAiPrimaryKey: pulumi.Output<string>;
}

export function createCognitiveServices(
  resourceGroupName: pulumi.Input<string>,
  location: string = "eastus"
): CognitiveServicesResources {
  // 1. Reference existing Document Intelligence (FormRecognizer) account
  const docIntel = azurenative.cognitiveservices.getAccountOutput({
    resourceGroupName,
    accountName: azureConfig.cognitiveServicesName,
  });

  const docIntelKeys = azurenative.cognitiveservices.listAccountKeysOutput({
    resourceGroupName,
    accountName: azureConfig.cognitiveServicesName,
  });

  // 2. Create a new AIServices account for OpenAI (since existing is FormRecognizer)
  const openAiAccount = new azurenative.cognitiveservices.Account("openai-account", {
    resourceGroupName,
    location,
    kind: "AIServices",
    sku: {
      name: "S0",
    },
    properties: {
      publicNetworkAccess: "Enabled",
    },
  });

  const openAiKeys = azurenative.cognitiveservices.listAccountKeysOutput({
    resourceGroupName,
    accountName: openAiAccount.name,
  });

  return {
    docIntelAccountName: pulumi.output(azureConfig.cognitiveServicesName),
    docIntelEndpoint: docIntel.apply((a) => a.properties?.endpoint ?? ""),
    docIntelPrimaryKey: docIntelKeys.apply((k) => k.key1 ?? ""),
    openAiAccountName: openAiAccount.name,
    openAiPrimaryKey: openAiKeys.apply((k) => k.key1 ?? ""),
  };
}
