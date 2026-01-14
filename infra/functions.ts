import * as azurenative from "@pulumi/azure-native";
import * as pulumi from "@pulumi/pulumi";

export interface FunctionAppResources {
  functionApp: azurenative.web.WebApp;
  appServicePlan: azurenative.web.AppServicePlan;
}

export function createFunctionAppResources(
  resourceGroupName: pulumi.Input<string>,
  location: string = "eastus",
  storageAccountConnectionString: pulumi.Input<string>,
  keyVaultUri: pulumi.Input<string>
): FunctionAppResources {
  // App Service Plan (Consumption plan for serverless)
  const appServicePlan = new azurenative.web.AppServicePlan("vendordata-functions-plan", {
    resourceGroupName,
    location,
    kind: "functionapp",
    sku: {
      name: "Y1", // Consumption plan
      tier: "Dynamic",
    },
  });

  // Function App
  const functionApp = new azurenative.web.WebApp("vendordata-functions", {
    resourceGroupName,
    location,
    serverFarmId: appServicePlan.id,
    kind: "functionapp",
    siteConfig: {
      appSettings: [
        {
          name: "AzureWebJobsStorage",
          value: storageAccountConnectionString,
        },
        {
          name: "WEBSITE_CONTENTAZUREFILECONNECTIONSTRING",
          value: storageAccountConnectionString,
        },
        {
          name: "WEBSITE_CONTENTSHARE",
          value: "vendordata-functions",
        },
        {
          name: "FUNCTIONS_EXTENSION_VERSION",
          value: "~4",
        },
        {
          name: "FUNCTIONS_WORKER_RUNTIME",
          value: "node",
        },
        {
          name: "KEY_VAULT_URI",
          value: keyVaultUri,
        },
      ],
      nodeVersion: "~20",
      use32BitWorkerProcess: false,
    },
    httpsOnly: true,
  });

  return {
    functionApp,
    appServicePlan,
  };
}
