import * as azurenative from "@pulumi/azure-native";
import * as pulumi from "@pulumi/pulumi";

// Use SST's global azurenative provider

export interface StorageResources {
  // dataLake: azurenative.storage.StorageAccount;
  // dataLakeFilesystem: azurenative.storage.BlobContainer;
  blobStorage: azurenative.storage.StorageAccount;
  uploadsContainer: azurenative.storage.BlobContainer;
}

export function createStorageResources(
  resourceGroupName: pulumi.Input<string>,
  location: string,
  stack: string
): StorageResources {
  // Data Lake Gen2 Storage Account
  // const dataLake = new azurenative.storage.StorageAccount(`${stack}-datalake`, {
  //   resourceGroupName,
  //   accountName: `${stack}datalake${Date.now().toString().slice(-6)}`,
  //   location,
  //   kind: "StorageV2",
  //   sku: {
  //     name: "Standard_LRS",
  //   },
  //   isHnsEnabled: true, // Enable hierarchical namespace for Data Lake Gen2
  //   accessTier: "Hot",
  //   allowBlobPublicAccess: false,
  //   minimumTlsVersion: "TLS1_2",
  // });

  // // Data Lake Gen2 Filesystem (using blob container)
  // const dataLakeFilesystem = new azurenative.storage.BlobContainer(`${stack}-filesystem`, {
  //   resourceGroupName,
  //   accountName: dataLake.name,
  //   containerName: `${stack}-vendordata`,
  //   publicAccess: azurenative.storage.PublicAccess.None,
  // });

  // Blob Storage Account for uploads
  const blobStorage = new azurenative.storage.StorageAccount(`${stack}-blobstorage`, {
    resourceGroupName,
    accountName: `${stack}pvstorage`, // Removed dash and added characters for uniqueness
    location,
    kind: "StorageV2",
    sku: {
      name: "Standard_LRS",
    },
    accessTier: "Hot",
    allowBlobPublicAccess: false,
    minimumTlsVersion: "TLS1_2",
  });

  // Uploads container
  const uploadsContainer = new azurenative.storage.BlobContainer(`${stack}-uploads`, {
    resourceGroupName,
    accountName: blobStorage.name,
    containerName: "uploads",
    publicAccess: azurenative.storage.PublicAccess.None,
  });

  return {
    // dataLake,
    // dataLakeFilesystem,
    blobStorage,
    uploadsContainer,
  };
}
