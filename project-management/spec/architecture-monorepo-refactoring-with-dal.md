---
title: Monorepo Architecture Refactoring with Data Access Layer
version: 1.0
date_created: 2026-01-28
last_updated: 2026-01-28
owner: ProfitForge AI Team
tags: [architecture, refactoring, monorepo, data-access-layer, azure-functions, typescript]
---

# Introduction

This specification defines the architectural refactoring of the ProfitForge AI document processing system from a single-package structure to an npm workspaces-based monorepo with a dedicated Data Access Layer (DAL). The refactoring addresses technical debt from embedded SQL queries, improves code reusability, enhances testability, and establishes clear separation of concerns between business logic and data access.

## 1. Purpose & Scope

### Purpose

Transform the current monolithic JavaScript package into a modular monorepo structure with:

- **Shared package**: Reusable utilities and Data Access Layer for all database, blob, and queue operations
- **Core package**: Azure Functions runtime code (HTTP triggers, blob triggers, queue processors)
- **Infrastructure**: Pulumi definitions (remains at root, unchanged)
- **Co-located tests**: Unit, integration, and E2E tests alongside their respective packages

### Scope

**In Scope:**

- Restructure project into npm workspaces monorepo
- Create Data Access Layer (DAL) for SQL database, blob storage, and queue operations
- Migrate existing functions to use DAL instead of embedded SQL
- Reorganize tests to co-locate with packages
- Update build, test, and deployment configurations
- Maintain backward compatibility with existing Azure infrastructure

**Out of Scope:**

- Changes to Pulumi infrastructure code or Azure resources
- Changes to AI/ML models or prompts
- API contract changes (endpoints remain unchanged)
- Database schema modifications
- Performance optimization (separate effort)

### Intended Audience

- Development team implementing the refactoring
- DevOps engineers updating CI/CD pipelines
- Future developers maintaining the codebase
- AI agents executing implementation tasks

### Assumptions

- Node.js 20+ and npm workspaces are supported
- Existing Azure infrastructure remains unchanged
- All current tests pass before refactoring begins
- Team has capacity for ~1-2 week phased migration

## 2. Definitions

| Term                   | Definition                                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| **DAL**                | Data Access Layer - Abstraction layer for all data storage operations (database, blobs, queues)       |
| **Monorepo**           | Single repository containing multiple related packages with shared dependencies                       |
| **npm workspaces**     | Native npm feature for managing multiple packages within a single repository                          |
| **Co-located tests**   | Test files organized alongside source code in the same package structure                              |
| **Embedded SQL**       | SQL query strings written directly within application functions (anti-pattern)                        |
| **VVOCR Schema**       | Vendor Vault OCR database schema with tables: `document_processing_results`, `vendor_products`        |
| **Bronze Layer**       | Data retention strategy where all raw/processed data is preserved for audit trails                    |
| **Reprocessing**       | Creating independent processing results with different OCR/AI configurations for the same source file |
| **Repository Pattern** | Design pattern that encapsulates data access logic behind interfaces                                  |

## 3. Requirements, Constraints & Guidelines

### Functional Requirements

- **REQ-001**: The system SHALL maintain all existing API endpoints without breaking changes
- **REQ-002**: The system SHALL preserve all current Azure Functions triggers (HTTP, blob, queue, timer)
- **REQ-003**: The DAL SHALL provide methods for all database operations currently performed via embedded SQL
- **REQ-004**: The DAL SHALL provide methods for blob storage operations (upload, download, delete, list)
- **REQ-005**: The DAL SHALL provide methods for queue operations (send message for async document processing pipeline)
  - **Note**: Queue operations are essential for the async pipeline (documentProcessor → aiProductMapperQueue), not just for tooling
- **REQ-006**: All DAL methods SHALL include input validation before executing operations
- **REQ-007**: The system SHALL support the same retry logic for transient failures as the current implementation
- **REQ-008**: All existing tests SHALL pass after refactoring with equivalent or improved coverage
- **REQ-009**: The refactoring SHALL be performed incrementally to minimize disruption

### Non-Functional Requirements

- **NFR-001**: DAL methods SHALL have TypeScript type definitions for all inputs and outputs
- **NFR-002**: DAL operations SHALL log execution time and errors for observability
- **NFR-003**: The build process SHALL compile all packages in correct dependency order
- **NFR-004**: Test execution time SHALL not increase by more than 20% after refactoring
- **NFR-005**: The monorepo structure SHALL support independent versioning of packages (future capability)
- **NFR-006**: Code coverage SHALL maintain or exceed current levels (target: 80%+)

### Security Requirements

- **SEC-001**: The DAL SHALL NOT log sensitive data (connection strings, API keys, personal data)
- **SEC-002**: All DAL methods SHALL use parameterized queries to prevent SQL injection
- **SEC-003**: The DAL SHALL support demo mode API key validation (DEMO_API_KEY) as implemented in current system
- **SEC-004**: Blob SAS tokens SHALL be short-lived and scoped to minimum required permissions

### Constraints

- **CON-001**: Azure Functions require `src/functions/` directory structure for function discovery
- **CON-002**: Existing Azure infrastructure (Pulumi) SHALL NOT be modified during this refactoring
- **CON-003**: The refactoring MUST be deployable without database migrations
- **CON-004**: All packages MUST use ES modules (`"type": "module"` in package.json)
- **CON-005**: TypeScript compilation target MUST remain `es2022` for Node.js 20 compatibility
- **CON-006**: The project MUST continue to support local development with Docker (Azurite, SQL Server)

### Guidelines

- **GUI-001**: Follow repository pattern for DAL design (entities and repositories)
- **GUI-002**: Use dependency injection where practical for better testability
- **GUI-003**: Prefer composition over inheritance in DAL structure
- **GUI-004**: Name packages with `@profitforge/` scope for future npm publishing
- **GUI-005**: Use barrel exports (`index.ts`) for clean package interfaces
- **GUI-006**: Document all public DAL methods with JSDoc comments
- **GUI-007**: Group related DAL operations into cohesive repositories (e.g., `DocumentRepository`, `VendorProductRepository`)

### Patterns to Follow

- **PAT-001**: Repository Pattern for data access encapsulation
- **PAT-002**: Factory Pattern for creating repository instances with shared connection pools
- **PAT-003**: Builder Pattern for complex query construction (if needed)
- **PAT-004**: Singleton Pattern for connection pool management (existing pattern to preserve)

## 4. Interfaces & Data Contracts

