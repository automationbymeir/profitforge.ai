import * as pulumi from "@pulumi/pulumi";
import * as azure from "@pulumi/azure-native";

export interface ApplicationInsightsResources {
  appInsights: azure.insights.Component;
}

export function createApplicationInsightsResources(
  resourceGroupName: pulumi.Input<string>,
  location: string = "eastus"
): ApplicationInsightsResources {
  const appInsights = new azure.insights.Component("vendordata-insights", {
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
