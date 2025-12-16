import * as pulumi from "@pulumi/pulumi";
import * as azure from "@pulumi/azure-native";

export interface CognitiveServicesResources {
  documentIntelligence: azure.cognitiveservices.Account;
}

export function createCognitiveServicesResources(
  resourceGroupName: pulumi.Input<string>,
  location: string = "eastus"
): CognitiveServicesResources {
  const documentIntelligence = new azure.cognitiveservices.Account("docintell", {
    resourceGroupName,
    location,
    kind: "FormRecognizer",
    sku: {
      name: "S0", // Standard tier
    },
    properties: {},
  });

  return {
    documentIntelligence,
  };
}