### Package Structure

```
/
├── package.json                    # Root workspace configuration
├── tsconfig.base.json              # Shared TypeScript config
├── infra/                          # Pulumi infrastructure (UNCHANGED)
├── spec/                           # Specifications
├── docs/                           # Documentation
├── scripts/                        # Operational scripts (future)
└── packages/
    ├── shared/                     # @profitforge/shared
    │   ├── package.json
    │   ├── tsconfig.json
    │   ├── src/
    │   │   ├── index.ts            # Barrel export
    │   │   ├── database/
    │   │   │   ├── index.ts
    │   │   │   ├── connection.ts   # Pool management
    │   │   │   ├── repositories/
    │   │   │   │   ├── DocumentRepository.ts
    │   │   │   │   ├── VendorProductRepository.ts
    │   │   │   │   └── index.ts
    │   │   │   └── types.ts        # Database entity types
    │   │   ├── storage/
    │   │   │   ├── index.ts
    │   │   │   ├── BlobStorageService.ts
    │   │   │   └── types.ts
    │   │   ├── queues/
    │   │   │   ├── index.ts
    │   │   │   ├── QueueService.ts
    │   │   │   └── types.ts
    │   │   └── utils/
    │   │       ├── validations.ts  # Moved from src/utils
    │   │       ├── usageTracker.ts # Moved from src/utils
    │   │       └── index.ts
    │   └── test/
    │       └── unit/
    │           ├── DocumentRepository.unit.test.ts
    │           ├── BlobStorageService.unit.test.ts
    │           └── validations.unit.test.ts
    │
    └── core/                       # @profitforge/core (Azure Functions)
        ├── package.json
        ├── host.json
        ├── tsconfig.json
        ├── src/
        │   └── functions/
        │       ├── api.ts
        │       ├── documentProcessor.ts
        │       ├── aiProductMapper.ts
        │       ├── aiProductMapperQueue.ts
        │       ├── getResults.ts
        │       ├── sanity.ts
        │       └── scheduledCleanup.ts
        └── test/
            ├── unit/               # Function unit tests
            ├── integration/        # Integration tests with Docker
            └── e2e/                # End-to-end tests
```

### Data Access Layer Interfaces

#### DocumentRepository Interface

````typescript
// packages/shared/src/database/repositories/DocumentRepository.ts

export interface DocumentRecord {
  result_id: string;
  vendor_name: string;
  document_name: string;
  document_path: string;
  document_size_bytes: number;
  document_type: string;
  processing_status:
    | 'pending'
    | 'processing'
    | 'ocr_complete'
    | 'completed'
    | 'failed'
    | 'manual_review';
  export_status: 'not_exported' | 'confirmed' | 'exported' | 'rejected';
  ai_mapping_result?: string; // JSON
  product_count?: number;
  reprocessing_count?: number;
  parent_document_id?: string;
  created_at: Date;
  updated_at: Date;
  // ... other fields from vvocr schema
}

export interface CreateDocumentInput {
  vendor_name: string;
  document_name: string;
  document_path: string;
  document_size_bytes: number;
  document_type: string;
  processing_status?: string;
}

export interface UpdateDocumentStatusInput {
  result_id: string;
  processing_status: string;
  error_message?: string;
  processing_duration_ms?: number;
}

export class DocumentRepository {
  constructor(connectionPool: sql.ConnectionPool);

  // Create operations
  create(input: CreateDocumentInput): Promise<string>; // Returns result_id

  // Read operations
  findById(resultId: string): Promise<DocumentRecord | null>;
  findByVendorName(vendorName: string): Promise<DocumentRecord[]>;
  findByStatus(status: string, limit?: number): Promise<DocumentRecord[]>;
  findPendingDocuments(limit?: number): Promise<DocumentRecord[]>;
  findRecentResults(limit: number): Promise<DocumentRecord[]>;

  // Update operations
  updateStatus(input: UpdateDocumentStatusInput): Promise<void>;
  updateOcrResults(resultId: string, ocrData: Partial<DocumentRecord>): Promise<void>;
  updateAiMappingResults(resultId: string, aiData: Partial<DocumentRecord>): Promise<void>;
  updateExportStatus(resultId: string, exportStatus: string): Promise<void>;

  // Delete operations
  deleteById(resultId: string): Promise<number>; // Returns rows affected (single result only)
  deleteByVendorName(vendorName: string): Promise<number>;
  deleteBySourceFile(documentPath: string): Promise<number>; // Deletes all results for a source file

  // Complex queries
  findBySourceFile(documentPath: string): Promise<DocumentRecord[]>; // Get all processing results for a file

```typescript
// packages/shared/src/database/repositories/VendorProductRepository.ts

export interface VendorProduct {
  id: string;
  vendor_id: string;
  vendor_name: string;
  product_name: string;
  sku: string;
  price: number;
  unit: string;
  description?: string;
  source_document_id: string;
  source_document_name?: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateVendorProductInput {
  vendor_id: string;
  vendor_name: string;
  product_name: string;
  sku: string;
  price: number;
  unit: string;
  description?: string;
  source_document_id: string;
  source_document_name?: string;
}

export class VendorProductRepository {
  constructor(connectionPool: sql.ConnectionPool);

  // Create operations
  createBulk(products: CreateVendorProductInput[]): Promise<number>; // Returns inserted count

  // Read operations
  findByVendorId(vendorId: string): Promise<VendorProduct[]>;
  findBySourceDocument(documentId: string): Promise<VendorProduct[]>;
  findBySku(vendorId: string, sku: string): Promise<VendorProduct | null>;

  // Delete operations
  deleteByVendorId(vendorId: string): Promise<number>;
  deleteBySourceDocument(documentId: string): Promise<number>;
}
````

#### BlobStorageService Interface

```typescript
// packages/shared/src/storage/BlobStorageService.ts

export interface BlobUploadOptions {
  containerName: string;
  blobName: string;
  content: Buffer;
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface BlobDownloadResult {
  content: Buffer;
  contentType: string;
  metadata: Record<string, string>;
}

export class BlobStorageService {
  constructor(connectionString: string);

  // Upload operations
  upload(options: BlobUploadOptions): Promise<string>; // Returns blob URL

  // Download operations
  download(containerName: string, blobName: string): Promise<BlobDownloadResult>;
  exists(containerName: string, blobName: string): Promise<boolean>;

  // List operations
  listBlobs(containerName: string, prefix?: string): Promise<string[]>;

