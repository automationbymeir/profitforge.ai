import * as pulumi from "@pulumi/pulumi";
import * as azure from "@pulumi/azure-native";

export interface KeyVaultResources {
  keyVault: azure.keyvault.Vault;
}

export function createKeyVaultResources(
  resourceGroupName: pulumi.Input<string>,
  location: string = "eastus",
  tenantId: pulumi.Input<string>,
  objectId: pulumi.Input<string>
): KeyVaultResources {
  const keyVault = new azure.keyvault.Vault("vendordata-kv", {
    resourceGroupName,
    location,
    properties: {
      tenantId,
      sku: {
        family: "A",
        name: "standard",
      },
      accessPolicies: [
        {
          tenantId,
          objectId,
          permissions: {
            keys: ["all"],
            secrets: ["all"],
            certificates: ["all"],
          },
        },
      ],
      enabledForDeployment: false,
      enabledForTemplateDeployment: false,
      enabledForDiskEncryption: false,
      enableRbacAuthorization: false,
      enableSoftDelete: true,
      softDeleteRetentionInDays: 7,
    },
  });

  return {
    keyVault,
  };
}
