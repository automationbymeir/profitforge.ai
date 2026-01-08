// Use SST's global azurenative provider

export interface FunctionAppResources {
  functionApp: azurenative.web.WebApp;
  appServicePlan: azurenative.web.AppServicePlan;
}

export function createFunctionAppResources(
  resourceGroupName: string | $util.Output<string>,
  location: string = "eastus",
  storageAccountConnectionString: string | $util.Output<string>,
  keyVaultUri: string | $util.Output<string>
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
