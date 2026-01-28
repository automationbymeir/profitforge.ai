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

**Prerequisites:** Node.js 20+, Docker, Azure CLI

```bash
# 1. Clone and install
npm install

# 2. Configure environment
cp javascript/.env.integration.example javascript/.env.integration
cp javascript/.env.e2e.example javascript/.env.e2e
# Edit .env.e2e with real Azure credentials

# 3. Start local infrastructure
npm run db:test:up

# 4. Run tests
npm test                    # Unit tests only
npm run test:integration    # Integration tests (Docker)
npm run test:e2e           # E2E tests (requires Azure credentials)

# 5. Start local functions
cd javascript
npm run build
npm run start
```

## Project Structure

```
javascript/src/functions/
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
