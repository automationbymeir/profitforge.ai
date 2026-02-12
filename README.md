# Vendor Vault OCR (vvocr)

AI-powered document processing pipeline for extracting and standardizing vendor product catalogs from PDFs and spreadsheets.

## Architecture

```
Upload PDF → Azure Blob → Document Intelligence (OCR) → GPT-4o (Product Extraction) → SQL Database
```

**Key Features:**

- Multi-stage pipeline: OCR → AI mapping → Manual review → Production export
- Bronze-layer storage: All raw/processed data retained for audit trails
- Cost tracking: Per-document costs for Document Intelligence and LLM usage
- Versioned reprocessing: Test different prompts without re-running OCR
- Golden dataset testing: Automated accuracy validation

## Quick Start

**Prerequisites:** Node.js 20+, Docker, Azure Functions Core Tools, Azure CLI

```bash
# 1. Clone and install
npm install

# 2. Configure environment (for E2E tests only)
cp code/.env.e2e.example code/.env.e2e
# Edit .env.e2e with real Azure credentials

# 3. Run tests (infrastructure auto-starts)
npm test                    # Unit tests (no infrastructure needed)
npm run test:integration    # Integration tests (Docker auto-starts)
npm run test:e2e            # E2E tests (requires Azure credentials)

# 4. local dev with deployed azure resources, keys stored in .env.e2e.
# npm run dev runs:
# - watch build for automatic rebuild
# - local azure Functions with the env vars from .env.e2e
# - client at localhost:3000

cd code
set -a; source .env; FUNCTION_APP_URL=http://localhost:7071; set +a;
npm run dev
```

## Local Development Setup

Run Azure Functions locally while connecting to remote Azure resources (recommended for active development).

**Prerequisites:**

