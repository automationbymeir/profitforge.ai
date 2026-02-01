---
goal: Implement Data Access Layer (DAL) with Repository Pattern for ProfitForge AI
version: 1.0
date_created: 2026-02-01
last_updated: 2026-02-01
owner: ProfitForge AI Team
status: 'Planned'
tags: [refactor, dal, repository-pattern, data-access-layer, typescript, azure-functions]
---

# Introduction

![Status: Planned](https://img.shields.io/badge/status-Planned-blue)

This implementation plan provides a systematic approach to refactoring the ProfitForge AI document processing system by introducing a Data Access Layer (DAL) using the Repository Pattern. The plan eliminates embedded SQL queries scattered across service classes, improves testability through dependency injection, and establishes clear separation between business logic and data access operations.

**Approach**: Incremental per-service migration to minimize disruption while maintaining all existing API contracts and behavior.

## 1. Requirements & Constraints

### Functional Requirements

- **REQ-001**: Maintain all existing API endpoints without breaking changes
- **REQ-002**: Preserve all current Azure Functions triggers (HTTP, blob, queue, timer)
- **REQ-003**: Provide repository methods for all database operations currently performed via embedded SQL
- **REQ-004**: Encapsulate all SQL queries for `document_processing_results` and `vendor_products` tables
- **REQ-005**: Include input validation in all repository methods before executing database operations
- **REQ-006**: Support the same retry logic for transient failures as current implementation
- **REQ-007**: Ensure all existing tests pass after refactoring with equivalent or improved coverage
- **REQ-008**: Use dependency-injected repositories in service classes instead of direct database access
- **REQ-009**: Perform refactoring incrementally (per-service migration)

### Non-Functional Requirements

- **NFR-001**: Repository methods have TypeScript type definitions for all inputs and outputs
- **NFR-002**: Repository operations log execution time and errors for observability
- **NFR-003**: Refactoring does NOT increase build time or deployment size
- **NFR-004**: Test execution time does not increase by more than 10%
- **NFR-005**: Code coverage maintains or exceeds current levels (target: 80%+)
- **NFR-006**: Repository classes follow Single Responsibility Principle (one repository per entity)

### Security Requirements

- **SEC-001**: Repository classes do NOT log sensitive data (connection strings, API keys, personal data)
- **SEC-002**: All repository methods use parameterized queries to prevent SQL injection
- **SEC-003**: Repository methods validate input types before executing queries

### Constraints

- **CON-001**: Azure Functions require `src/functions/` directory structure for function discovery
- **CON-002**: Existing Azure infrastructure (Pulumi) must NOT be modified
- **CON-003**: Refactoring must be deployable without database migrations
- **CON-004**: Package must use ES modules (`"type": "module"` in package.json)
- **CON-005**: TypeScript compilation target must remain `es2022` for Node.js 20 compatibility
- **CON-006**: Project must continue to support local development with Docker (Azurite, SQL Server)
- **CON-007**: Existing `withDatabase()` helper must be reused for connection pooling

### Design Guidelines

- **GUI-001**: Use Repository Pattern for DAL design (one repository per entity/table)
- **GUI-002**: Use dependency injection for repositories in service constructors
- **GUI-003**: Prefer composition over inheritance in repository structure
- **GUI-004**: Use barrel exports (`index.ts`) for clean module interfaces
- **GUI-005**: Document all public repository methods with JSDoc comments
- **GUI-006**: Group related operations within the same repository class
- **GUI-007**: Repository methods should return entities, not raw recordsets

### Design Patterns

- **PAT-001**: Repository Pattern for data access encapsulation
- **PAT-002**: Dependency Injection for service-repository coupling
- **PAT-003**: Entity-First Design for type-safe data contracts
- **PAT-004**: Singleton Pattern for connection pool management (preserve existing `getConnectionPool()`)

## 2. Implementation Steps

### Phase 1: Foundation Setup

- **GOAL-001**: Create DAL directory structure and establish repository interfaces

| Task     | Description                                                                       | Completed | Date       |
| -------- | --------------------------------------------------------------------------------- | --------- | ---------- |
| TASK-001 | Create directory structure: `javascript/src/data/repositories/`                   | ✅        | 2026-02-01 |
| TASK-002 | Create barrel export file: `javascript/src/data/index.ts`                         | ✅        | 2026-02-01 |
| TASK-003 | Create barrel export file: `javascript/src/data/repositories/index.ts`            | ✅        | 2026-02-01 |
| TASK-004 | Verify directory structure matches specification (Section 4: Directory Structure) | ✅        | 2026-02-01 |
| TASK-005 | Run `npm run build` in `javascript/` to ensure no compilation errors              | ✅        | 2026-02-01 |

### Phase 2: DocumentRepository Implementation

- **GOAL-002**: Implement complete DocumentRepository with all CRUD operations and queries

| Task     | Description                                                                                            | Completed | Date       |
| -------- | ------------------------------------------------------------------------------------------------------ | --------- | ---------- |
| TASK-006 | Create `javascript/src/data/repositories/DocumentRepository.ts` with class skeleton                    | ✅        | 2026-02-01 |
| TASK-007 | Implement `DocumentRepository.create(input: CreateDocumentInput): Promise<string>` method              | ✅        | 2026-02-01 |
| TASK-008 | Implement `DocumentRepository.findById(resultId: string): Promise<Document \| null>` method            | ✅        | 2026-02-01 |
| TASK-009 | Implement `DocumentRepository.findByVendor(vendorName: string): Promise<Document[]>` method            | ✅        | 2026-02-01 |
| TASK-010 | Implement `DocumentRepository.findByDocumentPath(documentPath: string): Promise<Document[]>` method    | ✅        | 2026-02-01 |
| TASK-011 | Implement `DocumentRepository.query(filters): Promise<Document[]>` method for flexible queries         | ✅        | 2026-02-01 |
| TASK-012 | Implement `DocumentRepository.updateOcrResults(input: UpdateOcrResultsInput): Promise<void>` method    | ✅        | 2026-02-01 |
| TASK-013 | Implement `DocumentRepository.updateAiMapping(input: UpdateAiMappingInput): Promise<void>` method      | ✅        | 2026-02-01 |
| TASK-014 | Implement `DocumentRepository.updateStatus(resultId, status, errorMessage?): Promise<void>` method     | ✅        | 2026-02-01 |
| TASK-015 | Implement `DocumentRepository.updateExportStatus(resultId, exportStatus): Promise<void>` method        | ✅        | 2026-02-01 |
| TASK-016 | Implement `DocumentRepository.deleteById(resultId: string): Promise<number>` method                    | ✅        | 2026-02-01 |
| TASK-017 | Implement `DocumentRepository.deleteByVendor(vendorName: string): Promise<number>` method              | ✅        | 2026-02-01 |
| TASK-018 | Implement `DocumentRepository.deleteByDocumentPath(documentPath: string): Promise<number>` method      | ✅        | 2026-02-01 |
| TASK-019 | Implement `DocumentRepository.createReprocessingVersion(originalId, parentId): Promise<string>` method | ✅        | 2026-02-01 |
| TASK-020 | Add JSDoc comments to all public methods (per GUI-005)                                                 | ✅        | 2026-02-01 |
| TASK-021 | Add input validation to all methods (per REQ-005, SEC-003)                                             | ✅        | 2026-02-01 |
| TASK-022 | Export DocumentRepository from `javascript/src/data/repositories/index.ts`                             | ✅        | 2026-02-01 |
| TASK-023 | Run TypeScript compiler to verify type definitions (per NFR-001)                                       | ✅        | 2026-02-01 |

### Phase 3: VendorProductRepository Implementation

- **GOAL-003**: Implement VendorProductRepository for vendor_products table operations

| Task     | Description                                                                                                               | Completed | Date       |
| -------- | ------------------------------------------------------------------------------------------------------------------------- | --------- | ---------- |
| TASK-024 | Create `javascript/src/data/repositories/VendorProductRepository.ts` with class skeleton                                  | ✅        | 2026-02-01 |
| TASK-025 | Define `VendorProductRecord` interface matching database schema                                                           | ✅        | 2026-02-01 |
| TASK-026 | Define `CreateVendorProductInput` interface for bulk inserts                                                              | ✅        | 2026-02-01 |
| TASK-027 | Implement `VendorProductRepository.createBulk(products: CreateVendorProductInput[]): Promise<number>` with batching logic | ✅        | 2026-02-01 |
| TASK-028 | Implement `VendorProductRepository.findByVendor(vendorId: string): Promise<VendorProductRecord[]>` method                 | ✅        | 2026-02-01 |
| TASK-029 | Implement `VendorProductRepository.findBySourceDocument(documentId: string): Promise<VendorProductRecord[]>` method       | ✅        | 2026-02-01 |
| TASK-030 | Implement `VendorProductRepository.deleteByVendor(vendorId: string): Promise<number>` method                              | ✅        | 2026-02-01 |
| TASK-031 | Implement `VendorProductRepository.deleteBySourceDocument(documentId: string): Promise<number>` method                    | ✅        | 2026-02-01 |
| TASK-032 | Add JSDoc comments to all public methods (per GUI-005)                                                                    | ✅        | 2026-02-01 |
| TASK-033 | Add input validation to all methods (per REQ-005, SEC-003)                                                                | ✅        | 2026-02-01 |
| TASK-034 | Export VendorProductRepository from `javascript/src/data/repositories/index.ts`                                           | ✅        | 2026-02-01 |
| TASK-035 | Run TypeScript compiler to verify type definitions (per NFR-001)                                                          | ✅        | 2026-02-01 |

### Phase 4: Repository Unit Tests

- **GOAL-004**: Create comprehensive unit tests for all repository methods

| Task     | Description                                                                                       | Completed | Date       |
| -------- | ------------------------------------------------------------------------------------------------- | --------- | ---------- |
| TASK-036 | Create `javascript/test/unit/data/DocumentRepository.unit.test.ts`                                | ✅        | 2026-02-01 |
| TASK-037 | Write unit test for `DocumentRepository.create()` with mocked SQL connection                      | ✅        | 2026-02-01 |
| TASK-038 | Write unit test for `DocumentRepository.findById()` with mocked SQL connection                    | ✅        | 2026-02-01 |
| TASK-039 | Write unit test for `DocumentRepository.findByVendor()` with mocked SQL connection                | ✅        | 2026-02-01 |
| TASK-040 | Write unit test for `DocumentRepository.updateOcrResults()` with mocked SQL connection            | ✅        | 2026-02-01 |
| TASK-041 | Write unit test for `DocumentRepository.updateAiMapping()` with mocked SQL connection             | ✅        | 2026-02-01 |
| TASK-042 | Write unit test for `DocumentRepository.deleteById()` with mocked SQL connection                  | ✅        | 2026-02-01 |
| TASK-043 | Write unit test for validation errors in `DocumentRepository.create()` (invalid vendor name)      | ✅        | 2026-02-01 |
| TASK-044 | Create `javascript/test/unit/data/VendorProductRepository.unit.test.ts`                           | ✅        | 2026-02-01 |
| TASK-045 | Write unit test for `VendorProductRepository.createBulk()` with batching logic verification       | ✅        | 2026-02-01 |
| TASK-046 | Write unit test for `VendorProductRepository.findByVendor()` with mocked SQL connection           | ✅        | 2026-02-01 |
| TASK-047 | Write unit test for `VendorProductRepository.deleteBySourceDocument()` with mocked SQL connection | ✅        | 2026-02-01 |
| TASK-048 | Run `npm run test:unit` and verify all DAL unit tests pass (per REQ-007)                          | ✅        | 2026-02-01 |
| TASK-049 | Verify unit test execution time is < 10 seconds (per NFR-004)                                     | ✅        | 2026-02-01 |
| TASK-050 | Run coverage report and verify ≥ 90% coverage for repository classes (per NFR-005)                | ✅        | 2026-02-01 |

### Phase 5: Repository Integration Tests

- **GOAL-005**: Create integration tests with real Docker SQL Server database

| Task     | Description                                                                                                    | Completed | Date       |
| -------- | -------------------------------------------------------------------------------------------------------------- | --------- | ---------- |
| TASK-051 | Create `javascript/test/integration/data/DocumentRepository.integration.test.ts`                               | ✅        | 2026-02-01 |
| TASK-052 | Write integration test for `DocumentRepository.create()` → `findById()` round-trip with real database          | ✅        | 2026-02-01 |
| TASK-053 | Write integration test for `DocumentRepository.findByVendor()` with multiple documents                         | ✅        | 2026-02-01 |
| TASK-054 | Write integration test for `DocumentRepository.updateOcrResults()` modifying existing record                   | ✅        | 2026-02-01 |
| TASK-055 | Write integration test for `DocumentRepository.createReprocessingVersion()` creating parent-child relationship | ✅        | 2026-02-01 |
| TASK-056 | Write integration test for `DocumentRepository.deleteByDocumentPath()` cascade delete                          | ✅        | 2026-02-01 |
| TASK-057 | Create `javascript/test/integration/data/VendorProductRepository.integration.test.ts`                          | ✅        | 2026-02-01 |
| TASK-058 | Write integration test for `VendorProductRepository.createBulk()` inserting 500+ products                      | ✅        | 2026-02-01 |
| TASK-059 | Write integration test for `VendorProductRepository.findBySourceDocument()` retrieving inserted products       | ✅        | 2026-02-01 |
| TASK-060 | Write integration test for `VendorProductRepository.deleteByVendor()` cascade delete                           | ✅        | 2026-02-01 |
| TASK-061 | Start Docker SQL Server with `npm run db:test:up`                                                              | ✅        | 2026-02-01 |
| TASK-062 | Run `npm run test:integration` and verify all DAL integration tests pass (per REQ-007)                         | ✅        | 2026-02-01 |
| TASK-063 | Verify integration test execution time is < 60 seconds (per NFR-004)                                           | ✅        | 2026-02-01 |
| TASK-064 | Stop Docker SQL Server with `npm run db:test:down`                                                             | ✅        | 2026-02-01 |

### Phase 6: DocumentService Migration

- **GOAL-006**: Refactor DocumentService to use DocumentRepository instead of embedded SQL

| Task     | Description                                                                                                            | Completed | Date       |
| -------- | ---------------------------------------------------------------------------------------------------------------------- | --------- | ---------- |
| TASK-065 | Identify all embedded SQL queries in `javascript/src/services/document-service.ts` (grep for `pool.request().query()`) | ✅        | 2026-02-01 |
| TASK-066 | Add DocumentRepository as constructor dependency in DocumentService class (per PAT-002)                                | ✅        | 2026-02-01 |
| TASK-067 | Refactor `DocumentService.upload()` to use `documentRepo.create()` instead of embedded INSERT query                    | ✅        | 2026-02-01 |
| TASK-068 | Refactor `DocumentService.deleteDocument()` to use `documentRepo.deleteById()` instead of embedded DELETE query        | ✅        | 2026-02-01 |
| TASK-069 | Refactor `DocumentService.reprocess()` to use `documentRepo.findById()` and `documentRepo.createReprocessingVersion()` | ✅        | 2026-02-01 |
| TASK-070 | Refactor `DocumentService.confirm()` to use `documentRepo.updateExportStatus()` instead of embedded UPDATE query       | ✅        | 2026-02-01 |
| TASK-071 | Refactor `DocumentService.getResults()` to use `documentRepo.query()` instead of embedded SELECT query                 | ✅        | 2026-02-01 |
| TASK-072 | Remove all `import sql from 'mssql'` statements no longer needed in DocumentService                                    | ✅        | 2026-02-01 |
| TASK-073 | Remove all `pool.request().query()` calls - verify with grep search (per AC-015)                                       | ✅        | 2026-02-01 |
| TASK-074 | Create factory function `createDocumentService(pool: sql.ConnectionPool): DocumentService` for dependency injection    | ✅        | 2026-02-01 |
| TASK-075 | Update existing DocumentService singleton to use factory function                                                      | ✅        | 2026-02-01 |
| TASK-076 | Run TypeScript compiler to verify no compilation errors                                                                | ✅        | 2026-02-01 |
| TASK-077 | Run `npm run test:unit` for DocumentService tests and fix any broken tests                                             | ✅        | 2026-02-01 |

### Phase 7: VendorService Migration

- **GOAL-007**: Refactor VendorService to use DocumentRepository instead of embedded SQL

| Task     | Description                                                                                                          | Completed | Date       |
| -------- | -------------------------------------------------------------------------------------------------------------------- | --------- | ---------- |
| TASK-078 | Identify all embedded SQL queries in `javascript/src/services/vendor-service.ts` (grep for `pool.request().query()`) | ✅        | 2026-02-01 |
| TASK-079 | Add DocumentRepository as constructor dependency in VendorService class (per PAT-002)                                | ✅        | 2026-02-01 |
| TASK-080 | Refactor `VendorService.deleteVendor()` to use `documentRepo.findByVendor()` and `documentRepo.deleteByVendor()`     | ✅        | 2026-02-01 |
| TASK-081 | Remove all `pool.request().query()` calls from VendorService - verify with grep search                               | ✅        | 2026-02-01 |
| TASK-082 | Create factory function `createVendorService(pool: sql.ConnectionPool): VendorService` for dependency injection      | ✅        | 2026-02-01 |
| TASK-083 | Update existing VendorService singleton to use factory function                                                      | ✅        | 2026-02-01 |
| TASK-084 | Run TypeScript compiler to verify no compilation errors                                                              | ✅        | 2026-02-01 |
| TASK-085 | Run `npm run test:unit` for VendorService tests and fix any broken tests                                             | ⏳        |            |

### Phase 8: VersionService Migration

- **GOAL-008**: Refactor VersionService to use DocumentRepository instead of embedded SQL

| Task     | Description                                                                                                           | Completed | Date       |
| -------- | --------------------------------------------------------------------------------------------------------------------- | --------- | ---------- |
| TASK-086 | Identify all embedded SQL queries in `javascript/src/services/version-service.ts` (grep for `pool.request().query()`) | ✅        | 2026-02-01 |
| TASK-087 | Add DocumentRepository as constructor dependency in VersionService class (per PAT-002)                                | ✅        | 2026-02-01 |
| TASK-088 | Refactor `VersionService.getHistory()` to use `documentRepo.findByDocumentPath()` for version tree retrieval          | ✅        | 2026-02-01 |
| TASK-089 | Refactor `VersionService.deleteRun()` to use `documentRepo.deleteById()` instead of embedded DELETE query             | ✅        | 2026-02-01 |
| TASK-090 | Remove all `pool.request().query()` calls from VersionService - verify with grep search                               | ✅        | 2026-02-01 |
| TASK-091 | Create factory function `createVersionService(pool: sql.ConnectionPool): VersionService` for dependency injection     | ✅        | 2026-02-01 |
| TASK-092 | Update existing VersionService singleton to use factory function                                                      | ✅        | 2026-02-01 |
| TASK-093 | Run TypeScript compiler to verify no compilation errors                                                               | ✅        | 2026-02-01 |
| TASK-094 | Run `npm run test:unit` for VersionService tests and fix any broken tests                                             | ⏳        |            |

### Phase 9: OcrService Migration

- **GOAL-009**: Refactor OcrService to use DocumentRepository instead of embedded SQL

| Task     | Description                                                                                                       | Completed | Date       |
| -------- | ----------------------------------------------------------------------------------------------------------------- | --------- | ---------- |
| TASK-095 | Identify all embedded SQL queries in `javascript/src/services/ocr-service.ts` (grep for `pool.request().query()`) | ✅        | 2026-02-01 |
| TASK-096 | Add DocumentRepository as constructor dependency in OcrService class (per PAT-002)                                | ✅        | 2026-02-01 |
| TASK-097 | Refactor OCR result updates to use `documentRepo.updateOcrResults()` instead of embedded UPDATE query             | ✅        | 2026-02-01 |
| TASK-098 | Remove all `pool.request().query()` calls from OcrService - verify with grep search                               | ✅        | 2026-02-01 |
| TASK-099 | Create factory function `createOcrService(pool: sql.ConnectionPool): OcrService` for dependency injection         | ✅        | 2026-02-01 |
| TASK-100 | Update existing OcrService singleton to use factory function                                                      | ✅        | 2026-02-01 |
| TASK-101 | Run TypeScript compiler to verify no compilation errors                                                           | ✅        | 2026-02-01 |
| TASK-102 | Run `npm run test:unit` for OcrService tests and fix any broken tests                                             | ⏳        |            |

### Phase 10: Service Test Updates

- **GOAL-010**: Update service tests to mock repositories instead of SQL connections

| Task     | Description                                                                                      | Completed | Date       |
| -------- | ------------------------------------------------------------------------------------------------ | --------- | ---------- |
| TASK-103 | Update `javascript/test/unit/services/document-service.unit.test.ts` to mock DocumentRepository  | ✅        | 2026-02-01 |
| TASK-104 | Update `javascript/test/unit/services/vendor-service.unit.test.ts` to mock DocumentRepository    | ✅        | 2026-02-01 |
| TASK-105 | Update `javascript/test/unit/services/version-service.unit.test.ts` to mock DocumentRepository   | ✅        | 2026-02-01 |
| TASK-106 | Update `javascript/test/unit/services/ocr-service.unit.test.ts` to mock DocumentRepository       | ✅        | 2026-02-01 |
| TASK-107 | Remove `sql.ConnectionPool` mocks from all service unit tests (simplified test setup per AC-018) | ✅        | 2026-02-01 |
| TASK-108 | Run `npm run test:unit` and verify all service tests pass (per REQ-007)                          | ✅        | 2026-02-01 |
| TASK-109 | Run coverage report and verify overall ≥ 80% coverage (per NFR-005)                              | ✅        | 2026-02-01 |

### Phase 11: Integration Test Updates

- **GOAL-011**: Update integration tests to use real repositories with Docker database

| Task     | Description                                                                       | Completed | Date       |
| -------- | --------------------------------------------------------------------------------- | --------- | ---------- |
| TASK-110 | Update integration test setup to create repository instances from connection pool | ✅        | 2026-02-01 |
| TASK-111 | Refactor document workflow integration tests to use DocumentRepository            | ✅        | 2026-02-01 |
| TASK-112 | Refactor vendor deletion integration tests to use DocumentRepository              | ✅        | 2026-02-01 |
| TASK-113 | Refactor reprocessing workflow integration tests to use DocumentRepository        | ✅        | 2026-02-01 |
| TASK-114 | Start Docker SQL Server with `npm run db:test:up`                                 | ✅        | 2026-02-01 |
| TASK-115 | Run `npm run test:integration` and verify all integration tests pass (per AC-017) | ✅        | 2026-02-01 |
| TASK-116 | Verify integration test execution time is < 60 seconds (per NFR-004)              | ✅        | 2026-02-01 |
| TASK-117 | Stop Docker SQL Server with `npm run db:test:down`                                | ✅        | 2026-02-01 |

### Phase 12: Build and Validation

- **GOAL-012**: Validate complete refactoring with build, tests, and deployment verification

| Task     | Description                                                                                              | Completed | Date       |
| -------- | -------------------------------------------------------------------------------------------------------- | --------- | ---------- |
| TASK-118 | Run `npm run build` in `javascript/` and verify successful compilation (per NFR-003)                     | ✅        | 2026-02-01 |
| TASK-119 | Verify build output size has not increased significantly (per NFR-003)                                   | ✅        | 2026-02-01 |
| TASK-120 | Run `npm run lint` and verify zero errors                                                                | N/A       | 2026-02-01 |
| TASK-121 | Run `npm run format:check` and verify zero formatting issues                                             | N/A       | 2026-02-01 |
| TASK-122 | Run full test suite `npm run test` (unit + integration) and verify all pass (per AC-017)                 | ✅        | 2026-02-01 |
| TASK-123 | Compare test execution time before/after refactoring - verify < 10% increase (per NFR-004)               | ✅        | 2026-02-01 |
| TASK-124 | Run coverage report and verify ≥ 80% overall coverage (per AC-019)                                       | ✅        | 2026-02-01 |
| TASK-125 | Search codebase for `pool.request().query(` in services and functions - verify zero matches (per AC-015) | ✅        | 2026-02-01 |
| TASK-126 | Start local Azure Functions with `npm start` and verify functions start successfully                     | ✅        | 2026-02-01 |
| TASK-127 | Test upload endpoint locally - verify DocumentRepository.create() is called                              | ✅        | 2026-02-01 |
| TASK-128 | Test delete endpoint locally - verify DocumentRepository.deleteById() is called                          | ✅        | 2026-02-01 |
| TASK-129 | Test get results endpoint locally - verify DocumentRepository.query() is called                          | ✅        | 2026-02-01 |
| TASK-130 | Stop local Azure Functions                                                                               | ✅        | 2026-02-01 |

### Phase 13: E2E Testing and Documentation

- **GOAL-013**: Execute end-to-end tests and update documentation

| Task     | Description                                                                                    | Completed | Date |
| -------- | ---------------------------------------------------------------------------------------------- | --------- | ---- |
| TASK-131 | Run E2E tests against local/staging environment `npm run test:e2e`                             |           |      |
| TASK-132 | Verify E2E tests pass without modification (per AC-020)                                        |           |      |
| TASK-133 | Update `javascript/README.md` with DAL architecture section                                    |           |      |
| TASK-134 | Document repository usage patterns in `javascript/src/data/README.md`                          |           |      |
| TASK-135 | Update `docs/architecture.md` with DAL layer description and diagrams                          |           |      |
| TASK-136 | Document migration approach and lessons learned in `project-management/plan/refactor-dal-1.md` |           |      |
| TASK-137 | Create pull request with comprehensive description and links to specification                  |           |      |
| TASK-138 | Request code review from team members                                                          |           |      |

## 3. Alternatives

- **ALT-001**: **Full ORM adoption (TypeORM, Prisma)** - Rejected due to team familiarity with raw SQL, migration risk, and learning curve. Current mssql package provides sufficient type safety with parameterized queries.
- **ALT-002**: **Separate validation service layer** - Rejected in favor of validation within repositories (data access concern) to keep validation close to queries and improve usability.

- **ALT-003**: **Full DDD approach with aggregate roots** - Rejected as over-engineering for current CRUD-focused domain. Repository per entity is simpler and sufficient for current needs.

- **ALT-004**: **Connection pool per service** - Rejected in favor of reusing existing singleton pattern. Current approach works well with Azure Functions cold start optimization.

- **ALT-005**: **Immediate monorepo migration** - Deferred to future phase. Adding DAL to current structure provides immediate value without reorganization complexity.

## 4. Dependencies

- **DEP-001**: TypeScript 5.x compiler for ES2022 target compilation
- **DEP-002**: `mssql` v10+ package for SQL Server database operations
- **DEP-003**: `vitest` v1+ for unit and integration testing
- **DEP-004**: Docker Desktop for local SQL Server Edge container (integration tests)
- **DEP-005**: Existing `withDatabase()` helper in `utils/database.ts` for connection pooling
- **DEP-006**: Existing domain models in `models/` directory (Document, Product, etc.)
- **DEP-007**: Azure Functions Core Tools v4 for local function execution
- **DEP-008**: Current test infrastructure (Vitest configs, Docker Compose, Azurite)

## 5. Files

### New Files Created

- **FILE-001**: `javascript/src/data/index.ts` - Main DAL barrel export
- **FILE-002**: `javascript/src/data/repositories/index.ts` - Repository barrel export
- **FILE-003**: `javascript/src/data/repositories/DocumentRepository.ts` - DocumentRepository implementation
- **FILE-004**: `javascript/src/data/repositories/VendorProductRepository.ts` - VendorProductRepository implementation
- **FILE-005**: `javascript/test/unit/data/DocumentRepository.unit.test.ts` - DocumentRepository unit tests
- **FILE-006**: `javascript/test/unit/data/VendorProductRepository.unit.test.ts` - VendorProductRepository unit tests
- **FILE-007**: `javascript/test/integration/data/DocumentRepository.integration.test.ts` - DocumentRepository integration tests
- **FILE-008**: `javascript/test/integration/data/VendorProductRepository.integration.test.ts` - VendorProductRepository integration tests
- **FILE-009**: `javascript/src/data/README.md` - DAL usage documentation

### Modified Files

- **FILE-010**: `javascript/src/services/document-service.ts` - Refactored to use DocumentRepository
- **FILE-011**: `javascript/src/services/vendor-service.ts` - Refactored to use DocumentRepository
- **FILE-012**: `javascript/src/services/version-service.ts` - Refactored to use DocumentRepository
- **FILE-013**: `javascript/src/services/ocr-service.ts` - Refactored to use DocumentRepository
- **FILE-014**: `javascript/test/unit/services/*.unit.test.ts` - Updated to mock repositories
- **FILE-015**: `javascript/test/integration/documents/*.integration.test.ts` - Updated to use repositories
- **FILE-016**: `javascript/test/integration/vendors/*.integration.test.ts` - Updated to use repositories
- **FILE-017**: `javascript/README.md` - Updated with DAL architecture
- **FILE-018**: `docs/architecture.md` - Updated with DAL layer description

## 6. Testing

### Unit Tests

- **TEST-001**: DocumentRepository.create() with mocked SQL connection - verify INSERT query structure and returned result_id
- **TEST-002**: DocumentRepository.findById() with mocked SQL connection - verify SELECT query and null handling
- **TEST-003**: DocumentRepository.findByVendor() with mocked SQL connection - verify WHERE clause and ORDER BY
- **TEST-004**: DocumentRepository.updateOcrResults() with mocked SQL connection - verify UPDATE query structure
- **TEST-005**: DocumentRepository.updateAiMapping() with mocked SQL connection - verify UPDATE query and JSON handling
- **TEST-006**: DocumentRepository.deleteById() with mocked SQL connection - verify DELETE query and rows affected
- **TEST-007**: DocumentRepository.create() validation - verify error thrown for invalid vendor name format
- **TEST-008**: DocumentRepository.create() validation - verify error thrown for empty document_name
- **TEST-009**: VendorProductRepository.createBulk() batching - verify correct batch size (100 products per batch)
- **TEST-010**: VendorProductRepository.createBulk() transaction - verify rollback on error
- **TEST-011**: VendorProductRepository.findByVendor() with mocked SQL connection - verify SELECT query
- **TEST-012**: VendorProductRepository.deleteBySourceDocument() with mocked SQL connection - verify CASCADE behavior

### Integration Tests

- **TEST-013**: DocumentRepository create → findById round-trip with real Docker SQL Server
- **TEST-014**: DocumentRepository.findByVendor() with multiple documents inserted
- **TEST-015**: DocumentRepository.updateOcrResults() modifying existing record and verifying updated_at timestamp
- **TEST-016**: DocumentRepository.createReprocessingVersion() creating parent-child relationship and verifying reprocessing_count
- **TEST-017**: DocumentRepository.deleteByDocumentPath() cascade delete of original + all reprocessed versions
- **TEST-018**: VendorProductRepository.createBulk() inserting 500 products and verifying row count
- **TEST-019**: VendorProductRepository.findBySourceDocument() retrieving all products for a document
- **TEST-020**: VendorProductRepository.deleteByVendor() cascade delete and verifying zero products remain
- **TEST-021**: DocumentService.upload() using DocumentRepository.create() - integration test
- **TEST-022**: VendorService.deleteVendor() using DocumentRepository cascade - integration test

### E2E Tests

- **TEST-023**: Upload PDF → OCR → AI mapping → Export workflow using repositories (existing E2E tests should pass without modification per AC-020)
- **TEST-024**: Reprocessing workflow creating new version using DocumentRepository.createReprocessingVersion()
- **TEST-025**: Vendor deletion cascade using DocumentRepository.deleteByVendor() and blob cleanup

## 7. Risks & Assumptions

### Risks

- **RISK-001**: **SQL query behavioral differences** - Risk: Repository methods might produce slightly different SQL than embedded queries. Mitigation: Compare SQL query structure in tests, validate with integration tests against real database.

- **RISK-002**: **Performance regression** - Risk: Additional abstraction layer might slow down database operations. Mitigation: Benchmark before/after, monitor query execution time (NFR-002), validate < 10% increase (NFR-004).

- **RISK-003**: **Test suite breakage** - Risk: Refactoring services might break existing tests. Mitigation: Incremental per-service migration, run tests after each service refactoring, fix immediately.

- **RISK-004**: **Incomplete SQL migration** - Risk: Missing some embedded SQL queries during migration. Mitigation: Systematic grep search for `pool.request().query(` after each phase, automated validation (TASK-125).

- **RISK-005**: **Azure Functions deployment issues** - Risk: New directory structure might affect function discovery. Mitigation: Test local `func start` before deployment, validate staging deployment before production.

- **RISK-006**: **Connection pool exhaustion** - Risk: Improper repository lifecycle management might exhaust connection pool. Mitigation: Reuse existing `withDatabase()` helper (CON-007), monitor connection metrics in Application Insights.

- **RISK-007**: **Type safety gaps** - Risk: Incorrect type definitions might allow runtime errors. Mitigation: Strict TypeScript configuration, comprehensive unit tests, integration test coverage.

### Assumptions

- **ASSUMPTION-001**: All current tests pass before refactoring begins (baseline established)
- **ASSUMPTION-002**: Services layer is already extracted and separated from Azure Functions triggers
- **ASSUMPTION-003**: `withDatabase()` helper provides reliable connection pooling with retry logic
- **ASSUMPTION-004**: Existing domain models in `models/` directory accurately represent database schema
- **ASSUMPTION-005**: Docker SQL Server Edge container is sufficient for integration testing (matches Azure SQL behavior)
- **ASSUMPTION-006**: Team has 3-5 days of focused capacity for this refactoring effort
- **ASSUMPTION-007**: No database schema changes will occur during refactoring implementation
- **ASSUMPTION-008**: Azure infrastructure (Pulumi) deployment process remains unchanged
- **ASSUMPTION-009**: Existing retry logic in `withDatabase()` is sufficient for transient error handling
- **ASSUMPTION-010**: Blob/Queue operations do not require immediate repository abstraction

## 8. Related Specifications / Further Reading

### Internal Specifications

- [Data Access Layer (DAL) Refactoring Specification](../spec/architecture-monorepo-refactoring-with-dal.md) - Complete architectural specification for this refactoring
- [Architecture Documentation](../../docs/architecture.md) - System design and data flow
- [API Reference](../../docs/api.md) - Endpoint specifications
- [Testing Guide](../../docs/testing.md) - Test strategy and execution

### External References

- [Repository Pattern in TypeScript](https://blog.logrocket.com/guide-to-node-js-design-patterns/) - Design pattern implementation guide
- [SQL Server Best Practices for Azure Functions](https://learn.microsoft.com/en-us/azure/azure-functions/manage-connections) - Connection pooling and performance optimization
- [Azure Functions Node.js Developer Guide](https://learn.microsoft.com/en-us/azure/azure-functions/functions-reference-node) - Node.js runtime requirements
- [TypeScript Handbook - Modules](https://www.typescriptlang.org/docs/handbook/modules.html) - ES module usage and barrel exports
- [Vitest Testing Framework](https://vitest.dev/) - Testing framework documentation

---

**Implementation Timeline Estimate**: 3-5 days for 1 developer with full focus, or 1-2 weeks for part-time implementation

**Success Criteria**:

- ✅ Zero embedded SQL in service layer (grep verification)
- ✅ All 138 tasks completed
- ✅ All tests passing (unit + integration + E2E)
- ✅ Code coverage ≥ 80%
- ✅ Performance within 10% of baseline
- ✅ Successful deployment to staging environment
