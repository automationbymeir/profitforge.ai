// Use SST's global azurenative provider

export interface ApplicationInsightsResources {
  appInsights: azurenative.insights.Component;
}

export function createApplicationInsightsResources(
  resourceGroupName: string | $util.Output<string>,
  location: string = "eastus"
): ApplicationInsightsResources {
  const appInsights = new azurenative.insights.Component("vendordata-insights", {
    resourceGroupName,
    location,
    kind: "web",
    applicationType: "web",
    requestSource: "rest",
  });

  return {
    appInsights,
  };
}
