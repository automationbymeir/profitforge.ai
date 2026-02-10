import * as azurenative from '@pulumi/azure-native';
import * as pulumi from '@pulumi/pulumi';
import { getResourceGroup } from './config';

// Use SST's global azurenative provider

export interface StorageResources {
  // dataLake: azurenative.storage.StorageAccount;
  // dataLakeFilesystem: azurenative.storage.BlobContainer;
  blobStorage: azurenative.storage.StorageAccount;
  uploadsContainer: azurenative.storage.BlobContainer;
  // bronzeLayerContainer: azurenative.storage.BlobContainer;
  aiMappingQueue: azurenative.storage.Queue;
  ocrQueue: azurenative.storage.Queue;
  storageConnectionString: pulumi.Output<string>;
  functionBlobUrl: pulumi.Output<string>;
}

export function createStorageResources(
  resourceGroupName: pulumi.Input<string>,
  location: string,
  stack: string
): StorageResources {
  // Blob Storage Account for uploads
  const blobStorage = new azurenative.storage.StorageAccount(`${stack}-blobstorage`, {
    resourceGroupName,
    accountName: `${stack}pvstorage`,
    location,
    kind: 'StorageV2',
    sku: {
      name: 'Standard_LRS',
    },
    accessTier: 'Hot',
    allowBlobPublicAccess: false,
    minimumTlsVersion: 'TLS1_2',
  });

  // Uploads container
  const uploadsContainer = new azurenative.storage.BlobContainer(`${stack}-uploads`, {
    resourceGroupName,
    accountName: blobStorage.name,
    containerName: 'uploads',
    publicAccess: azurenative.storage.PublicAccess.None,
  });

  // // Bronze-layer container for raw/processed data retention
  // const bronzeLayerContainer = new azurenative.storage.BlobContainer(`${stack}-bronze-layer`, {
  //   resourceGroupName,
  //   accountName: blobStorage.name,
  //   containerName: 'bronze-layer',
  //   publicAccess: azurenative.storage.PublicAccess.None,
  // });

  // Queue for AI mapping (decoupled processing)
  const aiMappingQueue = new azurenative.storage.Queue(`${stack}-ai-mapping-queue`, {
    resourceGroupName,
    accountName: blobStorage.name,
    queueName: 'ai-mapping-queue',
  });

  // Queue for OCR processing (decoupled)
  const ocrQueue = new azurenative.storage.Queue(`${stack}-ocr-queue`, {
    resourceGroupName,
    accountName: blobStorage.name,
    queueName: 'ocr-queue',
  });

  // Get primary storage key for connection string
  const storageKeys = azurenative.storage.listStorageAccountKeysOutput({
    resourceGroupName,
    accountName: blobStorage.name,
  });
  const storageConnectionString = pulumi.interpolate`DefaultEndpointsProtocol=https;AccountName=${blobStorage.name};AccountKey=${storageKeys.keys[0].value};EndpointSuffix=core.windows.net`;

  // Create code container for deployment
  const codeContainer = new azurenative.storage.BlobContainer(`${stack}-deployments`, {
    resourceGroupName,
    accountName: blobStorage.name,
    containerName: `${stack}-deployments`,
    publicAccess: azurenative.storage.PublicAccess.None,
  });

  // Pack the built target functions with flat structure for Azure Functions
  const codeBlob = new azurenative.storage.Blob(`${stack}-functions-zip-v2`, {
    resourceGroupName: getResourceGroup(),
    accountName: blobStorage.name,
    containerName: codeContainer.name,
    source: new pulumi.asset.FileArchive('./code'),
    blobName: `${stack}-functions-v2.zip`, // Force new deployment
    type: azurenative.storage.BlobType.Block,
  });

  // Get SAS token for the function app to download the zip
  const functionBlobSAS = azurenative.storage.listStorageAccountServiceSASOutput({
    accountName: blobStorage.name,
    protocols: azurenative.storage.HttpProtocol.Https,
    sharedAccessStartTime: '2023-01-01',
    sharedAccessExpiryTime: '2030-01-01',
    resourceGroupName: getResourceGroup(),
    resource: azurenative.storage.SignedResource.C,
    permissions: azurenative.storage.Permissions.R,
    canonicalizedResource: pulumi.interpolate`/blob/${blobStorage.name}/${codeContainer.name}`,
    contentType: 'application/json',
    cacheControl: 'max-age=5',
    contentDisposition: 'inline',
    contentEncoding: 'deflate',
  });

  const functionBlobUrl = pulumi.interpolate`https://${blobStorage.name}.blob.core.windows.net/${codeContainer.name}/${codeBlob.name}?${functionBlobSAS.serviceSasToken}`;

  return {
    blobStorage,
    uploadsContainer,
    // bronzeLayerContainer,
    aiMappingQueue,
    ocrQueue,
    storageConnectionString,
    functionBlobUrl,
  };
}
