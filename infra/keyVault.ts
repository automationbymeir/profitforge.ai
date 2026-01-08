// Use SST's global azurenative provider

export interface KeyVaultResources {
  keyVault: azurenative.keyvault.Vault;
}

export function createKeyVaultResources(
  resourceGroupName: string | $util.Output<string>,
  location: string = "eastus",
  tenantId: string | $util.Output<string>,
  objectId: string | $util.Output<string>
): KeyVaultResources {
  const keyVault = new azurenative.keyvault.Vault("vendordata-kv", {
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
