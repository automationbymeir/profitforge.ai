// Use SST's global azurenative provider

export interface CognitiveServicesResources {
  documentIntelligence: azurenative.cognitiveservices.Account;
}

export function createCognitiveServicesResources(
  resourceGroupName: string | $util.Output<string>,
  location: string = "eastus"
): CognitiveServicesResources {
  const documentIntelligence = new azurenative.cognitiveservices.Account("docintell", {
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
