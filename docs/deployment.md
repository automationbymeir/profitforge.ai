# Infrastructure Deployment

Infrastructure managed with Pulumi (Azure Native provider).

## Prerequisites

- Azure CLI authenticated
- Pulumi CLI installed
- Node.js 20+
- Subscription with Contributor access

## Quick Deploy (Staging)

```bash
# 1. Authenticate
az login
az account set --subscription "your-subscription-id"

# 2. Initialize stack
pulumi stack init staging
pulumi stack select staging

# 3. Configure
pulumi config set azure-native:location eastus
pulumi config set azure-native:subscriptionId "your-sub-id"

# 4. Generate secrets
SQLPWD=$(openssl rand -base64 24)
pulumi config set --secret profitforge-ai:sqlAdminPassword "$SQLPWD"

# 5. Create Document Intelligence resource
az group create --name profitforge-staging-rg --location eastus
az cognitiveservices account create \
  --name profitforge-staging-docintel \
  --resource-group profitforge-staging-rg \
  --kind FormRecognizer \
  --sku S0 \
  --location eastus \
  --yes

# 6. Get Document Intelligence key
DOCINTEL_KEY=$(az cognitiveservices account keys list \
  --name profitforge-staging-docintel \
  --resource-group profitforge-staging-rg \
  --query "key1" -o tsv)

pulumi config set --secret profitforge-ai:documentIntelligenceKey "$DOCINTEL_KEY"

# 7. Deploy
pulumi up --stack staging
```

## Resources Deployed

| Resource              | Purpose            | Pricing       |
| --------------------- | ------------------ | ------------- |
| Azure Functions       | Serverless compute | Consumption   |
| Azure SQL Database    | Structured data    | Serverless    |
| Blob Storage          | Document storage   | Standard LRS  |
| Document Intelligence | OCR extraction     | S0 tier       |
| AI Foundry Hub        | Multi-model access | Pay-per-token |
| Application Insights  | Monitoring/logging | Pay-per-GB    |
| Key Vault             | Secrets management | Standard      |

## Stack Management

```bash
# View outputs
pulumi stack output

# Switch environments
pulumi stack select dev
pulumi stack select staging
pulumi stack select prod

# View configuration
pulumi config

# Destroy resources
pulumi destroy --stack staging
```

## Pulumi Files

```
infra/
├── aiFoundry.ts                # AI Foundry Hub + Project
├── applicationInsights.ts      # Monitoring
├── cognitiveServices.ts        # Document Intelligence
├── database.ts                 # Azure SQL + schema
├── functions.ts                # Function App deployment
├── keyVault.ts                 # Secrets management
├── storage.ts                  # Blob containers
├── config.ts                   # Shared configuration
└── vvocr-schema.sql            # Database schema
```

## Configuration Secrets

**Required:**

- `profitforge-ai:sqlAdminPassword` - SQL admin password (auto-generated)
- `profitforge-ai:documentIntelligenceKey` - Doc Intelligence API key

**Optional:**

- `profitforge-ai:aiProjectKey` - AI Foundry key (if using GPT-4o)

## Post-Deployment

### 1. Verify Deployment

```bash
# Get Function App URL
pulumi stack output functionAppUrl

# Test health endpoint
curl https://your-app.azurewebsites.net/api/sanity
```

### 2. Configure CORS (if needed)

```bash
FUNCTION_APP=$(pulumi stack output functionAppName)
az functionapp cors add \
  --name "$FUNCTION_APP" \
  --resource-group profitforge-staging-rg \
  --allowed-origins "https://yourwebsite.com"
```

### 3. Set Budget Alert

```bash
az consumption budget create \
  --budget-name staging-budget \
  --amount 500 \
  --category Cost \
  --time-grain Monthly \
  --resource-group profitforge-staging-rg \
  --contact-emails your-email@example.com \
  --threshold 80
```

## Environment Variables

Functions automatically configured with:

```bash
FUNCTIONS_WORKER_RUNTIME=node
AzureWebJobsFeatureFlags=EnableWorkerIndexing
AzureWebJobsStorage=<storage-connection-string>
SQL_CONNECTION_STRING=<sql-connection-string>
STORAGE_CONNECTION_STRING=<storage-connection-string>
DOCUMENT_INTELLIGENCE_ENDPOINT=<doc-intel-endpoint>
DOCUMENT_INTELLIGENCE_KEY=<doc-intel-key>
AI_PROJECT_ENDPOINT=<ai-foundry-endpoint>
AI_PROJECT_KEY=<ai-foundry-key>
```

## Monitoring

**Application Insights Query:**

```kusto
traces
| where timestamp > ago(1h)
| where severityLevel >= 2
| project timestamp, message, severityLevel
| order by timestamp desc
```

**Cost Monitoring:**

```bash
az consumption usage list \
  --start-date $(date -u -d '7 days ago' +%Y-%m-%d) \
  --end-date $(date -u +%Y-%m-%d) \
  --query "[?contains(instanceId, 'profitforge')].{Date:usageStart, Cost:pretaxCost}" \
  --output table
```

## Troubleshooting

**Deployment fails with "Resource already exists":**

- Check for orphaned resources: `az resource list --resource-group profitforge-staging-rg`
- Delete stack state: `pulumi stack rm staging`
- Re-deploy: `pulumi up`

**Functions not responding:**

- Check deployment status: `az functionapp show --name <app> --resource-group <rg>`
- View logs: `az functionapp log tail --name <app> --resource-group <rg>`

**SQL connection failures:**

- Verify firewall rules allow Azure services
- Check connection string in Key Vault
- Test connectivity: `az sql db show-connection-string`
