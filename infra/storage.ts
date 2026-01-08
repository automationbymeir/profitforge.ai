// Use SST's global azurenative provider

export interface StorageResources {
  dataLake: azurenative.storage.StorageAccount;
  dataLakeFilesystem: azurenative.storage.BlobContainer;
  blobStorage: azurenative.storage.StorageAccount;
  uploadsContainer: azurenative.storage.BlobContainer;
}

export function createStorageResources(
  resourceGroupName: string | $util.Output<string>,
  location: string = "eastus"
): StorageResources {
  // Data Lake Gen2 Storage Account
  const dataLake = new azurenative.storage.StorageAccount("vddatalake", {
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

  // Data Lake Gen2 Filesystem (using blob container)
  const dataLakeFilesystem = new azurenative.storage.BlobContainer("vdfilesystem", {
    resourceGroupName,
    accountName: dataLake.name,
    containerName: "vendordata",
    publicAccess: azurenative.storage.PublicAccess.None,
  });

  // Blob Storage Account for uploads
  const blobStorage = new azurenative.storage.StorageAccount("vduploads", {
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
  const uploadsContainer = new azurenative.storage.BlobContainer("uploads", {
    resourceGroupName,
    accountName: blobStorage.name,
    containerName: "uploads",
    publicAccess: azurenative.storage.PublicAccess.None,
  });

  return {
    dataLake,
    dataLakeFilesystem,
    blobStorage,
    uploadsContainer,
  };
}
