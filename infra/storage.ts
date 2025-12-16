import * as pulumi from "@pulumi/pulumi";
import * as azure from "@pulumi/azure-native";

export interface StorageResources {
  dataLake: azure.storage.StorageAccount;
  dataLakeFilesystem: azure.storage.DataLakeGen2Filesystem;
  blobStorage: azure.storage.StorageAccount;
  uploadsContainer: azure.storage.BlobContainer;
}

export function createStorageResources(
  resourceGroupName: pulumi.Input<string>,
  location: string = "eastus"
): StorageResources {
  // Data Lake Gen2 Storage Account
  const dataLake = new azure.storage.StorageAccount("vendordata-datalake", {
    resourceGroupName,
    location,
    kind: "StorageV2",
    sku: {
      name: "Standard_LRS",
    },
    isHnsEnabled: true, // Enable hierarchical namespace for Data Lake Gen2
    accessTier: "Hot",
    allowBlobPublicAccess: false,
    minimumTlsVersion: "TLS1_2",
  });

  // Data Lake Gen2 Filesystem
  const dataLakeFilesystem = new azure.storage.DataLakeGen2Filesystem("vendordata-filesystem", {
    accountName: dataLake.name,
    filesystemName: "vendordata",
  });

  // Blob Storage Account for uploads
  const blobStorage = new azure.storage.StorageAccount("vendoruploads", {
    resourceGroupName,
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
  const uploadsContainer = new azure.storage.BlobContainer("uploads", {
    accountName: blobStorage.name,
    containerName: "uploads",
    publicAccess: "None",
  });

  return {
    dataLake,
    dataLakeFilesystem,
    blobStorage,
    uploadsContainer,
  };
}
