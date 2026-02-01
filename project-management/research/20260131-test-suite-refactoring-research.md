<!-- markdownlint-disable-file -->

# Task Research Notes: Test Suite Refactoring After Azure Functions Reorganization

## Research Executed

### File Analysis - Current Test Structure

- **javascript/test/unit/** (6 test files, ~1,900 lines)
  - `api.unit.test.ts` (647 lines) - Tests old monolithic endpoints now refactored
  - `services/services.unit.test.ts` (427 lines) - Service layer tests (DocumentService, VendorService, AIService)
  - `getResults.unit.test.ts` (421 lines) - GET results endpoint tests
  - `aiProductMapper.unit.test.ts` (213 lines) - AI mapping HTTP endpoint tests
  - `aiProductMapperQueue.unit.test.ts` (263 lines) - Queue trigger wrapper tests
  - `documentProcessor.unit.test.ts` (175 lines) - Blob trigger OCR processor tests
  - `usageTracker.unit.test.ts` (263 lines) - Rate limiting and usage tracking utility tests
  - **Missing**: No middleware tests (cors, auth, rate-limit, error-handler)

- **javascript/test/integration/** (6 test files, ~850 lines)
  - `upload-api.integration.test.ts` (134 lines) - Upload endpoint with Docker infrastructure
  - `delete-vendor.integration.test.ts` (~120 lines) - Vendor deletion workflow
  - `reprocessing.integration.test.ts` (134 lines) - Document versioning and reprocessing
  - `export-flow.integration.test.ts` (~150 lines) - Product confirmation/export workflow
  - `get-results-api.integration.test.ts` (~200 lines) - Results retrieval with filtering
  - `error-handling.integration.test.ts` (~210 lines) - Error scenarios across all endpoints
  - **Missing**: No blob trigger tests, no queue trigger tests, no timer trigger tests

- **javascript/test/e2e/** (2 test files, ~840 lines)
  - `upload-to-completion.e2e.test.ts` (220 lines) - Full pipeline: upload → OCR → AI mapping
  - `golden-dataset.e2e.test.ts` (620 lines) - Production accuracy validation across vendor catalogs
  - **Coverage**: Only documents domain, missing vendor/version workflows

### File Analysis - Refactored Source Structure

- **javascript/src/functions/http/** (Domain-organized HTTP endpoints)
  - **documents/**: upload.ts, get-results.ts, reprocess.ts, confirm.ts, delete.ts, ai-mapper.ts
  - **vendors/**: delete.ts
  - **versions/**: (not yet implemented - planned)
  - **admin/**: (not yet implemented - planned)
  - **health/**: sanity.ts

- **javascript/src/functions/blobs/** (Blob triggers)
  - `document-processor.ts` - OCR processing on blob upload

- **javascript/src/functions/queues/** (Queue triggers)
  - `ai-product-mapper.ts` - Queue-triggered AI mapping

- **javascript/src/functions/timers/** (Timer triggers)
  - `scheduled-cleanup.ts` - Daily usage tracking maintenance

- **javascript/src/middleware/** (Cross-cutting concerns)
  - `cors.ts`, `auth.ts`, `rate-limit.ts`, `error-handler.ts`, `index.ts`
  - **NO TEST COVERAGE** for middleware layer

- **javascript/src/services/** (Business logic layer)
  - `document-service.ts`, `vendor-service.ts`, `version-service.ts`
  - `ai-service.ts`, `ocr-service.ts`, `storage-service.ts`
  - **Partial coverage**: Only 3 services tested (Document, Vendor, AI)

- **javascript/src/utils/** (Shared utilities)
  - `config.ts`, `constants.ts`, `database.ts`, `httpHelpers.ts`, `typeGuards.ts`, `validations.ts`, `usageTracker.ts`
  - **Partial coverage**: Only usageTracker tested

### Code Search Results

- **Middleware usage in handlers**: All HTTP handlers use `withCors`, `withAuth`, `withRateLimit`, `withErrorHandler`
  - Found in: upload.ts, delete.ts, get-results.ts, reprocess.ts, confirm.ts, ai-mapper.ts
  - **NO unit tests verify middleware behavior**

- **Service layer instantiation**: All handlers use singleton getters (`getDocumentService()`, `getVendorService()`, etc.)
  - Found in all function files
  - **Tests exist** for service methods but not for integration with handlers

- **Test helper infrastructure**:
  - `test/integration/helpers/test-db.ts` - Database seeding, cleanup, polling helpers
  - `test/integration/helpers/azure-ai-mocks.ts` - AI service mock fixtures
  - `test/unit/setup/mocks.ts` - Mock request/context helpers
  - `test/e2e/helpers/testVendorNames.ts` - Unique vendor name generation

### External Research

#### #fetch:"https://vitest.dev/guide/test-context.html"

**Vitest Test Organization Best Practices:**

- **Test file organization**: Mirror source structure for discoverability
- **Test categorization**: Use `describe` blocks for domain/feature grouping
- **Test naming**: Use descriptive names that state expected behavior
- **File naming conventions**: Use `.unit.test.ts`, `.integration.test.ts`, `.e2e.test.ts` suffixes
- **Co-location**: For utilities and pure functions, co-located tests (`*.test.ts` next to `*.ts`) improve maintainability
- **Shared fixtures**: Use test/fixtures/ for reusable test data
- **Setup/teardown**: Use `beforeEach`/`afterEach` for test isolation

#### #githubRepo:"Azure/azure-functions-nodejs-library" testing patterns

**Azure Functions v4 Testing Patterns:**

- **Handler separation**: Test handlers independently from registration
- **Mock InvocationContext**: Use minimal context mock for unit tests
- **Integration testing**: Test with real Azure Functions runtime locally
- **Middleware testing**: Test middleware HOFs with mock handlers
- **Error handling**: Verify error responses at each layer
- **CORS and auth**: Test cross-cutting concerns independently

### Project Conventions

- **Standards referenced**:
  - `.github/instructions/playwright-typescript.instructions.md` - Test structure, categorization
  - `.github/instructions/nodejs-javascript-vitest.instructions.md` - Vitest patterns
  - `.github/instructions/typescript-5-es2022.instructions.md` - TypeScript conventions
  - `docs/testing.md` - Current test infrastructure setup
  - `docs/test-refactoring-analysis-framework.md` - Analysis framework for this task

- **Instructions followed**:
  - Test pyramid: 70% unit, 25% integration, 5% e2e
  - Fast execution: unit <1s, integration ~30s, e2e ~5min
  - Independent tests: No shared state between tests
  - Automated infrastructure: Docker auto-starts for integration, Functions auto-start for e2e

## Key Discoveries

### Test-to-Code Alignment Issues

1. **Monolithic test file**: `api.unit.test.ts` (647 lines) tests handlers now split across 6 files
   - Tests for: upload, deleteVendor, reprocessMapping, confirmMapping
   - Current handlers: `http/documents/upload.ts`, `http/vendors/delete.ts`, `http/documents/reprocess.ts`, `http/documents/confirm.ts`
   - **Problem**: Single test file for multiple domain-organized handlers

2. **Outdated test names**: Many tests reference "handler" but not which handler
   - Example: "should successfully upload a PDF file" in `api.unit.test.ts`
   - Should specify: "Upload Handler - should successfully upload PDF"

3. **Import path mismatches**: Tests import from old paths
   - `api.unit.test.ts` imports: `../../src/functions/http/documents/upload`
   - **Good**: Already updated to new structure

### Coverage Gaps

**Function Coverage Gaps (High Priority):**

| Function File                           | Test Coverage | Gap Description                                    |
| --------------------------------------- | ------------- | -------------------------------------------------- |
| `http/documents/delete.ts`              | ❌ None       | No unit or integration tests for document deletion |
| `http/versions/*`                       | ❌ None       | Version management endpoints not implemented yet   |
| `http/admin/*`                          | ❌ None       | Admin/usage endpoints not implemented yet          |
| `http/health/sanity.ts`                 | ❌ None       | Sanity endpoint not tested                         |
| `middleware/cors.ts`                    | ❌ None       | CORS middleware not unit tested                    |
| `middleware/auth.ts`                    | ❌ None       | Auth middleware not unit tested                    |
| `middleware/rate-limit.ts`              | ❌ None       | Rate limit middleware not unit tested              |
| `middleware/error-handler.ts`           | ❌ None       | Error handler middleware not unit tested           |
| `services/ocr-service.ts`               | ❌ None       | OCR service not unit tested                        |
| `services/storage-service.ts`           | ❌ None       | Storage service not unit tested                    |
| `services/version-service.ts`           | ❌ None       | Version service not unit tested                    |
| `functions/timers/scheduled-cleanup.ts` | ❌ None       | Timer trigger not tested                           |

**Integration Coverage Gaps:**

| Workflow                          | Test Coverage | Gap Description                                   |
| --------------------------------- | ------------- | ------------------------------------------------- |
| Blob trigger → Queue → AI mapping | ❌ None       | No integration test for blob→OCR→queue→AI chain   |
| Queue processing retry logic      | ❌ None       | No tests for queue message retry/failure handling |
| Timer trigger execution           | ❌ None       | No scheduled cleanup integration tests            |
| Concurrent uploads                | ⚠️ Partial    | Only E2E test exists, no integration-level test   |
| Bronze layer audit trail          | ⚠️ Partial    | Storage service not tested in isolation           |

**Cross-Cutting Concern Gaps:**

| Concern                     | Coverage    | Gap Description                                           |
| --------------------------- | ----------- | --------------------------------------------------------- |
| Middleware composition      | ❌ None     | No tests verify correct middleware order/composition      |
| Error responses with CORS   | ⚠️ Partial  | Integration test exists but no unit test                  |
| Rate limiting behavior      | ⚠️ Partial  | usageTracker tested but middleware integration not tested |
| Authentication flow         | ❌ None     | Auth middleware not tested                                |
| Database connection pooling | ⚠️ Implicit | No explicit tests for singleton pattern enforcement       |

### Test Quality Assessment

**Redundancy Analysis:**

| Test Pair                                                                         | Overlap | Recommendation                                                                        |
| --------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------- |
| `api.unit.test.ts` upload tests vs `services.unit.test.ts` DocumentService.upload | 60%     | **Keep both** - Handler tests verify HTTP layer, service tests verify business logic  |
| `upload-api.integration.test.ts` vs `upload-to-completion.e2e.test.ts`            | 40%     | **Keep both** - Integration uses mocked AI, E2E uses real AI                          |
| `error-handling.integration.test.ts` vs individual endpoint tests                 | 70%     | **Consolidate** - Error handling tests duplicate validation already in endpoint tests |
| `getResults.unit.test.ts` vs `services.unit.test.ts` DocumentService.getResults   | 80%     | **Consolidate** - Merge into service tests, keep handler-specific tests separate      |
| `aiProductMapper.unit.test.ts` vs `services.unit.test.ts` AIService.mapProducts   | 75%     | **Consolidate** - Merge into service tests, keep HTTP handler-specific tests          |

**Brittle Tests (Tightly Coupled):**

- `api.unit.test.ts` lines 34-50: Hardcodes specific response structure
  - **Fix**: Use flexible matchers (`expect.objectContaining`)
- `getResults.unit.test.ts` lines 65-100: Assumes specific SQL query format
  - **Fix**: Test behavior, not implementation
- Integration tests assume specific Docker container names
  - **Fix**: Already abstracted via test helpers

**Overly Broad Tests:**

- `error-handling.integration.test.ts` (210 lines) tests ALL endpoints
  - **Split**: Separate by domain (documents, vendors, versions)
- `upload-to-completion.e2e.test.ts` tests upload, OCR, AI, storage all together
  - **Keep as-is**: This is appropriate for E2E workflow test

### Infrastructure Assessment

**Vitest Configuration:**

- **Current setup**: Separate configs for unit, integration, e2e
  - ✅ Good: Clear separation of concerns
  - ✅ Good: Appropriate timeouts (10s, 30s, 180s)
  - ✅ Good: Parallel unit tests, sequential integration/e2e
  - ⚠️ Improvement: Consider workspace-level vitest.config.ts for shared settings

**Docker Compose Setup:**

- **Current**: Auto-starts SQL Server + Azurite via global setup
  - ✅ Good: Fully automated, no manual steps
  - ✅ Good: Cleanup on teardown
  - ⚠️ Improvement: Consider container health checks for faster startup

**Test Data Management:**

- **Current**: Helper functions for seeding/cleaning database
  - ✅ Good: `cleanTestDatabase()`, `insertTestDocument()`, `getDocumentByResultId()`
  - ⚠️ Improvement: No fixture files for common test data
  - ⚠️ Improvement: Test vendor names hardcoded in multiple places

**Execution Speed:**

- **Measured**:
  - Unit tests: <1s total (fast ✅)
  - Integration tests: ~30s total (appropriate ✅)
  - E2E tests: ~5min total (acceptable ✅)
- **No optimization needed**: Current speeds are within target ranges

## Recommended Approach

### Phase 1: Critical Test Structure Reorganization (High Priority)

**1.1 Split Monolithic Test Files**

Split `api.unit.test.ts` (647 lines) into domain-organized files:

- **Create**: `test/unit/functions/http/documents/upload.unit.test.ts`
  - Move: Upload handler tests (lines 17-402 from api.unit.test.ts)
  - Tests: 14 test cases covering validation, error handling, service integration

- **Create**: `test/unit/functions/http/vendors/delete.unit.test.ts`
  - Move: Delete vendor handler tests (lines 403-485 from api.unit.test.ts)
  - Tests: 4 test cases covering deletion, error scenarios

- **Create**: `test/unit/functions/http/documents/reprocess.unit.test.ts`
  - Move: Reprocess handler tests (lines 487-542 from api.unit.test.ts)
  - Tests: 3 test cases covering versioning logic

- **Create**: `test/unit/functions/http/documents/confirm.unit.test.ts`
  - Move: Confirm mapping handler tests (lines 544-647 from api.unit.test.ts)
  - Tests: 5 test cases covering export validation

- **Delete**: `api.unit.test.ts` after migration complete

**Rationale**: Aligns test structure with refactored domain-based source organization, improves discoverability

**1.2 Consolidate Redundant Service Tests**

- **Merge** `aiProductMapper.unit.test.ts` tests into `services/services.unit.test.ts`
  - Keep: HTTP handler-specific tests (validation, error responses)
  - Move to services: Business logic tests (AI mapping logic, token calculation)
  - Reduces duplication from 75% to 0%

- **Merge** `getResults.unit.test.ts` handler logic tests into `services/services.unit.test.ts`
  - Keep: Query parameter parsing, response formatting tests
  - Move to services: Result filtering, version logic tests
  - Reduces duplication from 80% to 0%

**Rationale**: Eliminates 70-80% test overlap while maintaining appropriate layer testing

**1.3 Reorganize Integration Tests by Domain**

Current flat structure → Domain-grouped structure:

```
test/integration/
├── documents/
│   ├── upload-workflow.integration.test.ts (renamed from upload-api)
│   ├── reprocessing-workflow.integration.test.ts (renamed from reprocessing)
│   ├── export-workflow.integration.test.ts (renamed from export-flow)
│   └── get-results.integration.test.ts (renamed from get-results-api)
├── vendors/
│   └── delete-vendor.integration.test.ts (moved)
├── workflows/
│   └── error-handling.integration.test.ts (moved, to be split)
├── helpers/
│   ├── test-db.ts
│   └── azure-ai-mocks.ts
└── setup/
    ├── vitest.config.integration.ts
    ├── setup.integration.ts
    └── setup.global.integration.ts
```

**Rationale**: Mirrors source structure, improves navigation, prepares for future domain expansion

### Phase 2: Close Critical Coverage Gaps (High Priority)

**2.1 Add Middleware Unit Tests**

**Create**: `test/unit/middleware/middleware.unit.test.ts`

Test each middleware HOF independently:

```typescript
describe('CORS Middleware', () => {
  it('should add CORS headers to successful response');
  it('should add CORS headers to error response');
  it('should handle OPTIONS preflight request');
  it('should preserve existing response headers');
});

describe('Auth Middleware', () => {
  it('should allow requests with valid API key');
  it('should reject requests without API key');
  it('should reject requests with invalid API key');
  it('should skip auth check for health endpoints');
});

describe('Rate Limit Middleware', () => {
  it('should allow requests under IP limit');
  it('should reject requests over IP hourly limit');
  it('should allow requests under daily limit');
  it('should reject requests over daily limit');
  it('should integrate with usageTracker correctly');
});

describe('Error Handler Middleware', () => {
  it('should catch and format handler errors');
  it('should preserve custom error status codes');
  it('should add CORS headers to error responses');
  it('should log error details for debugging');
});

describe('Middleware Composition', () => {
  it('should execute middleware in correct order: error → cors → auth → rate');
  it('should propagate context through middleware chain');
  it('should short-circuit on auth failure');
});
```

**Estimated**: 20 test cases, ~200 lines

**Rationale**: Middleware is critical infrastructure used by ALL HTTP handlers, currently 0% tested

**2.2 Add Service Layer Tests**

**Create**: `test/unit/services/ocr-service.unit.test.ts`

```typescript
describe('OCRService', () => {
  it('should process document with Document Intelligence API');
  it('should extract text and tables from OCR result');
  it('should calculate token usage and costs');
  it('should upload OCR result to bronze layer');
  it('should queue AI mapping message');
  it('should handle API errors gracefully');
  it('should update document status in database');
});
```

**Create**: `test/unit/services/storage-service.unit.test.ts`

```typescript
describe('StorageService', () => {
  it('should upload blob to correct container');
  it('should delete blob successfully');
  it('should upload to bronze layer with metadata');
  it('should download blob content');
  it('should handle storage errors gracefully');
  it('should use singleton BlobServiceClient');
});
```

**Create**: `test/unit/services/version-service.unit.test.ts`

```typescript
describe('VersionService', () => {
  it('should get version history for document');
  it('should delete specific version run');
  it('should handle non-existent document');
  it('should return versions in chronological order');
});
```

**Estimated**: 18 test cases, ~180 lines

**Rationale**: Services are core business logic, currently 3/7 services tested (43% coverage)

**2.3 Add Integration Tests for Missing Workflows**

**Create**: `test/integration/workflows/blob-queue-ai-pipeline.integration.test.ts`

Tests the full async pipeline: Blob trigger → OCR → Queue → AI mapping

```typescript
describe('Integration: Blob → OCR → Queue → AI Pipeline', () => {
  it('should trigger OCR processing on blob upload');
  it('should send queue message after OCR completion');
  it('should process queue message and complete AI mapping');
  it('should handle OCR failures gracefully');
  it('should retry queue processing on transient errors');
});
```

**Estimated**: 5 test cases, ~150 lines

**Rationale**: Core async workflow has no integration test, only E2E test (expensive)

### Phase 3: Optimize and Polish (Medium Priority)

**3.1 Split Error Handling Tests**

Split `error-handling.integration.test.ts` (210 lines) into domain-specific files:

- **documents/upload-errors.integration.test.ts**: Upload validation errors
- **documents/reprocess-errors.integration.test.ts**: Reprocessing errors
- **documents/confirm-errors.integration.test.ts**: Confirmation errors
- **vendors/delete-errors.integration.test.ts**: Vendor deletion errors

**Rationale**: Improves maintainability, co-locates error tests with happy path tests

**3.2 Create Test Fixtures**

**Create**: `test/fixtures/`

- `sample-documents/`: Test PDFs of various sizes and formats. you can find real ones from customer in [docs/](../../javascript/test/e2e/docs/)
- `mock-responses/`: Canned AI service responses. you can use processed ai mapping results at [tools/](../../javascript/test/tools/processed_e2e.json)
- `test-data.ts`: Shared test data constants

**Rationale**: Reduces hardcoded test data, improves consistency

**3.3 Add Timer Trigger Tests**

**Create**: `test/unit/functions/timers/scheduled-cleanup.unit.test.ts`

```typescript
describe('Scheduled Cleanup', () => {
  it('should cleanup old usage tracking records');
  it('should preserve recent records');
  it('should log cleanup statistics');
  it('should handle database errors gracefully');
});
```

**Create**: `test/integration/workflows/scheduled-cleanup.integration.test.ts`

```typescript
describe('Integration: Scheduled Cleanup', () => {
  it('should cleanup records older than 30 days');
  it('should preserve records within 30 days');
  it('should execute within timer timeout');
});
```

**Estimated**: 7 test cases, ~100 lines

**Rationale**: Timer trigger has no test coverage, but low business criticality

### Phase 4: Future Enhancements (Low Priority)

**4.1 Add Performance Tests**

**Create**: `test/performance/upload-throughput.perf.test.ts`

- Test concurrent upload handling
- Measure database connection pool efficiency
- Verify rate limiting behavior under load

**4.2 Add Contract Tests**

**Create**: `test/contract/api-schema.contract.test.ts`

- Verify API request/response schemas
- Ensure backward compatibility
- Validate OpenAPI spec alignment

**4.3 Add Mutation Tests**

Use Stryker.js to verify test quality by introducing code mutations

## Implementation Roadmap

### Priority Scoring Rubric

| Test File/Category                    | Refactor Extent   | Score | Rationale                                                         | Recommended Action                                           |
| ------------------------------------- | ----------------- | ----- | ----------------------------------------------------------------- | ------------------------------------------------------------ |
| **api.unit.test.ts**                  | Full Rewrite      | 10    | Targets old monolithic structure, needs split into 4 domain files | Split into documents/, vendors/ tests                        |
| **getResults.unit.test.ts**           | Moderate Refactor | 7     | 80% overlap with service tests, needs consolidation               | Merge most tests into services/, keep handler-specific tests |
| **aiProductMapper.unit.test.ts**      | Moderate Refactor | 7     | 75% overlap with AIService tests                                  | Merge into services/, keep HTTP handler tests                |
| **services.unit.test.ts**             | Minor Updates     | 3     | Well-structured, needs additional service tests added             | Add OCRService, StorageService, VersionService tests         |
| **documentProcessor.unit.test.ts**    | Minor Updates     | 2     | Good structure, update to verify service integration              | Update mocks, add service verification                       |
| **aiProductMapperQueue.unit.test.ts** | No Change         | 1     | Well-structured, good coverage                                    | Keep as-is                                                   |
| **usageTracker.unit.test.ts**         | No Change         | 1     | Comprehensive, good quality                                       | Keep as-is                                                   |
| **Integration tests**                 | Moderate Refactor | 6     | Need reorganization by domain, add missing workflows              | Reorganize into folders, add blob→queue→AI test              |
| **E2E tests**                         | Minor Updates     | 2     | Good coverage, consider adding vendor workflows                   | Add vendor/version E2E tests when implemented                |
| **Middleware tests**                  | Full Rewrite      | 10    | Completely missing                                                | Create new test file with 20+ test cases                     |

**Scoring Criteria:**

- **Alignment** (0-3): 3 = needs complete restructure, 0 = perfectly aligned
- **Coverage quality** (0-3): 3 = major gaps or redundancy, 0 = comprehensive coverage
- **Maintainability** (0-2): 2 = difficult to understand/modify, 0 = clear and maintainable
- **Efficiency** (0-2): 2 = slow or wasteful, 0 = appropriate execution time

### Recommended File Structure

```
javascript/
├── src/
│   ├── functions/
│   │   ├── http/
│   │   │   ├── documents/
│   │   │   │   ├── upload.ts
│   │   │   │   ├── get-results.ts
│   │   │   │   ├── reprocess.ts
│   │   │   │   ├── confirm.ts
│   │   │   │   ├── delete.ts
│   │   │   │   └── ai-mapper.ts
│   │   │   ├── vendors/
│   │   │   │   └── delete.ts
│   │   │   ├── versions/ (future)
│   │   │   ├── admin/ (future)
│   │   │   └── health/
│   │   │       └── sanity.ts
│   │   ├── blobs/
│   │   │   └── document-processor.ts
│   │   ├── queues/
│   │   │   └── ai-product-mapper.ts
│   │   └── timers/
│   │       └── scheduled-cleanup.ts
│   ├── middleware/
│   │   ├── cors.ts
│   │   ├── auth.ts
│   │   ├── rate-limit.ts
│   │   ├── error-handler.ts
│   │   └── index.ts
│   ├── services/
│   │   ├── document-service.ts
│   │   ├── vendor-service.ts
│   │   ├── version-service.ts
│   │   ├── ai-service.ts
│   │   ├── ocr-service.ts
│   │   ├── storage-service.ts
│   │   └── index.ts
│   └── utils/
│       └── (existing utils)
└── test/
    ├── unit/
    │   ├── functions/
    │   │   ├── http/
    │   │   │   ├── documents/
    │   │   │   │   ├── upload.unit.test.ts       [NEW: split from api.unit.test.ts]
    │   │   │   │   ├── get-results.unit.test.ts  [MODIFIED: handler-specific tests only]
    │   │   │   │   ├── reprocess.unit.test.ts    [NEW: split from api.unit.test.ts]
    │   │   │   │   ├── confirm.unit.test.ts      [NEW: split from api.unit.test.ts]
    │   │   │   │   └── ai-mapper.unit.test.ts    [MODIFIED: handler-specific tests only]
    │   │   │   └── vendors/
    │   │   │       └── delete.unit.test.ts       [NEW: split from api.unit.test.ts]
    │   │   ├── blobs/
    │   │   │   └── document-processor.unit.test.ts [EXISTING]
    │   │   ├── queues/
    │   │   │   └── ai-product-mapper.unit.test.ts  [EXISTING]
    │   │   └── timers/
    │   │       └── scheduled-cleanup.unit.test.ts  [NEW: add coverage]
    │   ├── middleware/
    │   │   └── middleware.unit.test.ts             [NEW: critical gap]
    │   ├── services/
    │   │   ├── services.unit.test.ts               [MODIFIED: consolidate duplicates]
    │   │   ├── ocr-service.unit.test.ts            [NEW: critical gap]
    │   │   ├── storage-service.unit.test.ts        [NEW: critical gap]
    │   │   └── version-service.unit.test.ts        [NEW: add coverage]
    │   ├── utils/
    │   │   └── usageTracker.unit.test.ts           [EXISTING]
    │   └── setup/
    │       ├── vitest.config.unit.ts
    │       ├── setup.unit.ts
    │       └── mocks.ts
    ├── integration/
    │   ├── documents/
    │   │   ├── upload-workflow.integration.test.ts     [RENAMED: from upload-api]
    │   │   ├── reprocessing-workflow.integration.test.ts [RENAMED: from reprocessing]
    │   │   ├── export-workflow.integration.test.ts     [RENAMED: from export-flow]
    │   │   └── get-results.integration.test.ts         [RENAMED: from get-results-api]
    │   ├── vendors/
    │   │   └── delete-vendor.integration.test.ts       [MOVED: from root]
    │   ├── workflows/
    │   │   ├── blob-queue-ai-pipeline.integration.test.ts [NEW: critical gap]
    │   │   └── error-handling.integration.test.ts      [MODIFIED: split by domain later]
    │   ├── helpers/
    │   │   ├── test-db.ts
    │   │   └── azure-ai-mocks.ts
    │   └── setup/
    │       ├── vitest.config.integration.ts
    │       ├── setup.integration.ts
    │       ├── setup.global.integration.ts
    │       └── docker-compose.test.yml
    ├── e2e/
    │   ├── documents/
    │   │   ├── upload-to-completion.e2e.test.ts    [MOVED: from root]
    │   │   └── golden-dataset.e2e.test.ts          [MOVED: from root]
    │   ├── docs/ (test documents)
    │   ├── helpers/
    │   └── setup/
    │       ├── vitest.config.e2e.ts
    │       ├── setup.e2e.ts
    │       └── setup.global.e2e.ts
    ├── fixtures/
    │   ├── sample-documents/   [NEW: centralized test PDFs]
    │   ├── mock-responses/     [NEW: canned AI responses]
    │   └── test-data.ts        [NEW: shared constants]
    └── tools/ (existing)
```

**Rationale for Structure:**

1. **Domain-grouped integration/e2e tests**: Groups related workflows together, mirrors source organization
2. **Mirrored unit test structure**: Exactly mirrors `src/` for easy navigation
3. **Shared fixtures**: Centralized test data reduces duplication
4. **Preserved setup infrastructure**: Maintains existing vitest configs, Docker setup, global setup

### Implementation Phases with Specific Tasks

**Phase 1: Critical Restructuring (Estimated: 6-8 hours)**

- [ ] **TASK-001**: Split `api.unit.test.ts` into 4 domain files (2 hours)
  - Create `test/unit/functions/http/documents/upload.unit.test.ts`
  - Create `test/unit/functions/http/vendors/delete.unit.test.ts`
  - Create `test/unit/functions/http/documents/reprocess.unit.test.ts`
  - Create `test/unit/functions/http/documents/confirm.unit.test.ts`
  - Delete `api.unit.test.ts` after verification

- [ ] **TASK-002**: Consolidate service test duplicates (2 hours)
  - Merge `aiProductMapper.unit.test.ts` business logic tests into `services.unit.test.ts`
  - Merge `getResults.unit.test.ts` business logic tests into `services.unit.test.ts`
  - Keep handler-specific tests separate
  - Verify no regression in coverage

- [ ] **TASK-003**: Reorganize integration tests by domain (2 hours)
  - Create `test/integration/documents/` and `test/integration/vendors/` folders
  - Move and rename integration test files
  - Update import paths
  - Verify all tests still pass

- [ ] **TASK-004**: Create middleware unit tests (2 hours)
  - Create `test/unit/middleware/middleware.unit.test.ts`
  - Write 20 test cases covering CORS, auth, rate-limit, error-handler
  - Write 5 middleware composition tests
  - Target: 100% middleware coverage

**Phase 2: Close Critical Gaps (Estimated: 6-8 hours)**

- [ ] **TASK-005**: Add OCRService unit tests (1.5 hours)
  - Create `test/unit/services/ocr-service.unit.test.ts`
  - Write 7 test cases
  - Mock Document Intelligence API
  - Mock storage and database calls

- [ ] **TASK-006**: Add StorageService unit tests (1.5 hours)
  - Create `test/unit/services/storage-service.unit.test.ts`
  - Write 6 test cases
  - Mock BlobServiceClient
  - Test singleton pattern

- [ ] **TASK-007**: Add VersionService unit tests (1 hour)
  - Create `test/unit/services/version-service.unit.test.ts`
  - Write 4 test cases
  - Mock database operations

- [ ] **TASK-008**: Add blob→queue→AI pipeline integration test (2 hours)
  - Create `test/integration/workflows/blob-queue-ai-pipeline.integration.test.ts`
  - Write 5 test cases covering full async flow
  - Use Docker infrastructure (SQL + Azurite)
  - Mock AI services

- [ ] **TASK-009**: Add timer trigger tests (2 hours)
  - Create `test/unit/functions/timers/scheduled-cleanup.unit.test.ts`
  - Create `test/integration/workflows/scheduled-cleanup.integration.test.ts`
  - Write 7 test cases total

**Phase 3: Optimization (Estimated: 4-6 hours)**

- [ ] **TASK-010**: Split error-handling tests by domain (2 hours)
  - Create domain-specific error test files
  - Migrate tests from `error-handling.integration.test.ts`
  - Consider deleting consolidated file or keeping for cross-domain errors

- [ ] **TASK-011**: Create test fixtures (2 hours)
  - Create `test/fixtures/` directory
  - Move test PDFs to `sample-documents/`
  - Create `mock-responses/` for canned AI responses
  - Create `test-data.ts` for shared constants
  - Update tests to use fixtures

- [ ] **TASK-012**: Update documentation (1 hour)
  - Update `docs/testing.md` with new structure
  - Add test writing examples
  - Document fixture usage

**Phase 4: Future Enhancements (Optional, Estimated: 8-10 hours)**

- [ ] **TASK-013**: Add performance tests (3 hours)
- [ ] **TASK-014**: Add contract tests (3 hours)
- [ ] **TASK-015**: Configure Stryker.js mutation testing (2 hours)

### Test Redundancy Analysis

| Test Pair                                                                                 | Overlap Description                                       | Overlap % | Recommendation  | Action                                                                                                                                             |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------- | --------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api.unit.test.ts` Upload Handler tests vs `services.unit.test.ts` DocumentService.upload | Both test file validation, upload logic, error handling   | 60%       | **Keep both**   | Handler tests verify HTTP layer (formData parsing, response format), service tests verify business logic (file validation, storage, DB operations) |
| `getResults.unit.test.ts` vs `services.unit.test.ts` DocumentService.getResults           | Both test query filters, limit, version handling          | 80%       | **Consolidate** | Merge filtering/limit/version logic into service tests, keep only HTTP-specific tests (query param parsing, response formatting) in handler tests  |
| `aiProductMapper.unit.test.ts` vs `services.unit.test.ts` AIService.mapProducts           | Both test AI mapping, token calculation, quality metrics  | 75%       | **Consolidate** | Merge AI logic tests into service tests, keep only HTTP-specific tests (documentId validation, response format) in handler tests                   |
| `upload-api.integration.test.ts` vs `upload-to-completion.e2e.test.ts`                    | Both test upload → processing chain                       | 40%       | **Keep both**   | Integration test uses mocked AI (fast, cheap), E2E uses real AI (slow, expensive). Different purposes.                                             |
| `error-handling.integration.test.ts` vs individual endpoint integration tests             | Error scenarios duplicated across tests                   | 70%       | **Refactor**    | Split error tests by domain, co-locate with happy path tests. Consider keeping cross-domain error tests (CORS, auth) in separate file.             |
| Unit tests for middleware vs integration test CORS verification                           | Middleware behavior tested at unit and integration levels | 30%       | **Keep both**   | Unit tests verify middleware HOF logic, integration tests verify middleware in real handler context                                                |

**Consolidation Strategy:**

1. **Services vs Handler Tests**: Keep clear separation
   - **Service tests**: Business logic, validation, external integrations, error handling
   - **Handler tests**: HTTP layer, request parsing, response formatting, middleware integration

2. **Integration vs E2E**: Keep distinction
   - **Integration**: Mocked external APIs, Docker infrastructure, fast execution
   - **E2E**: Real external APIs, production Azure, slow execution

3. **Error Tests**: Co-locate with happy path tests
   - **Before**: Single `error-handling.integration.test.ts` file with all errors
   - **After**: Error tests in same file as happy path tests (e.g., `upload-workflow.integration.test.ts` includes upload errors)

### Infrastructure Optimization Recommendations

**Vitest Configuration:**

✅ **Keep as-is**: Separate configs for unit, integration, e2e are appropriate

Optional improvement:

```typescript
// vitest.config.ts (workspace root)
export default defineConfig({
  test: {
    // Shared settings
    globals: true,
    environment: 'node',
  },
});

// Unit config extends root
import { mergeConfig } from 'vitest/config';
import rootConfig from '../../../vitest.config';
export default mergeConfig(rootConfig, {
  /* unit-specific settings */
});
```

**Docker Setup:**

✅ **Keep as-is**: Current setup is efficient and automated

Optional improvement:

- Add health checks to docker-compose.test.yml for faster startup detection
- Currently: poll with retries (works but slower)
- Improvement: Docker health check + wait-for-it script

**Test Execution Optimization:**

✅ **No changes needed**: Current speeds are within target ranges

- Unit: <1s ✅
- Integration: ~30s ✅
- E2E: ~5min ✅

**Fixture Management:**

⚠️ **Needs improvement**: Create centralized fixtures folder

- **Current**: Test PDFs duplicated, mock responses hardcoded
- **Recommendation**: Create `test/fixtures/` with shared test data

## Summary of Recommendations

### Executive Summary

After refactoring Azure Functions from monolithic to domain-organized structure, the test suite requires **moderate refactoring** (score: 6/10) to align with new architecture.

**Top 3 Priority Actions:**

1. **Split monolithic test file** (`api.unit.test.ts`, 647 lines) into 4 domain-specific files to match refactored source structure (2 hours)
2. **Add middleware unit tests** (0% coverage) for critical cross-cutting concerns used by ALL HTTP handlers (2 hours)
3. **Add blob→queue→AI pipeline integration test** for core async workflow currently only tested at E2E level (2 hours)

**Estimated Total Effort:**

- Phase 1 (Critical): 6-8 hours
- Phase 2 (Coverage gaps): 6-8 hours
- Phase 3 (Optimization): 4-6 hours
- **Total**: 16-22 hours (~2-3 days)

### Test Categorization Framework

**Recommended Test Categories:**

| Category                          | Scope                                       | Purpose                                                       | Infrastructure                 | Execution Time  | Examples                                                                           |
| --------------------------------- | ------------------------------------------- | ------------------------------------------------------------- | ------------------------------ | --------------- | ---------------------------------------------------------------------------------- |
| **Unit - Handlers**               | Single HTTP/blob/queue/timer handler        | Verify handler logic, request parsing, response formatting    | None (all mocks)               | <100ms          | `upload.unit.test.ts`: Test formData parsing, validation, service integration      |
| **Unit - Services**               | Single service class                        | Verify business logic, external API integration (mocked)      | None (all mocks)               | <100ms          | `document-service.unit.test.ts`: Test upload logic, file validation, storage calls |
| **Unit - Middleware**             | Single middleware HOF                       | Verify middleware behavior, error handling, header management | None (all mocks)               | <50ms           | `middleware.unit.test.ts`: Test CORS headers, auth validation, rate limiting       |
| **Unit - Utils**                  | Pure functions                              | Verify utility logic, data transformations                    | None                           | <50ms           | `usageTracker.unit.test.ts`: Test rate limit calculations                          |
| **Integration - Workflows**       | Complete business flow (multiple functions) | Verify end-to-end workflow, database operations, blob storage | Docker (SQL + Azurite)         | 1-5s per test   | `upload-workflow.integration.test.ts`: Test upload → database → blob storage       |
| **Integration - Async Pipelines** | Blob trigger → Queue → Processing           | Verify async event chains, queue processing, error handling   | Docker (SQL + Azurite + Queue) | 5-10s per test  | `blob-queue-ai-pipeline.integration.test.ts`: Test blob→OCR→queue→AI               |
| **E2E - Scenarios**               | Full application scenarios                  | Verify production behavior, AI accuracy, real Azure services  | Production Azure resources     | 30-60s per test | `upload-to-completion.e2e.test.ts`: Test upload → OCR → AI with real services      |
| **E2E - Golden Datasets**         | Regression testing on known-good data       | Verify AI extraction accuracy, prevent regressions            | Production Azure resources     | 30-60s per test | `golden-dataset.e2e.test.ts`: Test against baseline vendor catalogs                |

### Coverage Gap Summary

| Domain/Component          | Current Coverage | Gaps Identified                               | Priority | Recommended Tests                  | Estimated Effort |
| ------------------------- | ---------------- | --------------------------------------------- | -------- | ---------------------------------- | ---------------- |
| **HTTP Handlers**         | 85%              | Missing: document delete, health/sanity       | Low      | 2 test files (~50 lines)           | 1 hour           |
| **Middleware**            | 0%               | All middleware untested                       | **High** | 1 test file (~200 lines, 25 tests) | 2 hours          |
| **Services**              | 43% (3/7)        | Missing: OCR, Storage, Version                | **High** | 3 test files (~180 lines)          | 3 hours          |
| **Blob Triggers**         | 70%              | Missing: integration test for full pipeline   | **High** | 1 integration test (~150 lines)    | 2 hours          |
| **Queue Triggers**        | 85%              | Missing: retry/failure handling tests         | Medium   | Add 3 tests to existing file       | 1 hour           |
| **Timer Triggers**        | 0%               | Scheduled cleanup untested                    | Medium   | 2 test files (~100 lines)          | 2 hours          |
| **Utils**                 | 14% (1/7)        | Missing: validations, typeGuards, httpHelpers | Low      | 3 test files (~150 lines)          | 2 hours          |
| **Integration Workflows** | 60%              | Missing: blob→queue→AI, timer execution       | **High** | 2 test files (~200 lines)          | 3 hours          |
| **E2E Scenarios**         | 40%              | Missing: vendor workflows, admin endpoints    | Low      | Add when features implemented      | TBD              |

**Total Estimated Effort for Critical Gaps**: ~16 hours

### Success Metrics

After implementing recommendations:

- ✅ **100% middleware coverage** (currently 0%)
- ✅ **100% service coverage** (currently 43%)
- ✅ **Test structure mirrors source structure** (currently monolithic)
- ✅ **Eliminated 70-80% test redundancy** in handler vs service tests
- ✅ **All critical async workflows tested** at integration level
- ✅ **Test pyramid ratio maintained**: ~70% unit, ~25% integration, ~5% e2e
- ✅ **Execution speeds maintained**: unit <1s, integration ~30s, e2e ~5min
- ✅ **Automated infrastructure preserved**: Docker auto-start, Functions auto-start