- Node.js 20+
- [Azure Functions Core Tools](https://learn.microsoft.com/en-us/azure/azure-functions/functions-run-local)
- Azure CLI (authenticated)
- Deployed Azure resources (see [Deployment Guide](docs/deployment.md))

### Step 1: Get Azure Resource Credentials

After deploying with Pulumi, extract your resource credentials:

```bash
# Display all outputs (including secrets)
pulumi stack output --show-secrets

# Or get specific values
pulumi stack output outputStorageConnectionString --show-secrets
pulumi stack output outputDatabaseConnectionString --show-secrets
pulumi stack output outputDocumentIntelligenceKey --show-secrets
pulumi stack output outputOpenAIKey --show-secrets
```

### Step 2: Configure Environment

```bash
cd code

# Copy the example environment file
cp .example.env .env

# Edit .env with your Azure credentials from Step 1
# The .example.env file contains explanations for each variable
nano .env  # or use your preferred editor
```

**Required variables:**

- `STORAGE_CONNECTION_STRING` - Azure Storage connection string
- `SQL_CONNECTION_STRING` - Azure SQL Database connection string
- `DOCUMENT_INTELLIGENCE_ENDPOINT` - Document Intelligence endpoint
- `DOCUMENT_INTELLIGENCE_KEY` - Document Intelligence API key
- `AI_PROJECT_ENDPOINT` - Azure OpenAI endpoint
- `AI_PROJECT_KEY` - Azure OpenAI API key
- `FUNCTION_APP_URL` - Set to `http://localhost:7071` for local dev

### Step 3: Install Dependencies

```bash
cd code
npm install
```

### Step 4: Build Project

```bash
npm run build
```

### Step 5: Start Local Functions

```bash
# Option 1: Use npm dev script (includes auto-rebuild + client)
npm run dev
# This starts:
# - TypeScript watch for auto-rebuild
# - Azure Functions runtime on localhost:7071
# - Static client on localhost:3000

# Option 2: Manual start (functions only)
set -a; source .env; set +a  # Load environment variables
func start
```

### Step 6: Test Your Setup

```bash
# Test health endpoint
curl http://localhost:7071/api/health

# Test upload (from another terminal)
curl -X POST http://localhost:7071/api/documents/upload \
  -F "file=@/path/to/test.pdf" \
  -F "vendorName=TestVendor"

# View results
curl http://localhost:7071/api/documents?limit=10
```

### Step 7: Access Web UI

Open your browser:

- **Client UI**: http://localhost:3000
- **Upload Page**: http://localhost:3000/test-client.html
- **Results Viewer**: http://localhost:3000/results-viewer.html

### Development Workflow

```bash
# Watch mode (auto-rebuild on file changes)
npm run watch

# In another terminal, start functions
cd code
set -a; source .env; set +a
func start

# Or use the combined dev script
npm run dev
```

### Troubleshooting

**"Cannot find module" errors:**

- Run `npm run build` to compile TypeScript
- Check that `dist/` directory exists

**"Connection refused" or Azure errors:**

- Verify `.env` file has correct credentials
- Test Azure connectivity: `az account show`
- Confirm resources are deployed: `pulumi stack output`

**"Port 7071 already in use":**

```bash
# Find and kill the process
lsof -ti:7071 | xargs kill -9
```

**Database connection errors:**

- Check if your IP is allowed in Azure SQL firewall
- Add your IP: `az sql server firewall-rule create --resource-group <rg> --server <server> --name AllowMyIP --start-ip-address <your-ip> --end-ip-address <your-ip>`

**Storage emulator (alternative to Azure Storage):**

```bash
# Install and run Azurite for local storage
npm install -g azurite
azurite --silent --location /tmp/azurite

# Update .env to use emulator
STORAGE_CONNECTION_STRING=UseDevelopmentStorage=true
```

## Project Structure

```
code/src/functions/
├── api.ts                     # Upload, status, reprocess, confirm, delete
├── documentProcessor.ts       # OCR stage (blob trigger)
├── aiProductMapper.ts         # AI mapping stage (HTTP trigger)
├── aiProductMapperQueue.ts    # Queue processor
└── getResults.ts              # Query results

infra/                         # Pulumi infrastructure definitions
docs/                          # Detailed documentation
```

## Development Workflow

**Processing a document:**

1. Upload PDF → Creates record with `status: pending`
2. Blob trigger → OCR extraction → `status: ocr_complete`
3. Queue message → AI mapping → `status: completed`
4. Manual review → Confirm export → Products inserted into `vendor_products`

**Reprocessing (prompt tuning):**

```bash
curl -X POST $API_URL/reprocessMapping -d '{"documentId": "uuid"}'
curl -X POST $API_URL/aiProductMapper -d '{"documentId": "uuid"}'
# Creates versioned result: ai-mapping/uuid-v2.json
```

## Documentation

- [API Reference](docs/api.md) - Endpoints, request/response formats
- [Architecture](docs/architecture.md) - System design, data flow, bronze layer
- [Testing](docs/testing.md) - Test strategy, running tests, writing tests
- [Logging & Monitoring](docs/logging.md) - Logging best practices, log levels, Application Insights
- [Deployment](docs/deployment.md) - Pulumi infrastructure deployment

## Cost Estimates

| Service               | Rate              | 10-page PDF | 100-page PDF |
| --------------------- | ----------------- | ----------- | ------------ |
| Document Intelligence | $1.50/1,000 pages | $0.02       | $0.15        |
| GPT-4o (product map)  | $2.50/$10 per 1M  | $0.03       | $0.15        |
| **Total**             |                   | **~$0.05**  | **~$0.30**   |

## Tech Stack

- **Runtime**: Node.js 20, TypeScript
- **Azure**: Functions, Document Intelligence, AI Foundry, SQL Database, Blob Storage
- **AI**: GPT-4o, Azure OpenAI
- **Testing**: Vitest, Docker (Azurite, SQL Server)
- **Infrastructure**: Pulumi (Azure Native)

## License

Proprietary - ProfitForge
