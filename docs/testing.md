# Testing Strategy

## Test Pyramid

```
     E2E (5%)       ← Real Azure, slow, expensive
 Integration (25%)  ← Docker, fast, free
   Unit (70%)       ← Mocks, instant, free
```

## Test Types

| Type        | Infrastructure   | Speed | Cost | When         |
| ----------- | ---------------- | ----- | ---- | ------------ |
| Unit        | None (all mocks) | <1s   | Free | Every commit |
| Integration | Docker           | ~30s  | Free | Every commit |
| E2E         | Real Azure       | ~5min | $$   | Main branch  |

## Running Tests

```bash
# Unit tests (default)
npm test

# Integration tests
npm run db:test:up              # Start Docker
npm run test:integration
npm run db:test:down            # Stop Docker

# E2E tests
npm run test:e2e                # Requires .env.e2e with Azure creds

# Watch mode
npm run test:watch
npm run test:integration:watch
```

## Local Test Setup

### Integration Tests

**Requirements:** Docker Desktop running, Azure Functions **must be running locally**

Integration tests require **two processes running simultaneously**:

1. **Docker containers** (SQL Server + Azurite) - Auto-started by test setup
2. **Azure Functions** (local runtime) - Must start manually

**Setup:**

```bash
# Terminal 1: Start Azure Functions (keep running)
cd javascript
npm start
# Wait for "Host started" and "Functions available at http://localhost:7071"

# Terminal 2: Run integration tests
npm run test:integration
```

**Docker lifecycle:**

- Containers auto-start when tests begin (`docker-compose up -d`)
- Containers auto-stop when tests complete (`docker-compose down`)
- Manual control: `npm run db:test:up` / `npm run db:test:down`

**Configuration:**

- SQL Server: `localhost:1433`, database: `master`, schema: `vvocr`
- User: `sa`, Password: `TestPassword123!`
- Azurite: `localhost:10000/10001/10002`
- Connection strings hardcoded in `javascript/test/config.ts`
- Schema auto-initialized from `infra/vvocr-schema.sql`

> [!WARNING]
> If SQL password changes:
>
> 1. Update `SA_PASSWORD` in `docker-compose.test.yml`
> 2. Update `DOCKER_SQL_CONNECTION_STRING` in `test/config.ts`

**Manual Docker inspection:**

```bash
# View running containers
docker ps

# Should see:
# - profitforge-test-db (SQL Server 2022, port 1433)
# - profitforge-azurite (Storage emulator, ports 10000/10001/10002)

# Connect to SQL Server
docker exec -it profitforge-test-db /opt/mssql-tools/bin/sqlcmd -S localhost -U sa -P 'TestPassword123!'

# Query test data
USE master;
GO
SELECT * FROM vvocr.document_processing_results;
GO
```

### E2E Tests

**Requirements:** Real Azure resources, valid credentials

E2E tests can run against:

1. **Local Functions + Production Azure** (development mode)
2. **Deployed Functions + Production Azure** (CI/CD mode)

**Option 1: Load from Pulumi (Recommended)**

```bash
# Load environment variables from Pulumi stack
source ./scripts/load-e2e-env.sh

# Run E2E tests (uses deployed Functions by default)
npm run test:e2e
```

**Option 2: Manual `.env.e2e` file**

```bash
cd javascript
cp .env.e2e.example .env.e2e
# Edit .env.e2e with real Azure credentials
npm run test:e2e
```

**Required environment variables:**

```bash
SQL_CONNECTION_STRING="Server=..."
STORAGE_CONNECTION_STRING="DefaultEndpointsProtocol=https..."
AI_PROJECT_ENDPOINT="https://..."
AI_PROJECT_KEY="..."
DOCUMENT_INTELLIGENCE_ENDPOINT="https://..."
DOCUMENT_INTELLIGENCE_KEY="..."
FUNCTION_APP_URL="https://your-app.azurewebsites.net"  # Optional
```

**Pulumi output mapping:**

| Pulumi Output                    | Environment Variable             |
| -------------------------------- | -------------------------------- |
| `outputDatabaseConnectionString` | `SQL_CONNECTION_STRING`          |
| `outputStorageConnectionString`  | `STORAGE_CONNECTION_STRING`      |
| `outputDocumentIntelligenceKey`  | `DOCUMENT_INTELLIGENCE_KEY`      |
| `docIntelEndpoint`               | `DOCUMENT_INTELLIGENCE_ENDPOINT` |
| `outputOpenAIKey`                | `AI_PROJECT_KEY`                 |
| `functionAppEndpoint`            | `FUNCTION_APP_URL`               |

**Testing modes:**

```bash
# Use deployed Functions (CI/CD mode)
export FUNCTION_APP_URL="https://your-app.azurewebsites.net"
npm run test:e2e

# Use local Functions (development mode)
unset FUNCTION_APP_URL  # Test setup auto-starts local Functions
npm run test:e2e
```

