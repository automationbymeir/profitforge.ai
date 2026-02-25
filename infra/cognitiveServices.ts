import * as azurenative from '@pulumi/azure-native';
import * as pulumi from '@pulumi/pulumi';
import { isDemoMode } from './config';

export interface CognitiveServicesResources {
  docIntelAccountName: pulumi.Output<string>;
  docIntelEndpoint: pulumi.Output<string>;
  docIntelPrimaryKey: pulumi.Output<string>;
  openAiAccountName: pulumi.Output<string>;
  openAiPrimaryKey: pulumi.Output<string>;
}

export function createCognitiveServices(
  resourceGroupName: pulumi.Input<string>,
  location: string,
  stack: string
): CognitiveServicesResources {
  // Determine if we should create new resources or reference existing ones
  const sku = isDemoMode ? 'F0' : 'S0'; // F0 = free tier for demo
  // Deployment capacities based on demo mode
  const gpt4oCapacity = isDemoMode ? 5 : 10; // 5k TPM for demo, 10k for prod
  const gpt4oMiniCapacity = isDemoMode ? 20 : 50; // 20k TPM for demo, 50k for prod
  const docIntelAccount = new azurenative.cognitiveservices.Account(`${stack}-doc-intel`, {
    resourceGroupName,
    location,
    kind: 'FormRecognizer',
    sku: {
      name: sku,
    },
    properties: {
      publicNetworkAccess: 'Enabled',
    },
  });

  const docIntelKeys = azurenative.cognitiveservices.listAccountKeysOutput({
    resourceGroupName,
    accountName: docIntelAccount.name,
  });

  const docIntelAccountName = docIntelAccount.name;
  const docIntel = azurenative.cognitiveservices.getAccountOutput({
    resourceGroupName,
    accountName: docIntelAccount.name,
  });

  // Create a new AIServices account for OpenAI
  const openAiAccount = new azurenative.cognitiveservices.Account(`${stack}-openai-account`, {
    resourceGroupName,
    location,
    kind: 'AIServices',
    sku: {
      name: 'S0',
    },
    properties: {
      publicNetworkAccess: 'Enabled',
    },
  });

  const openAiKeys = azurenative.cognitiveservices.listAccountKeysOutput({
    resourceGroupName,
    accountName: openAiAccount.name,
  });

  // Deploy models based on environment
  if (isDemoMode) {
    // Demo: Only deploy cost-efficient gpt-4o-mini
    const _gpt4oMiniDeployment = new azurenative.cognitiveservices.Deployment(
      `${stack}-gpt4oMini`,
      {
        deploymentName: 'gpt-4o-mini',
        accountName: openAiAccount.name,
        resourceGroupName: resourceGroupName,
        properties: {
          model: {
            format: 'OpenAI',
            name: 'gpt-4o-mini',
            version: '2024-07-18',
          },
        },
        sku: {
          name: 'GlobalStandard',
          capacity: gpt4oMiniCapacity,
        },
      }
    );
  } else {
    // Production: Deploy both gpt-4o and gpt-4o-mini
    const _gpt4oDeployment = new azurenative.cognitiveservices.Deployment(`${stack}-gpt4o`, {
      deploymentName: 'gpt-4o',
      accountName: openAiAccount.name,
      resourceGroupName: resourceGroupName,
      properties: {
        model: {
          format: 'OpenAI',
          name: 'gpt-4o',
          version: '2024-05-13',
        },
      },
      sku: {
        name: 'GlobalStandard',
        capacity: gpt4oCapacity,
      },
    });

    const _gpt4oMiniDeployment = new azurenative.cognitiveservices.Deployment(
      `${stack}-gpt4oMini`,
      {
        deploymentName: 'gpt-4o-mini',
        accountName: openAiAccount.name,
        resourceGroupName: resourceGroupName,
        properties: {
          model: {
            format: 'OpenAI',
            name: 'gpt-4o-mini',
            version: '2024-07-18',
          },
        },
        sku: {
          name: 'GlobalStandard',
          capacity: gpt4oMiniCapacity,
        },
      },
      {
        dependsOn: [_gpt4oDeployment], // Deploy sequentially to avoid conflicts
      }
    );
  }

  return {
    docIntelAccountName,
    docIntelEndpoint: docIntel.apply((a) => a.properties?.endpoint ?? ''),
    docIntelPrimaryKey: docIntelKeys.apply((k) => k.key1 ?? ''),
    openAiAccountName: openAiAccount.name,
    openAiPrimaryKey: openAiKeys.apply((k) => k.key1 ?? ''),
  };
}