  // Delete operations
  delete(containerName: string, blobName: string): Promise<void>;
  deleteBulk(containerName: string, blobNames: string[]): Promise<number>; // Returns deleted count

  // Metadata operations
  getMetadata(containerName: string, blobName: string): Promise<Record<string, string>>;
  setMetadata(
    containerName: string,
    blobName: string,
    metadata: Record<string, string>
  ): Promise<void>;
}
```

#### QueueService Interface

```typescript
// packages/shared/src/queues/QueueService.ts

export interface QueueMessage<T = any> {
  messageId: string;
  popReceipt: string;
  content: T;
  dequeueCount: number;
  insertedOn: Date;
  expiresOn: Date;
}

export class QueueService {
  constructor(connectionString: string);

  // Send operations
  sendMessage<T = any>(queueName: string, content: T): Promise<string>; // Returns message ID

  // Receive operations (for testing/monitoring)
  receiveMessage<T = any>(queueName: string): Promise<QueueMessage<T> | null>;
  peekMessage<T = any>(queueName: string): Promise<T | null>;

  // Queue management
  getQueueLength(queueName: string): Promise<number>;
  purgeQueue(queueName: string): Promise<void>;
  deleteMessage(queueName: string, messageId: string, popReceipt: string): Promise<void>;
}
```

### Package Dependencies

```json
// packages/shared/package.json
{
  "name": "@profitforge/shared",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "mssql": "^10.0.1",
    "@azure/storage-blob": "^12.19.0",
    "@azure/storage-queue": "^12.29.0",
    "@azure/data-tables": "^13.3.2"
  },
  "devDependencies": {
    "@types/mssql": "^9.1.8",
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0",
    "vitest": "^1.2.0"
  }
}

// packages/core/package.json
{
  "name": "@profitforge/core",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/functions/*.js",
  "scripts": {
    "build": "tsc",
    "watch": "tsc --watch",
    "start": "func start",
    "test": "npm run test:unit && npm run test:integration",
    "test:unit": "vitest run --config test/unit/setup/vitest.config.unit.ts",
    "test:integration": "vitest run --config test/integration/setup/vitest.config.integration.ts",
    "test:e2e": "vitest run --config test/e2e/setup/vitest.config.e2e.ts"
  },
  "dependencies": {
    "@azure/ai-form-recognizer": "^4.0.0",
    "@azure/functions": "^4.0.0",
    "@profitforge/shared": "workspace:*",
    "openai": "^6.16.0",
    "xlsx": "^0.18.5"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@vitest/coverage-v8": "^1.2.0",
    "supertest": "^6.3.4",
    "tsx": "^4.21.0",
    "typescript": "^5.0.0",
    "vitest": "^1.2.0"
  }
}

// Root package.json
{
  "name": "profitforge-ai",
  "private": true,
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "build": "npm run build --workspaces",
    "test": "npm run test --workspaces",
    "format": "prettier --write .",
    "lint": "eslint ."
  }
}
```

## 5. Acceptance Criteria

### Monorepo Structure

- **AC-001**: Given the refactoring is complete, When I run `npm install` at root, Then all workspace packages SHALL be installed and linked correctly
- **AC-002**: Given the monorepo structure, When I run `npm run build` at root, Then packages/shared SHALL build before packages/core
- **AC-003**: Given the new structure, When I inspect package.json files, Then shared package SHALL NOT depend on core package
- **AC-004**: Given the refactoring, When I examine the directory structure, Then infra/ SHALL remain at root unchanged

### Data Access Layer

- **AC-005**: Given a DocumentRepository instance, When I call `create()` with valid input, Then it SHALL insert a record and return the result_id
- **AC-006**: Given an invalid vendor_name, When I call `DocumentRepository.create()`, Then it SHALL throw a validation error before executing SQL
- **AC-007**: Given an embedded SQL query in api.ts, When it is migrated to DAL, Then the equivalent DAL method SHALL produce the same SQL query structure
- **AC-008**: Given a transient database error, When a DAL method is called, Then it SHALL retry up to 3 times with exponential backoff
- **AC-009**: Given all DAL methods, When inspected, Then each SHALL have TypeScript type definitions for inputs and outputs
- **AC-010**: Given BlobStorageService, When uploading a file, Then it SHALL validate container name and blob name before upload

### Function Migration

- **AC-011**: Given uploadHandler function, When refactored to use DAL, Then it SHALL call `DocumentRepository.create()` instead of `pool.request().query()`
- **AC-012**: Given documentProcessor function, When refactored, Then it SHALL use `DocumentRepository.updateOcrResults()` instead of embedded SQL
- **AC-013**: Given deleteVendorHandler function, When refactored, Then it SHALL use `DocumentRepository.deleteBySourceFile()` and `BlobStorageService.delete()` to remove all processing results and the source file
- **AC-014**: Given all refactored functions, When deployed, Then all existing API contracts SHALL remain unchanged
- **AC-015**: Given the refactored codebase, When I search for `pool.request().query(`, Then it SHALL NOT appear in any function files

### Testing

- **AC-016**: Given the shared package, When I run `npm test` in packages/shared, Then all DAL unit tests SHALL pass
- **AC-017**: Given the core package, When I run `npm run test:integration`, Then all integration tests SHALL pass with Docker SQL Server
- **AC-018**: Given existing tests, When refactored to use DAL, Then test setup SHALL be simpler (no need to mock sql.ConnectionPool)
- **AC-019**: Given code coverage reports, When comparing before/after refactoring, Then coverage SHALL be >= 80% for all packages
- **AC-020**: Given E2E tests, When run against deployed functions, Then all tests SHALL pass without modification

### Build and Deployment

- **AC-021**: Given the monorepo, When building for deployment, Then packages/core/dist SHALL contain compiled Azure Functions
- **AC-022**: Given Azure Functions deployment, When the app starts, Then it SHALL discover all functions in core/dist/functions/
- **AC-023**: Given the refactored code, When deployed to Azure, Then it SHALL connect to the same SQL database without changes
- **AC-024**: Given local development, When running `func start` in packages/core, Then functions SHALL work with local.settings.json

## 6. Test Automation Strategy

### Test Levels

1. **Unit Tests** (packages/\*/test/unit/)
   - DAL methods with mocked SQL connections
   - Utility functions (validations, usage tracker)
   - Functions with mocked DAL dependencies
   - Target: Fast execution (<2s), no external dependencies

2. **Integration Tests** (packages/core/test/integration/)
   - DAL methods with real Docker SQL Server
   - Blob operations with Azurite
   - Queue operations with Azurite
   - Function handlers with real infrastructure (local)
   - Target: Realistic scenarios, Docker containers

3. **End-to-End Tests** (packages/core/test/e2e/)
   - Full document processing pipeline
   - Real Azure resources (staging environment)
   - Golden dataset validation
   - Target: Production-like scenarios

### Frameworks and Tools

- **Test Framework**: Vitest (current standard)
- **Mocking**: Vitest built-in mocks
- **Assertions**: Vitest expect (Jest-compatible)
- **Coverage**: @vitest/coverage-v8
- **Integration Infra**: Docker Compose (SQL Server Edge, Azurite)
- **E2E Environment**: Azure staging stack

### Test Data Management

- **Unit Tests**: In-memory fixtures, no database
- **Integration Tests**: Docker SQL Server with schema initialization, cleanup after each test
- **E2E Tests**: Staging database with cleanup scripts, reusable golden dataset PDFs

### CI/CD Integration

- **Trigger**: All tests run on PR creation/update
- **Unit Tests**: Run in parallel for all packages
- **Integration Tests**: Run with Docker services (GitHub Actions services)
- **E2E Tests**: Run only on main branch merges (due to Azure costs)
- **Coverage Report**: Published to PR comments

### Coverage Requirements

- **Shared Package**: 90%+ (pure logic, highly testable)
- **Core Package Functions**: 80%+ (business logic)
- **Overall Project**: 80%+ line coverage

### DAL-Specific Testing Patterns

```typescript
// Example: Unit test for DocumentRepository (mocked connection)
describe('DocumentRepository.create', () => {
  it('should insert document and return result_id', async () => {
    const mockPool = {
      request: vi.fn().mockReturnValue({
        input: vi.fn().mockReturnThis(),
        query: vi.fn().mockResolvedValue({
          recordset: [{ result_id: 'test-uuid-1234' }],
        }),
      }),
    };

    const repo = new DocumentRepository(mockPool as any);
    const resultId = await repo.create({
      vendor_name: 'TEST_VENDOR_01_26',
      document_name: 'test.pdf',
      document_path: 'TEST_VENDOR_01_26/test.pdf',
      document_size_bytes: 1024,
      document_type: 'application/pdf',
    });

    expect(resultId).toBe('test-uuid-1234');
    expect(mockPool.request().input).toHaveBeenCalledWith(
      'vendorName',
      expect.anything(),
      'TEST_VENDOR_01_26'
    );
  });

  it('should validate vendor name before insert', async () => {
    const repo = new DocumentRepository(mockPool as any);

    await expect(
      repo.create({
        vendor_name: 'invalid-name',
        document_name: 'test.pdf',
        document_path: 'invalid-name/test.pdf',
        document_size_bytes: 1024,
        document_type: 'application/pdf',
      })
    ).rejects.toThrow('Vendor name must be in format VENDOR_NAME_MM_YY');
  });
});

// Example: Integration test for DocumentRepository (real database)
describe('DocumentRepository Integration', () => {
  let pool: sql.ConnectionPool;
  let repo: DocumentRepository;

  beforeAll(async () => {
    pool = await getTestDbPool(); // Real Docker SQL Server
    repo = new DocumentRepository(pool);
  });

  afterEach(async () => {
    await cleanTestDatabase(); // Clear data
  });

  afterAll(async () => {
    await closeTestDbPool();
  });

  it('should create and retrieve document', async () => {
    const resultId = await repo.create({
      vendor_name: 'ACME_01_26',
      document_name: 'catalog.pdf',
      document_path: 'ACME_01_26/catalog.pdf',
      document_size_bytes: 2048,
      document_type: 'application/pdf',
    });

    const doc = await repo.findById(resultId);
    expect(doc).toBeDefined();
    expect(doc?.vendor_name).toBe('ACME_01_26');
    expect(doc?.processing_status).toBe('pending');
  });
});
```

## 7. Rationale & Context

### Why Monorepo?

**Problem**: The current structure has all code in a single `javascript/` package, mixing Azure Functions runtime code, utilities, tests, and scripts. This creates:

- Tight coupling between concerns
- Difficult to test functions independently
- No clear boundaries for reusable code
- Hard to share code with future packages (e.g., CLI tools, web dashboard)

**Solution**: npm workspaces provide lightweight monorepo management without external tools (Lerna, Nx). Benefits:

- Native npm support (no additional tooling)
- Shared dependencies hoisted to root (reduced disk space)
- Local package linking (`workspace:*` protocol)
- Independent versioning capability (future)

**Why not alternatives?**

- **Single package with folders**: Doesn't enforce boundaries, no dependency graph
- **Separate repos**: Overhead of managing multiple repos, complex versioning
- **Lerna/Nx**: Overkill for 2-3 packages, adds complexity

### Why Data Access Layer?

**Problem Analysis**: I found 20+ instances of embedded SQL queries across functions:

- `api.ts`: 8 different queries for upload, delete, vendor check
- `documentProcessor.ts`: 3 queries for status updates
- `getResults.ts`: 4 queries for fetching results
- `test/tools/`: Duplicate cleanup queries

**Consequences of embedded SQL**:

1. **Duplication**: Same INSERT/UPDATE patterns repeated across files
2. **No validation**: SQL executes with unchecked inputs (though parameterized)
3. **Hard to test**: Must mock `sql.ConnectionPool` in every test
4. **Fragile**: Schema changes require hunting down all query strings
5. **No type safety**: Query results are `any`, easy to make mistakes

**DAL Benefits**:

1. **Single source of truth**: One place to update when schema changes
2. **Testability**: Mock repository instead of SQL connection
3. **Validation**: Enforce business rules before database hit
4. **Type safety**: TypeScript interfaces for inputs/outputs
5. **Observability**: Centralized logging of all data operations
6. **Performance**: Opportunity to add query optimization, caching

**Repository Pattern**: Chosen because:

- Industry standard for DAL design
- Natural fit for our entities (Document, VendorProduct)
- Easy to understand and maintain
- Supports both simple CRUD and complex queries
- Testable (can create in-memory implementations)

### Why Co-located Tests?

**Problem**: Current structure has all tests in `javascript/test/` separated from source code. Finding relevant tests requires mental mapping.

**Co-location benefits**:

- **Proximity**: Tests live next to code they verify
- **Discoverability**: Easy to find tests for a module
- **Package isolation**: Each package's tests use only that package's exports
- **Clear ownership**: Shared package tests don't know about functions

**Structure chosen**:

```
packages/shared/
  src/ ← production code
  test/unit/ ← tests for src/

packages/core/
  src/functions/ ← production code
  test/
    unit/ ← function unit tests
    integration/ ← tests with Docker
    e2e/ ← full pipeline tests
```

### Why Preserve `infra/` at Root?

Pulumi infrastructure code stays at root because:

- It deploys both packages (shared and core are bundled for deployment)
- No benefit to moving it into a package
- Keeps infrastructure concerns separate from runtime code
- Common pattern in monorepos (infra orchestrates packages)

### Migration Strategy: Phased Approach

**Why phased?**

- Lower risk than "big bang" rewrite
- Can validate each step independently
- Team can adapt to new patterns gradually
- Easy to rollback if issues arise

**Proposed phases**:

**Phase 1: Foundation (Week 1, Days 1-3)**

- Create monorepo structure and shared package
- Implement core DAL repositories (Document, VendorProduct)
- Write comprehensive unit tests for DAL
- Ensure builds and tests run in new structure

**Phase 2: Function Migration (Week 1, Days 4-5)**

- Migrate api.ts to use DAL (highest value, most queries)
- Migrate documentProcessor.ts
- Migrate getResults.ts
- Run integration tests after each migration

**Phase 3: Test Migration (Week 2, Days 1-2)**

- Move tests to co-located structure
- Update test imports to use @profitforge/shared
- Simplify test setup (use DAL mocks)

**Phase 4: Cleanup & Documentation (Week 2, Day 3)**

- Remove javascript/ directory
- Update README and documentation
- Update CI/CD pipelines
- Deployment smoke test

### Design Decisions

**Decision 1: Use mssql package directly, not an ORM**

- **Rationale**: Current code uses mssql, team is familiar, avoid learning curve
- **Trade-off**: No automatic migrations, but we use Pulumi for schema anyway
- **Alternative considered**: TypeORM, Prisma (rejected: overkill, migration risk)

**Decision 2: Connection pool in shared package**

- **Rationale**: Reuse existing singleton pattern, works well with Azure Functions cold start
- **Trade-off**: All packages use same pool, but that's current behavior
- **Alternative considered**: Pool per package (rejected: unnecessary, worse performance)

**Decision 3: Validation in DAL, not separate layer**

- **Rationale**: Data validation is data access concern, keeps validation close to queries
- **Trade-off**: DAL has dual responsibility, but improves usability
- **Alternative considered**: Separate validation service (rejected: adds complexity)

**Decision 4: Repository per entity, not per aggregate root (DDD)**

- **Rationale**: Our domain is simple, CRUD-focused, not complex business logic
- **Trade-off**: Might need refactoring if domain complexity grows
- **Alternative considered**: Full DDD approach (rejected: over-engineering for current needs)

## 8. Dependencies & External Integrations

### Technology Platform Dependencies

- **PLT-001**: Node.js 20+ - Required for Azure Functions v4 runtime and ES module support
- **PLT-002**: npm 8+ - Required for workspaces feature
- **PLT-003**: TypeScript 5+ - Required for modern type features and ES2022 target
- **PLT-004**: Azure Functions Core Tools v4 - Required for local development and deployment

### Infrastructure Dependencies

- **INF-001**: Azure SQL Database - Serverless tier, existing vvocr schema, connection string in environment
- **INF-002**: Azure Blob Storage - Hot tier for uploads/ai-mapping containers, connection string in environment
- **INF-003**: Azure Queue Storage - For async document processing queue, connection string in environment
- **INF-004**: Azure Table Storage - For usage tracking (rate limiting, daily limits), connection string in environment
- **INF-005**: Docker - Required for local integration tests (SQL Server Edge, Azurite)

### Data Dependencies

- **DAT-001**: VVOCR Database Schema - Tables: `document_processing_results`, `vendor_products` with specific column names and types as defined in infra/vvocr-schema.sql
- **DAT-002**: Environment Variables - SQL_CONNECTION_STRING, STORAGE_CONNECTION_STRING, STORAGE_ACCOUNT_NAME, container names
- **DAT-003**: Golden Dataset PDFs - Located in test/e2e/docs/ for E2E validation

### Third-Party Package Dependencies

- **PKG-001**: mssql v10+ - Microsoft SQL Server client for Node.js, critical for all database operations
- **PKG-002**: @azure/storage-blob v12+ - Azure Blob Storage SDK, critical for document storage
- **PKG-003**: @azure/storage-queue v12+ - Azure Queue Storage SDK, critical for async processing
- **PKG-004**: @azure/data-tables v13+ - Azure Table Storage SDK, critical for usage tracking
- **PKG-005**: @azure/functions v4+ - Azure Functions Node.js worker, critical for function execution
- **PKG-006**: vitest v1+ - Test framework, critical for all automated testing

### Development Tool Dependencies

- **DEV-001**: Prettier - Code formatting, configured in .prettierrc
- **DEV-002**: ESLint - Code linting, configured in eslint.config.mjs
- **DEV-003**: Docker Compose - Required for integration test infrastructure

## 9. Examples & Edge Cases

### Example 1: Migrating a Function from Embedded SQL to DAL

**Before (Embedded SQL)**:

```typescript
// javascript/src/functions/api.ts - uploadHandler
export async function uploadHandler(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  // ... file upload logic ...

  // CHECK FOR DUPLICATE
  let pool = new sql.ConnectionPool(SQL_CONNECTION_STRING!);
  await pool.connect();

  const existingCheck = await pool.request().input('vendorName', sql.NVarChar, vendorName).query(`
      SELECT result_id, document_name, processing_status
      FROM vvocr.document_processing_results
      WHERE vendor_name = @vendorName
    `);

  if (existingCheck.recordset.length > 0) {
    await pool.close();
    return { status: 409, jsonBody: { error: 'Vendor already exists' } };
  }

  await pool.close();

  // ... blob upload ...

  // REGISTER IN DATABASE
  pool = new sql.ConnectionPool(SQL_CONNECTION_STRING!);
  await pool.connect();

  const result = await pool
    .request()
    .input('vendorName', sql.NVarChar, vendorName)
    .input('documentName', sql.NVarChar, standardFileName)
    .input('documentPath', sql.NVarChar, filePath)
    .input('documentSize', sql.BigInt, fileSize)
    .input('documentType', sql.NVarChar, file.type).query(`
      INSERT INTO vvocr.document_processing_results (
        vendor_name, document_name, document_path, 
        document_size_bytes, document_type, processing_status
      )
      OUTPUT INSERTED.result_id
      VALUES (@vendorName, @documentName, @documentPath, @documentSize, @documentType, 'pending')
    `);

  const resultId = result.recordset[0].result_id;
  await pool.close();

  return { status: 201, jsonBody: { resultId, filePath, vendorName } };
}
```

**After (Using DAL)**:

```typescript
// packages/core/src/functions/api.ts - uploadHandler
import { DocumentRepository, BlobStorageService } from '@profitforge/shared';
import { getConnectionPool } from '@profitforge/shared/database';

export async function uploadHandler(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  // ... file upload logic ...

  const pool = await getConnectionPool();
  const documentRepo = new DocumentRepository(pool);
  const blobService = new BlobStorageService(process.env.STORAGE_CONNECTION_STRING!);

  // CHECK FOR DUPLICATE
  const existing = await documentRepo.findByVendorName(vendorName);
  if (existing.length > 0) {
    return {
      status: 409,
      jsonBody: {
        error: 'Vendor already exists',
        existingDocument: {
          resultId: existing[0].result_id,
          documentName: existing[0].document_name,
          status: existing[0].processing_status,
        },
      },
    };
  }

  // UPLOAD BLOB
  await blobService.upload({
    containerName: STORAGE_CONTAINER_DOCUMENTS,
    blobName: filePath,
    content: fileBuffer,
    contentType: file.type,
  });

  // REGISTER IN DATABASE
  const resultId = await documentRepo.create({
    vendor_name: vendorName,
    document_name: standardFileName,
    document_path: filePath,
    document_size_bytes: fileSize,
    document_type: file.type,
  });

  return { status: 201, jsonBody: { resultId, filePath, vendorName } };
}
```

**Benefits Demonstrated**:

- No manual pool management (create/connect/close)
- Validation happens in `documentRepo.create()` (vendor name format check)
- Type-safe inputs and outputs
- Cleaner, more readable code
- Easier to test (mock `documentRepo` and `blobService`)

### Example 2: Repository Implementation with Validation

```typescript
// packages/shared/src/database/repositories/DocumentRepository.ts

import sql from 'mssql';
import { validateVendorName } from '../../utils/validations.js';

export class DocumentRepository {
  constructor(private pool: sql.ConnectionPool) {}

  async create(input: CreateDocumentInput): Promise<string> {
    // VALIDATION BEFORE DATABASE HIT
    const validation = validateVendorName(input.vendor_name);
    if (!validation.valid) {
      throw new Error(`Invalid vendor name: ${validation.error}`);
    }

    if (!input.document_name || !input.document_path) {
      throw new Error('document_name and document_path are required');
    }

    if (input.document_size_bytes <= 0) {
      throw new Error('document_size_bytes must be positive');
    }

    // EXECUTE QUERY WITH RETRY LOGIC (handled by connection pool)
    try {
      const result = await this.pool
        .request()
        .input('vendorName', sql.NVarChar, input.vendor_name)
        .input('documentName', sql.NVarChar, input.document_name)
        .input('documentPath', sql.NVarChar, input.document_path)
        .input('documentSize', sql.BigInt, input.document_size_bytes)
        .input('documentType', sql.NVarChar, input.document_type)
        .input('processingStatus', sql.NVarChar, input.processing_status || 'pending').query(`
          INSERT INTO vvocr.document_processing_results (
            vendor_name, document_name, document_path,
            document_size_bytes, document_type, processing_status
          )
          OUTPUT INSERTED.result_id
          VALUES (@vendorName, @documentName, @documentPath, @documentSize, @documentType, @processingStatus)
        `);

      return result.recordset[0].result_id;
    } catch (error) {
      // ENHANCE ERROR MESSAGES
      if (error instanceof Error && error.message.includes('duplicate')) {
        throw new Error(`Document already exists for vendor ${input.vendor_name}`);
      }
      throw error;
    }
  }

  async findByVendorName(vendorName: string): Promise<DocumentRecord[]> {
    // VALIDATION
    if (!vendorName) {
      throw new Error('vendorName is required');
    }

    const result = await this.pool.request().input('vendorName', sql.NVarChar, vendorName)
      .query<DocumentRecord>(`
        SELECT 
          result_id, vendor_name, document_name, document_path,
          processing_status, export_status, product_count,
          reprocessing_count, parent_document_id,
          created_at, updated_at
        FROM vvocr.document_processing_results
        WHERE vendor_name = @vendorName
        ORDER BY created_at DESC
      `);

    return result.recordset;
  }
}
```

### Edge Case 1: Handling Reprocessing Tree Deletes

**Scenario**: User uploads document → OCR succeeds → Reprocess with new prompt (creates v2) → Reprocess again (creates v3) → User deletes original document

**Expected**: All versions (original + v2 + v3) should be deleted

**Implementation**:

```typescript
// packages/shared/src/database/repositories/DocumentRepository.ts

async deleteDocumentTree(rootParentId: string): Promise<number> {
  // Find root parent (in case user provided a child ID)
  const doc = await this.findById(rootParentId);
  if (!doc) {
    throw new Error(`Document ${rootParentId} not found`);
  }

  const actualRootId = doc.parent_document_id || doc.result_id;

  // Delete root + all children in one query
  const result = await this.pool.request()
    .input('rootParentId', sql.UniqueIdentifier, actualRootId)
    .query(`
      DELETE FROM vvocr.document_processing_results
      WHERE result_id = @rootParentId OR parent_document_id = @rootParentId
    `);

  return result.rowsAffected[0];
}

async findRootParent(resultId: string): Promise<string> {
  const result = await this.pool.request()
    .input('resultId', sql.UniqueIdentifier, resultId)
    .query<{ result_id: string; parent_document_id: string | null }>(`
      SELECT result_id, parent_document_id
      FROM vvocr.document_processing_results
      WHERE result_id = @resultId
    `);

  if (result.recordset.length === 0) {
    throw new Error(`Document ${resultId} not found`);
  }

  const doc = result.recordset[0];
  return doc.parent_document_id || doc.result_id;
}
```

### Edge Case 2: Concurrent Vendor Uploads (Race Condition)

**Scenario**: Two users simultaneously upload documents for the same vendor

**Problem**: Without proper locking, both might pass the duplicate check and insert

**Solution**: Database-level unique constraint + DAL error handling

```typescript
// In vvocr-schema.sql (existing or add):
CREATE UNIQUE INDEX IX_unique_vendor_name
ON vvocr.document_processing_results (vendor_name)
WHERE processing_status IN ('pending', 'processing', 'ocr_complete', 'completed');

// In DocumentRepository:
async create(input: CreateDocumentInput): Promise<string> {
  // ... validation ...

  try {
    const result = await this.pool.request()
      // ... query ...
    return result.recordset[0].result_id;
  } catch (error) {
    // Handle unique constraint violation
    if (error instanceof Error &&
        (error.message.includes('unique') || error.message.includes('duplicate'))) {
      throw new Error(`A document already exists for vendor ${input.vendor_name}. Delete it before uploading a new one.`);
    }
    throw error;
  }
}
```

### Edge Case 3: Large Bulk Insert for Vendor Products

**Scenario**: AI extraction returns 5000 products, need to insert efficiently

**Solution**: Batch inserts with transaction

```typescript
// packages/shared/src/database/repositories/VendorProductRepository.ts

async createBulk(products: CreateVendorProductInput[]): Promise<number> {
  if (products.length === 0) {
    return 0;
  }

  // BATCH SIZE: SQL Server has 2100 parameter limit
  const BATCH_SIZE = 100; // (10 params per product = 1000 params per batch)
  let totalInserted = 0;

  const transaction = new sql.Transaction(this.pool);
  await transaction.begin();

  try {
    for (let i = 0; i < products.length; i += BATCH_SIZE) {
      const batch = products.slice(i, i + BATCH_SIZE);

      // Build VALUES clause
      const values = batch.map((_, idx) => {
        const base = idx * 10;
        return `(@vendorId${base}, @vendorName${base}, @productName${base}, @sku${base}, @price${base}, @unit${base}, @description${base}, @sourceDocId${base}, @sourceDocName${base}, DEFAULT)`;
      }).join(',\n');

      const request = new sql.Request(transaction);

      // Add parameters
      batch.forEach((product, idx) => {
        const base = idx * 10;
        request.input(`vendorId${base}`, sql.NVarChar, product.vendor_id);
        request.input(`vendorName${base}`, sql.NVarChar, product.vendor_name);
        request.input(`productName${base}`, sql.NVarChar, product.product_name);
        request.input(`sku${base}`, sql.NVarChar, product.sku);
        request.input(`price${base}`, sql.Decimal(18, 4), product.price);
        request.input(`unit${base}`, sql.NVarChar, product.unit);
        request.input(`description${base}`, sql.NVarChar, product.description || null);
        request.input(`sourceDocId${base}`, sql.UniqueIdentifier, product.source_document_id);
        request.input(`sourceDocName${base}`, sql.NVarChar, product.source_document_name || null);
      });

      const result = await request.query(`
        INSERT INTO vvocr.vendor_products (
          vendor_id, vendor_name, product_name, sku, price, unit,
          description, source_document_id, source_document_name, created_at
        )
        VALUES ${values}
      `);

      totalInserted += result.rowsAffected[0];
    }

    await transaction.commit();
    return totalInserted;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
```

## 10. Validation Criteria

### Structural Validation

- **VAL-001**: The `/packages/` directory exists with `shared/` and `core/` subdirectories
- **VAL-002**: Root `package.json` contains `"workspaces": ["packages/*"]`
- **VAL-003**: `packages/shared/package.json` has `"name": "@profitforge/shared"`
- **VAL-004**: `packages/core/package.json` has dependency `"@profitforge/shared": "workspace:*"`
- **VAL-005**: The `/infra/` directory remains at root and is unchanged
- **VAL-006**: No `javascript/` directory exists (fully migrated)

### Code Quality Validation

- **VAL-007**: Running `npm run lint` at root produces zero errors
- **VAL-008**: Running `npm run format:check` at root produces zero changes
- **VAL-009**: All exported functions from shared package have JSDoc comments
- **VAL-010**: No TODO or FIXME comments remain in migrated code
- **VAL-011**: All DAL methods have explicit return types (no implicit `any`)

### Functional Validation

- **VAL-012**: Running `npm run build` at root succeeds for all packages
- **VAL-013**: Running `npm test` at root succeeds (all unit + integration tests pass)
- **VAL-014**: Searching codebase for `new sql.ConnectionPool` shows zero matches in `packages/core/src/functions/`
- **VAL-015**: Searching codebase for `.request().query(` shows zero matches in `packages/core/src/functions/`
- **VAL-016**: Running E2E tests against deployed staging environment succeeds
- **VAL-017**: Uploading a test PDF via API returns 201 status and creates database record
- **VAL-018**: Processing pipeline completes end-to-end (upload → OCR → AI mapping → export)

### Performance Validation

- **VAL-019**: Unit test suite completes in < 10 seconds
- **VAL-020**: Integration test suite completes in < 60 seconds
- **VAL-021**: E2E test suite completes in < 5 minutes
- **VAL-022**: API response times are within 10% of pre-refactoring baseline

### Deployment Validation

- **VAL-023**: Azure Functions deploy succeeds with new package structure
- **VAL-024**: Deployed functions appear in Azure Portal under Function App
- **VAL-025**: Function app logs show successful database connections on cold start
- **VAL-026**: Health check endpoint (`/api/sanity`) returns 200 OK
- **VAL-027**: Cost tracking still works (document processing records costs in database)

## 11. Related Specifications / Further Reading

### Internal Documentation

- [Architecture Documentation](../docs/architecture.md) - System design and data flow
- [API Reference](../docs/api.md) - Endpoint specifications
- [Testing Guide](../docs/testing.md) - Test strategy and execution
- [Deployment Guide](../docs/deployment.md) - Pulumi infrastructure deployment

### External References

- [npm Workspaces Documentation](https://docs.npmjs.com/cli/v8/using-npm/workspaces)
- [Azure Functions Node.js Developer Guide](https://learn.microsoft.com/en-us/azure/azure-functions/functions-reference-node)
- [Repository Pattern in TypeScript](https://blog.logrocket.com/guide-to-node-js-design-patterns/)
- [SQL Server Best Practices for Azure Functions](https://learn.microsoft.com/en-us/azure/azure-functions/manage-connections)
- [TypeScript Handbook - Modules](https://www.typescriptlang.org/docs/handbook/modules.html)

### Design Patterns

- **Repository Pattern**: Martin Fowler's Patterns of Enterprise Application Architecture
- **Factory Pattern**: Gang of Four Design Patterns
- **Dependency Injection**: Microsoft .NET Architecture Guides (applicable to TypeScript)

### Azure Documentation

- [Azure SQL Database Serverless](https://learn.microsoft.com/en-us/azure/azure-sql/database/serverless-tier-overview)
- [Azure Blob Storage SDK for JavaScript](https://learn.microsoft.com/en-us/azure/storage/blobs/storage-quickstart-blobs-nodejs)
- [Azure Queue Storage SDK for JavaScript](https://learn.microsoft.com/en-us/azure/storage/queues/storage-nodejs-how-to-use-queues)

---

## Appendix A: Migration Checklist

This checklist provides a step-by-step guide for implementing the refactoring:

### Phase 1: Foundation Setup ✅

- [ ] Create `packages/` directory
- [ ] Update root `package.json` with workspaces configuration
- [ ] Create `packages/shared/` structure (src, test, package.json, tsconfig.json)
- [ ] Create `packages/core/` structure (src/functions, test, package.json, host.json, tsconfig.json)
- [ ] Run `npm install` at root to link workspaces
- [ ] Verify `npm run build` works for both packages

### Phase 2: Shared Package Implementation ✅

- [ ] Move `src/utils/database.ts` → `packages/shared/src/database/connection.ts`
- [ ] Move `src/utils/validations.ts` → `packages/shared/src/utils/validations.ts`
- [ ] Move `src/utils/usageTracker.ts` → `packages/shared/src/utils/usageTracker.ts`
- [ ] Implement `packages/shared/src/database/repositories/DocumentRepository.ts`
- [ ] Implement `packages/shared/src/database/repositories/VendorProductRepository.ts`
- [ ] Implement `packages/shared/src/storage/BlobStorageService.ts`
- [ ] Implement `packages/shared/src/queues/QueueService.ts`
- [ ] Create barrel exports (`index.ts` files)
- [ ] Write unit tests for all repositories and services
- [ ] Verify all shared package tests pass

### Phase 3: Core Package Migration ✅

- [ ] Copy `javascript/src/functions/` → `packages/core/src/functions/`
- [ ] Copy `javascript/host.json` → `packages/core/host.json`
- [ ] Update imports in functions to use `@profitforge/shared`
- [ ] Refactor `api.ts` - uploadHandler to use DAL
- [ ] Refactor `api.ts` - deleteVendorHandler to use DAL
- [ ] Refactor `api.ts` - confirmExportHandler to use DAL
- [ ] Refactor `api.ts` - reprocessMappingHandler to use DAL
- [ ] Refactor `documentProcessor.ts` to use DAL
- [ ] Refactor `aiProductMapper.ts` to use DAL
- [ ] Refactor `getResults.ts` to use DAL
- [ ] Remove all `new sql.ConnectionPool()` from functions
- [ ] Verify no embedded SQL remains in functions

### Phase 4: Test Migration ✅

- [ ] Move `javascript/test/unit/` → `packages/core/test/unit/`
- [ ] Move `javascript/test/integration/` → `packages/core/test/integration/`
- [ ] Move `javascript/test/e2e/` → `packages/core/test/e2e/`
- [ ] Update test imports to use `@profitforge/shared`
- [ ] Simplify mocks (use DAL mocks instead of SQL mocks)
- [ ] Move relevant tests to `packages/shared/test/unit/`
- [ ] Update vitest configs for new paths
- [ ] Verify all tests pass in new structure

### Phase 5: Cleanup ✅

- [ ] Delete `javascript/` directory
- [ ] Update root README.md with new structure
- [ ] Update docs/ with new import paths
- [ ] Remove unused dependencies
- [ ] Run `npm run lint:fix` at root
- [ ] Run `npm run format` at root
- [ ] Commit changes with conventional commit messages

### Phase 6: CI/CD and Deployment ✅

- [ ] Update GitHub Actions workflows for monorepo
- [ ] Update Pulumi deployment scripts to build from `packages/core`
- [ ] Deploy to staging environment
- [ ] Run E2E tests against staging
- [ ] Verify function discovery in Azure Portal
- [ ] Check Application Insights for errors
- [ ] Deploy to production
- [ ] Monitor for 24 hours

---

## Appendix B: Risk Assessment

| Risk                                   | Likelihood | Impact | Mitigation                                                 |
| -------------------------------------- | ---------- | ------ | ---------------------------------------------------------- |
| **Breaking existing API contracts**    | Low        | High   | Maintain exact API responses, comprehensive E2E tests      |
| **Function discovery fails in Azure**  | Medium     | High   | Test deployment to staging first, verify host.json paths   |
| **Performance degradation**            | Low        | Medium | Benchmark before/after, DAL adds minimal overhead          |
| **Test suite takes too long**          | Medium     | Low    | Use Docker for integration tests, parallelize unit tests   |
| **Missing SQL query during migration** | Medium     | High   | Grep for all SQL queries before refactoring, code review   |
| **Connection pool exhaustion**         | Low        | Medium | Reuse existing singleton pattern, monitor connections      |
| **Type safety issues**                 | Low        | Low    | Strict TypeScript config, comprehensive type definitions   |
| **Developer confusion**                | Medium     | Low    | Clear documentation, pair programming during migration     |
| **Rollback difficulty**                | Low        | High   | Phased approach, git branches per phase, can revert easily |
| **CI/CD pipeline failures**            | Medium     | Medium | Test CI config in feature branch first                     |

---

## Appendix C: Success Metrics

Measure these metrics before and after refactoring:

| Metric                              | Baseline (Current) | Target (Post-Refactoring)  |
| ----------------------------------- | ------------------ | -------------------------- |
| **Code Coverage**                   | ~75%               | ≥80%                       |
| **Unit Test Execution Time**        | ~8s                | <10s                       |
| **Integration Test Execution Time** | ~45s               | <60s                       |
| **Lines of Code (Functions)**       | ~1300              | ~1000 (cleaner with DAL)   |
| **Cyclomatic Complexity (Avg)**     | ~12                | <10                        |
| **SQL Query Duplication**           | 8 instances        | 0 instances                |
| **API Response Time (P95)**         | ~250ms             | <275ms (within 10%)        |
| **Developer Onboarding Time**       | ~2 days            | ~1 day (clearer structure) |
| **Time to Add New Function**        | ~3 hours           | ~1 hour (reuse DAL)        |

---

_End of Specification_