> [!CAUTION]
> `.env.e2e` is gitignored - never commit production credentials.

## Writing Tests

### Unit Test Pattern

```typescript
// javascript/src/functions/api.test.ts
import { describe, it, expect, vi } from 'vitest';

describe('uploadDocument', () => {
  it('validates file size', async () => {
    const oversizedFile = { size: 100_000_000 }; // 100MB
    const result = await uploadDocument(oversizedFile);
    expect(result.status).toBe(400);
    expect(result.body.error).toContain('File too large');
  });
});
```

**Key:** Mock all external dependencies (database, storage, APIs).

### Integration Test Pattern

```typescript
// javascript/test/integration/upload-api.integration.test.ts
import { describe, it, expect } from 'vitest';
import { db } from '../helpers/test-db';
import { uploadToAzurite } from '../helpers/azurite';

describe('Upload → OCR', () => {
  it('processes uploaded PDF', async () => {
    // Arrange
    await db.seed('minimal-catalog.pdf');

    // Act
    const response = await uploadToAzurite('test-vendor', 'catalog.pdf');
    await db.waitForStatus(response.documentId, 'ocr_complete', 30000);

    // Assert
    const result = await db.getResult(response.documentId);
    expect(result.processingStatus).toBe('ocr_complete');
    expect(result.ocrResult).toBeDefined();
  });
});
```

**Key:** Use real Docker SQL + Azurite, mock Azure AI services.

### E2E Test Pattern

```typescript
// javascript/test/e2e/upload-to-completion.e2e.test.ts
import { describe, it, expect } from 'vitest';
import { uploadDocument } from '../helpers/api-client';

describe('Full pipeline', () => {
  it(
    'completes end-to-end processing',
    async () => {
      const file = readFileSync('fixtures/catalog.pdf');
      const upload = await uploadDocument('test-vendor', file);

      // Wait for completion (OCR + AI mapping)
      const result = await waitForCompletion(upload.documentId);

      expect(result.processingStatus).toBe('completed');
      expect(result.productCount).toBeGreaterThan(0);
      expect(result.docIntelCostUsd).toBeGreaterThan(0);
    },
    { timeout: 120000 }
  );
});
```

**Key:** No mocks, real Azure services, long timeouts.

## Test Helpers

### Database Helpers (`test/helpers/test-db.ts`)

```typescript
await db.seed(documentId, vendorName); // Insert test record
await db.clean(); // Delete all test data
await db.waitForStatus(docId, 'completed', ms); // Poll until status matches
const result = await db.getResult(docId); // Fetch processing result
```

### Azurite Helpers (`test/helpers/azurite.ts`)

```typescript
await azurite.upload(container, blob, data); // Upload to local emulator
const data = await azurite.download(blob); // Download from emulator
await azurite.sendQueueMessage(queue, msg); // Send queue message
```

### Mock Helpers (`test/helpers/azure-ai-mocks.ts`)

```typescript
mockDocumentIntelligence(fixture); // Mock OCR response
mockOpenAI(products); // Mock GPT-4o response
```

## CI/CD (GitHub Actions)

**Unit + Integration:** Run automatically on every PR

- No secrets needed
- Docker containers start automatically
- ~2 minutes total

**E2E:** Run on main branch merges only

- Requires GitHub secrets:
  - `SQL_CONNECTION_STRING`
  - `STORAGE_CONNECTION_STRING`
  - `AI_PROJECT_ENDPOINT`
  - `AI_PROJECT_KEY`
  - `DOCUMENT_INTELLIGENCE_ENDPOINT`
  - `DOCUMENT_INTELLIGENCE_KEY`
- ~5 minutes total
- Costs ~$0.50 per run

## Troubleshooting

**Integration tests fail with "fetch failed" error:**

- Verify Azure Functions are running: `curl http://localhost:7071/api/sanity`
- Start Functions: `cd javascript && npm start`
- Wait 10 seconds for Functions to fully initialize

**Integration tests fail with SQL connection error:**

```bash
docker ps                  # Verify profitforge-test-db is running on 1433
docker logs profitforge-test-db  # Check SQL Server logs
npm run db:test:down && npm run db:test:up  # Restart containers
```

**E2E tests fail with 401 Unauthorized:**

- Verify `.env.e2e` exists with valid credentials or `source ./scripts/load-e2e-env.sh`
- Check Azure Key Vault for expired secrets
- Confirm service principal has Contributor role

**E2E tests fail with missing environment variables:**

- Run `source ./scripts/load-e2e-env.sh` to load from Pulumi
- Or manually set all required variables listed above

**Tests hang indefinitely:**

- Check Application Insights for function errors
- Verify queue messages are being processed
- Increase timeout in test configuration

**Docker containers won't start:**

```bash
docker system prune -f     # Clean up old containers
npm run db:test:up        # Restart containers
docker logs profitforge-test-db  # Check for errors
```
