# Test Quick Reference

## Commands

```bash
npm test                      # Unit tests
npm run test:integration      # Integration tests (requires Docker)
npm run test:e2e              # E2E tests (requires Azure)
npm run test:watch            # Unit tests in watch mode
```

## Local Setup

### Integration Tests

1. `npm run test:integration`

**Connection strings hardcoded in `test/config.ts` - no `.env` needed.**

> [!WARNING]
> If SQL password changes:
>
> - Update `SA_PASSWORD` in `integration/setup/docker-compose.test.yml`
> - Update `DOCKER_SQL_CONNECTION_STRING` in `test/config.ts`

### E2E Tests

1. Copy `.env.e2e.example` to `.env.e2e`
2. Add real Azure credentials
3. `npm run test:e2e`

**Required env vars:**

- `SQL_CONNECTION_STRING`
- `STORAGE_CONNECTION_STRING`
- `AI_PROJECT_ENDPOINT`
- `AI_PROJECT_KEY`
- `DOCUMENT_INTELLIGENCE_ENDPOINT`
- `DOCUMENT_INTELLIGENCE_KEY`

## Test Structure

```
test/
├── unit/                         # Unit tests
│   ├── functions/                # Azure Functions tests (mirrors src/functions/)
│   │   ├── http/                 # HTTP trigger tests
│   │   │   ├── documents/        # Document endpoint tests
│   │   │   └── vendors/          # Vendor endpoint tests
│   │   ├── blobs/                # Blob trigger tests
│   │   ├── queues/               # Queue trigger tests
│   │   └── timers/               # Timer trigger tests
│   ├── services/                 # Service layer tests
│   ├── middleware/               # Middleware tests
│   └── setup/                    # Unit test setup
├── integration/                  # Integration tests
│   ├── documents/                # Document workflow tests
│   ├── vendors/                  # Vendor workflow tests
│   ├── workflows/                # Cross-domain workflow tests
│   ├── helpers/                  # Test helpers
│   │   ├── test-db.ts           # Database helpers
│   │   └── azure-ai-mocks.ts    # Mock AI responses
│   └── setup/                    # Global setup, Docker config
│       ├── docker-compose.test.yml
│       └── setup.global.integration.ts
├── e2e/                          # E2E tests
│   ├── setup/                    # Global setup
│   │   └── setup.global.e2e.ts
│   └── *.e2e.test.ts             # Test files
├── fixtures/                     # Shared test data
│   ├── test-data.ts             # Shared constants
│   ├── mock-responses/          # Mock API responses
│   │   └── ai-responses.ts      # AI and OCR mocks
│   ├── sample-documents/        # Sample PDFs, Excel files
│   └── README.md                # Fixture documentation
├── tools/                        # Test utilities
└── config.ts                    # Test configuration
```

## Vitest Configs

- `vitest.unit.config.ts` - Unit tests
- `vitest.integration.config.ts` - Integration tests
- `vitest.e2e.config.ts` - E2E tests

See [Testing Guide](../../docs/testing.md) for detailed information.
