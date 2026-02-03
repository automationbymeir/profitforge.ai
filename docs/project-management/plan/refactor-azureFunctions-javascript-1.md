---
goal: Refactor Azure Functions code folder structure for improved maintainability, scalability, and organization
version: 1.0
date_created: 2026-01-29
last_updated: 2026-01-29
owner: Development Team
status: Planned
tags: [refactor, architecture, azure-functions, organization, typescript]
---

# Introduction

![Status: Planned](https://img.shields.io/badge/status-Planned-blue)

This implementation plan addresses the critical organizational and structural issues in the `code/` Azure Functions codebase. The current structure suffers from a 1315-line monolithic API file, duplicated code patterns, inconsistent architectural patterns, and lack of domain-based organization. This refactoring will improve code maintainability, enable better scalability, reduce duplication, and establish clear architectural boundaries.

The refactoring is structured in 5 progressive phases, each independently deployable and testable, allowing for incremental improvements with minimal risk.

## 1. Requirements & Constraints

### Functional Requirements

- **REQ-001**: All existing tests (unit, integration, E2E) must pass after each phase
- **REQ-002**: All existing API endpoints must maintain backward compatibility during migration
- **REQ-003**: Zero downtime deployment - functions must remain operational throughout refactoring
- **REQ-004**: Maintain existing function trigger types (HTTP, Blob, Queue, Timer)
- **REQ-005**: Preserve current Azure Functions v4 programming model patterns
- **REQ-006**: Keep existing environment variable configuration structure
- **REQ-007**: Maintain bronze-layer storage audit trail functionality
- **REQ-008**: Preserve OpenAI GPT-4o and Azure Document Intelligence integrations

### Technical Requirements

- **TEC-001**: TypeScript with strict mode enabled
- **TEC-002**: Azure Functions v4 `@azure/functions` npm package
- **TEC-003**: ESLint and Prettier code quality standards
- **TEC-004**: Vitest testing framework for all test types
- **TEC-005**: SQL Server with mssql library for database operations
- **TEC-006**: Azure Blob Storage for document and bronze-layer storage
- **TEC-007**: Azure Storage Queue for async processing

### Architectural Constraints

- **ARC-001**: Functions must be independently deployable
- **ARC-002**: Maintain singleton pattern for database connections
- **ARC-003**: Maintain singleton pattern for Azure SDK clients (OpenAI, Document Intelligence, Storage)
- **ARC-004**: No in-memory state between function invocations (stateless design)
- **ARC-005**: Follow separation of concerns principle (presentation, business logic, data access)
- **ARC-006**: Use composition over inheritance for middleware patterns

### Security Requirements

- **SEC-001**: Maintain demo mode API key validation
- **SEC-002**: Preserve rate limiting functionality (IP-based and daily limits)
- **SEC-003**: Continue CORS header management for cross-origin requests
- **SEC-004**: Maintain secure connection string handling via environment variables
- **SEC-005**: No sensitive data in logs or error messages

### Performance Constraints

- **PER-001**: No increase in cold start times after refactoring
- **PER-002**: Maintain or improve database connection pooling efficiency
- **PER-003**: No additional memory overhead from new abstractions
- **PER-004**: Maintain async/await patterns for non-blocking operations

### Development Guidelines

- **GUD-001**: Use `withDatabase` helper for all database operations
- **GUD-002**: Separate handler functions from function registration
- **GUD-003**: Use centralized response builders from `httpHelpers.ts`
- **GUD-004**: Follow existing validation patterns from `validations.ts`
- **GUD-005**: Maintain consistent error handling patterns
- **GUD-006**: Use meaningful logging with context.log methods
- **GUD-007**: Follow Azure Functions best practices for folder structure

### Anti-Patterns to Avoid

- **PAT-001**: No manual database connection pool management (use `withDatabase`)
- **PAT-002**: No duplicated CORS header definitions
- **PAT-003**: No mixing of business logic with HTTP handling logic
- **PAT-004**: No monolithic files exceeding 500 lines
- **PAT-005**: No inline helper functions in handler files
- **PAT-006**: No circular dependencies between modules

## 2. Implementation Steps

### Phase 1: Extract Middleware Layer

- **GOAL-001**: Create reusable middleware for cross-cutting concerns (CORS, auth, rate-limiting) to eliminate code duplication across HTTP handlers

| Task     | Description                                                                                            | Completed | Date |
| -------- | ------------------------------------------------------------------------------------------------------ | --------- | ---- |
| TASK-001 | Create `src/middleware/` directory structure                                                           |           |      |
| TASK-002 | Implement `src/middleware/cors.ts` with `withCors()` higher-order function for CORS header management  |           |      |
| TASK-003 | Implement `src/middleware/auth.ts` with `withAuth()` higher-order function for API key validation      |           |      |
| TASK-004 | Implement `src/middleware/rate-limit.ts` with `withRateLimit()` function for IP and daily limit checks |           |      |
| TASK-005 | Implement `src/middleware/error-handler.ts` with `withErrorHandler()` for centralized error handling   |           |      |
| TASK-006 | Create `src/middleware/index.ts` barrel export for convenient imports                                  |           |      |
| TASK-007 | Update `src/functions/api.ts` - Pilot migration: Refactor `uploadHandler` to use middleware            |           |      |
| TASK-008 | Update `src/functions/api.ts` - Pilot migration: Refactor `deleteVendorHandler` to use middleware      |           |      |
| TASK-009 | Run unit tests to verify middleware functionality                                                      |           |      |
| TASK-010 | Run integration tests to verify no behavioral changes                                                  |           |      |
| TASK-011 | Roll out middleware to remaining 8 HTTP handlers in `api.ts`                                           |           |      |
| TASK-012 | Update `src/functions/getResults.ts` to use middleware                                                 |           |      |
| TASK-013 | Update `src/functions/aiProductMapper.ts` to use middleware                                            |           |      |
| TASK-014 | Run full test suite (unit, integration, E2E) to verify Phase 1 completion                              |           |      |
| TASK-015 | Remove duplicated CORS header code from all handlers                                                   |           |      |
| TASK-016 | Update documentation with middleware usage examples                                                    |           |      |

### Phase 2: Create Service Layer

- **GOAL-002**: Extract business logic from HTTP handlers into reusable service classes to enable testability and code reuse across triggers

| Task     | Description                                                                                                             | Completed | Date       |
| -------- | ----------------------------------------------------------------------------------------------------------------------- | --------- | ---------- |
| TASK-017 | Create `src/services/` directory structure                                                                              | ✅        | 2026-01-29 |
| TASK-018 | Implement `src/services/document-service.ts` with DocumentService class (upload, delete, getResults, reprocess methods) | ✅        | 2026-01-29 |
| TASK-019 | Implement `src/services/vendor-service.ts` with VendorService class (delete, validate methods)                          | ✅        | 2026-01-29 |
| TASK-020 | Implement `src/services/version-service.ts` with VersionService class (getHistory, deleteRun methods)                   | ✅        | 2026-01-29 |
| TASK-021 | Implement `src/services/ai-service.ts` with AIService class (mapProducts, singleton OpenAI client)                      | ✅        | 2026-01-29 |
| TASK-022 | Implement `src/services/ocr-service.ts` with OCRService class (processDocument, singleton Document Intelligence client) | ✅        | 2026-01-29 |
| TASK-023 | Implement `src/services/storage-service.ts` with StorageService class (uploadBlob, deleteBlob, bronze-layer methods)    | ✅        | 2026-01-29 |
| TASK-024 | Create `src/services/index.ts` barrel export                                                                            | ✅        | 2026-01-29 |
| TASK-025 | Pilot migration: Refactor `uploadHandler` to use DocumentService                                                        | ✅        | 2026-01-29 |
| TASK-026 | Pilot migration: Refactor `deleteVendorHandler` to use VendorService                                                    | ✅        | 2026-01-29 |
| TASK-027 | Pilot migration: Refactor `aiProductMapperHandler` to use AIService                                                     | ✅        | 2026-01-29 |
| TASK-028 | Create unit tests for DocumentService                                                                                   | ✅        | 2026-01-30 |
| TASK-029 | Create unit tests for VendorService                                                                                     | ✅        | 2026-01-30 |
| TASK-030 | Create unit tests for AIService                                                                                         | ✅        | 2026-01-30 |
| TASK-031 | Run integration tests to verify pilot services work correctly                                                           | ✅        | 2026-01-30 |
| TASK-032 | Roll out service layer to all remaining handlers                                                                        | ✅        | 2026-01-29 |
| TASK-033 | Update `documentProcessor.ts` to use OCRService                                                                         | ✅        | 2026-01-29 |
| TASK-034 | Update `aiProductMapperQueue.ts` to use AIService (code reuse verification)                                             | ✅        | 2026-01-29 |
| TASK-035 | Verify all handlers are now thin routing layers (<100 lines each)                                                       | ✅        | 2026-01-29 |
| TASK-036 | Run full test suite to verify Phase 2 completion                                                                        | ✅        | 2026-01-30 |
| TASK-037 | Update documentation with service layer architecture                                                                    | ✅        | 2026-01-30 |

### Phase 3: Reorganize Folder Structure

- **GOAL-003**: Implement domain-based and trigger-type folder organization to improve code discoverability and maintainability

| Task     | Description                                                                                                                                                                             | Completed | Date |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---- |
| TASK-038 | Create new directory structure: `src/functions/http/`, `src/functions/queues/`, `src/functions/blobs/`, `src/functions/timers/`                                                         |           |      |
| TASK-039 | Create domain subdirectories: `src/functions/http/documents/`, `src/functions/http/vendors/`, `src/functions/http/versions/`, `src/functions/http/admin/`, `src/functions/http/health/` |           |      |
| TASK-040 | Move `scheduledCleanup.ts` to `src/functions/timers/scheduled-cleanup.ts`                                                                                                               |           |      |
| TASK-041 | Move `sanity.ts` to `src/functions/http/health/sanity.ts`                                                                                                                               |           |      |
| TASK-042 | Extract `uploadHandler` from `api.ts` to `src/functions/http/documents/upload.ts`                                                                                                       |           |      |
| TASK-043 | Extract `getResults` from `getResults.ts` to `src/functions/http/documents/get-results.ts`                                                                                              |           |      |
| TASK-044 | Extract `deleteVendorHandler` from `api.ts` to `src/functions/http/vendors/delete.ts`                                                                                                   |           |      |
| TASK-045 | Extract `reprocessMappingHandler` from `api.ts` to `src/functions/http/documents/reprocess.ts`                                                                                          |           |      |
| TASK-046 | Extract `confirmMappingHandler` from `api.ts` to `src/functions/http/documents/confirm.ts`                                                                                              |           |      |
| TASK-047 | Extract `deleteDocumentHandler` from `api.ts` to `src/functions/http/documents/delete.ts`                                                                                               |           |      |
| TASK-048 | Extract `getVersionHistoryHandler` from `api.ts` to `src/functions/http/versions/history.ts`                                                                                            |           |      |
| TASK-049 | Extract `deleteRunHandler` from `api.ts` to `src/functions/http/versions/delete-run.ts`                                                                                                 |           |      |
| TASK-050 | Extract `demoUsageHandler` from `api.ts` to `src/functions/http/admin/usage.ts`                                                                                                         |           |      |
| TASK-051 | Move `aiProductMapper.ts` to `src/functions/http/documents/ai-mapper.ts`                                                                                                                |           |      |
| TASK-052 | Move `aiProductMapperQueue.ts` to `src/functions/queues/ai-product-mapper.ts`                                                                                                           |           |      |
| TASK-053 | Move `documentProcessor.ts` to `src/functions/blobs/document-processor.ts`                                                                                                              |           |      |
| TASK-054 | Update all import paths in moved files                                                                                                                                                  |           |      |
| TASK-055 | Update test files to reflect new structure in `test/unit/`, `test/integration/`                                                                                                         |           |      |
| TASK-056 | Update `package.json` main field to use glob pattern: `src/functions/**/*.{js,ts}`                                                                                                      |           |      |
| TASK-057 | Delete empty `api.ts` file after all extractions                                                                                                                                        |           |      |
| TASK-058 | Run build process to verify no import errors                                                                                                                                            |           |      |
| TASK-059 | Run full test suite to verify all functions still work                                                                                                                                  |           |      |
| TASK-060 | Test local function execution with `func start`                                                                                                                                         |           |      |
| TASK-061 | Deploy to development environment and verify                                                                                                                                            |           |      |
| TASK-062 | Update documentation with new folder structure                                                                                                                                          |           |      |

### Phase 4: API Contract Refactoring

- **GOAL-004**: Implement RESTful API conventions and consistent resource-based routing for improved API clarity and future versioning support

| Task     | Description                                                                                                    | Completed | Date |
| -------- | -------------------------------------------------------------------------------------------------------------- | --------- | ---- |
| TASK-063 | Design OpenAPI 3.0 specification document for new API contract                                                 |           |      |
| TASK-064 | Create API route mapping document (old routes → new routes)                                                    |           |      |
| TASK-065 | Update `upload.ts` function registration: change route from `upload` to `documents`                            |           |      |
| TASK-066 | Update `get-results.ts` function registration: change route from `getResults` to `documents`                   |           |      |
| TASK-067 | Update `delete.ts` (document) function registration: change route from `deleteDocument` to `documents/:id`     |           |      |
| TASK-068 | Update `delete.ts` (vendor) function registration: change route from `deleteVendor` to `vendors/:name`         |           |      |
| TASK-069 | Update `reprocess.ts` function registration: change route from `reprocessMapping` to `documents/:id/reprocess` |           |      |
| TASK-070 | Update `confirm.ts` function registration: change route from `confirmMapping` to `documents/:id/confirm`       |           |      |
| TASK-071 | Update `history.ts` function registration: change route from `getVersionHistory` to `documents/:id/versions`   |           |      |
| TASK-072 | Update `delete-run.ts` function registration: change route from `deleteRun` to `documents/:id/versions/:runId` |           |      |
| TASK-073 | Update `usage.ts` function registration: change route from `demo/usage` to `admin/usage`                       |           |      |
| TASK-074 | Update `sanity.ts` function registration: change route from `helloWorld` to `health`                           |           |      |
| TASK-075 | Update `ai-mapper.ts` function registration: change route from `aiProductMapper` to `documents/:id/ai-mapping` |           |      |
| TASK-076 | Update all handlers to use route parameters instead of query parameters where applicable                       |           |      |
| TASK-077 | Update integration tests with new API routes                                                                   |           |      |
| TASK-078 | Update E2E tests with new API routes                                                                           |           |      |
| TASK-079 | Update test client HTML files with new API routes                                                              |           |      |
| TASK-080 | Create API migration guide document for external consumers                                                     |           |      |
| TASK-081 | (Optional) Implement backward compatibility layer with deprecation warnings                                    |           |      |
| TASK-082 | Run full test suite with new API routes                                                                        |           |      |
| TASK-083 | Deploy to staging environment and verify                                                                       |           |      |
| TASK-084 | Update API documentation with OpenAPI spec                                                                     |           |      |

### Phase 5: Extract Type Models

- **GOAL-005**: Centralize type definitions to eliminate duplication, improve IDE support, and enable future type documentation generation

| Task     | Description                                                                                                         | Completed | Date |
| -------- | ------------------------------------------------------------------------------------------------------------------- | --------- | ---- |
| TASK-085 | Create `src/models/` directory structure                                                                            |           |      |
| TASK-086 | Implement `src/models/document.ts` with Document, UploadRequest, UploadResult, ProcessingStatus, ExportStatus types |           |      |
| TASK-087 | Implement `src/models/vendor.ts` with Vendor, VendorNameParts types                                                 |           |      |
| TASK-088 | Implement `src/models/product.ts` with Product, MappingResult, QualityMetrics types                                 |           |      |
| TASK-089 | Implement `src/models/version.ts` with Version, VersionHistory types                                                |           |      |
| TASK-090 | Implement `src/models/api-responses.ts` with ApiResponse, ErrorResponse, PaginatedResponse types                    |           |      |
| TASK-091 | Implement `src/models/ocr.ts` with OCRData, OCRResult, TableData types                                              |           |      |
| TASK-092 | Implement `src/models/usage.ts` with UsageStats, RateLimitCheck types                                               |           |      |
| TASK-093 | Create `src/models/index.ts` barrel export                                                                          |           |      |
| TASK-094 | Update all service files to import types from models                                                                |           |      |
| TASK-095 | Update all function handlers to import types from models                                                            |           |      |
| TASK-096 | Remove inline type definitions from all files                                                                       |           |      |
| TASK-097 | Add JSDoc comments to all exported types                                                                            |           |      |
| TASK-098 | Verify TypeScript compilation with new type imports                                                                 |           |      |
| TASK-099 | Run full test suite to verify type safety                                                                           |           |      |
| TASK-100 | Generate type documentation with TypeDoc (optional)                                                                 |           |      |
| TASK-101 | Update documentation with type system architecture                                                                  |           |      |

## 3. Alternatives

### Alternative Approach 1: Big Bang Refactoring

- **ALT-001**: Perform all refactoring in a single phase instead of incremental approach
  - **Rejected Reason**: High risk of breaking changes, difficult to test incrementally, no safe rollback points
  - **Risk Assessment**: Would require extensive regression testing and long feature freeze

### Alternative Approach 2: Keep Monolithic Structure

- **ALT-002**: Maintain current flat structure but improve code quality within existing files
  - **Rejected Reason**: Does not address scalability issues, continues technical debt accumulation
  - **Risk Assessment**: Makes future feature additions increasingly difficult

### Alternative Approach 3: Microservices Architecture

- **ALT-003**: Split into multiple function apps (one per domain)
  - **Rejected Reason**: Over-engineering for current scale, increases deployment complexity, higher infrastructure costs
  - **Risk Assessment**: Would require significant infrastructure changes and CI/CD updates

### Alternative Approach 4: Use Class-Based Controllers

- **ALT-004**: Implement object-oriented controller classes instead of functional handlers
  - **Rejected Reason**: Adds complexity without clear benefits, not idiomatic for Azure Functions v4 model
  - **Risk Assessment**: Conflicts with Azure Functions best practices for stateless functions

### Alternative Approach 5: API Gateway Pattern

- **ALT-005**: Implement an API gateway layer to handle routing centrally
  - **Rejected Reason**: Azure Functions already provides routing, adds unnecessary layer
  - **Risk Assessment**: Increases latency and complexity without addressing core organization issues

## 4. Dependencies

### Internal Dependencies

- **DEP-001**: Phase 2 depends on Phase 1 completion (middleware must exist before extracting services)
- **DEP-002**: Phase 3 depends on Phase 2 completion (services must exist before reorganizing folder structure)
- **DEP-003**: Phase 4 depends on Phase 3 completion (files must be in new locations before changing routes)
- **DEP-004**: Phase 5 can run parallel to Phases 1-4 (type extraction is independent)

### External Dependencies

- **DEP-005**: `@azure/functions` v4.x npm package (already installed)
- **DEP-006**: `mssql` library for database operations (already installed)
- **DEP-007**: `@azure/storage-blob` for blob storage operations (already installed)
- **DEP-008**: `@azure/storage-queue` for queue operations (already installed)
- **DEP-009**: `openai` npm package for AI operations (already installed)
- **DEP-010**: `@azure/ai-form-recognizer` for document intelligence (already installed)
- **DEP-011**: Vitest testing framework (already installed)
- **DEP-012**: ESLint and Prettier for code quality (already installed)

### Infrastructure Dependencies

- **DEP-013**: Azure Functions runtime v4.x in deployment environments
- **DEP-014**: Azure SQL Database for document storage
- **DEP-015**: Azure Blob Storage account for documents and bronze-layer
- **DEP-016**: Azure Storage Queue for async processing
- **DEP-017**: Azure Document Intelligence service
- **DEP-018**: Azure OpenAI service (GPT-4o deployment)

### Documentation Dependencies

- **DEP-019**: OpenAPI specification tool for API documentation (Phase 4)
- **DEP-020**: TypeDoc for type documentation generation (Phase 5, optional)

## 5. Files

### New Files to Create

#### Phase 1: Middleware

- **FILE-001**: `code/src/middleware/cors.ts` - CORS middleware
- **FILE-002**: `code/src/middleware/auth.ts` - Authentication middleware
- **FILE-003**: `code/src/middleware/rate-limit.ts` - Rate limiting middleware
- **FILE-004**: `code/src/middleware/error-handler.ts` - Error handling middleware
- **FILE-005**: `code/src/middleware/index.ts` - Barrel exports

#### Phase 2: Services

- **FILE-006**: `code/src/services/document-service.ts` - Document business logic
- **FILE-007**: `code/src/services/vendor-service.ts` - Vendor business logic
- **FILE-008**: `code/src/services/version-service.ts` - Version management logic
- **FILE-009**: `code/src/services/ai-service.ts` - AI/OpenAI integration
- **FILE-010**: `code/src/services/ocr-service.ts` - Document Intelligence integration
- **FILE-011**: `code/src/services/storage-service.ts` - Blob storage operations
- **FILE-012**: `code/src/services/index.ts` - Barrel exports

#### Phase 3: Reorganized Functions

- **FILE-013**: `code/src/functions/http/documents/upload.ts`
- **FILE-014**: `code/src/functions/http/documents/get-results.ts`
- **FILE-015**: `code/src/functions/http/documents/delete.ts`
- **FILE-016**: `code/src/functions/http/documents/reprocess.ts`
- **FILE-017**: `code/src/functions/http/documents/confirm.ts`
- **FILE-018**: `code/src/functions/http/documents/ai-mapper.ts`
- **FILE-019**: `code/src/functions/http/vendors/delete.ts`
- **FILE-020**: `code/src/functions/http/versions/history.ts`
- **FILE-021**: `code/src/functions/http/versions/delete-run.ts`
- **FILE-022**: `code/src/functions/http/admin/usage.ts`
- **FILE-023**: `code/src/functions/http/health/sanity.ts`
- **FILE-024**: `code/src/functions/queues/ai-product-mapper.ts`
- **FILE-025**: `code/src/functions/blobs/document-processor.ts`
- **FILE-026**: `code/src/functions/timers/scheduled-cleanup.ts`

#### Phase 5: Models

- **FILE-027**: `code/src/models/document.ts`
- **FILE-028**: `code/src/models/vendor.ts`
- **FILE-029**: `code/src/models/product.ts`
- **FILE-030**: `code/src/models/version.ts`
- **FILE-031**: `code/src/models/api-responses.ts`
- **FILE-032**: `code/src/models/ocr.ts`
- **FILE-033**: `code/src/models/usage.ts`
- **FILE-034**: `code/src/models/index.ts`

### Files to Modify

- **FILE-035**: `code/src/functions/api.ts` - Extract handlers, then delete
- **FILE-036**: `code/src/functions/getResults.ts` - Move to new location
- **FILE-037**: `code/src/functions/aiProductMapper.ts` - Move to new location
- **FILE-038**: `code/src/functions/aiProductMapperQueue.ts` - Move to new location
- **FILE-039**: `code/src/functions/documentProcessor.ts` - Move to new location
- **FILE-040**: `code/src/functions/scheduledCleanup.ts` - Move to new location
- **FILE-041**: `code/src/functions/sanity.ts` - Move to new location
- **FILE-042**: `code/package.json` - Update main field for glob pattern
- **FILE-043**: `code/test/unit/*.test.ts` - Update imports and paths
- **FILE-044**: `code/test/integration/*.test.ts` - Update imports and API routes
- **FILE-045**: `code/test/e2e/*.test.ts` - Update imports and API routes
- **FILE-046**: `code/test/test-client.html` - Update API endpoints
- **FILE-047**: `code/test/results-viewer.html` - Update API endpoints

### Files to Delete

- **FILE-048**: `code/src/functions/api.ts` - After all handlers extracted (Phase 3)
- **FILE-049**: `code/src/functions/getResults.ts` - After moved (Phase 3)
- **FILE-050**: `code/src/functions/aiProductMapper.ts` - After moved (Phase 3)
- **FILE-051**: `code/src/functions/aiProductMapperQueue.ts` - After moved (Phase 3)
- **FILE-052**: `code/src/functions/documentProcessor.ts` - After moved (Phase 3)
- **FILE-053**: `code/src/functions/scheduledCleanup.ts` - After moved (Phase 3)
- **FILE-054**: `code/src/functions/sanity.ts` - After moved (Phase 3)

## 6. Testing

### Unit Tests

- **TEST-001**: Create unit tests for CORS middleware (`withCors` function)
- **TEST-002**: Create unit tests for auth middleware (`withAuth` function)
- **TEST-003**: Create unit tests for rate-limit middleware (`withRateLimit` function)
- **TEST-004**: Create unit tests for error-handler middleware (`withErrorHandler` function)
- **TEST-005**: Create unit tests for DocumentService class methods
- **TEST-006**: Create unit tests for VendorService class methods
- **TEST-007**: Create unit tests for VersionService class methods
- **TEST-008**: Create unit tests for AIService class methods
- **TEST-009**: Create unit tests for OCRService class methods
- **TEST-010**: Create unit tests for StorageService class methods
- **TEST-011**: Update existing unit tests to work with new file locations

### Integration Tests

- **TEST-012**: Verify upload endpoint works with middleware and service layer
- **TEST-013**: Verify deleteVendor endpoint works with middleware and service layer
- **TEST-014**: Verify reprocessMapping endpoint works with new structure
- **TEST-015**: Verify confirmMapping endpoint works with new structure
- **TEST-016**: Verify getVersionHistory endpoint works with new structure
- **TEST-017**: Verify deleteRun endpoint works with new structure
- **TEST-018**: Verify deleteDocument endpoint works with new structure
- **TEST-019**: Verify demoUsage endpoint works with new structure
- **TEST-020**: Verify getResults endpoint works with new structure
- **TEST-021**: Verify aiProductMapper endpoint works with new structure
- **TEST-022**: Update all integration tests to use new API routes (Phase 4)

### E2E Tests

- **TEST-023**: Verify golden-dataset E2E test passes with new structure
- **TEST-024**: Verify upload-to-completion E2E test passes with new structure
- **TEST-025**: Update E2E tests to use new API routes (Phase 4)
- **TEST-026**: Add E2E test for complete document lifecycle with new API

### Regression Tests

- **TEST-027**: Run full test suite after Phase 1 completion
- **TEST-028**: Run full test suite after Phase 2 completion
- **TEST-029**: Run full test suite after Phase 3 completion
- **TEST-030**: Run full test suite after Phase 4 completion
- **TEST-031**: Run full test suite after Phase 5 completion

### Performance Tests

- **TEST-032**: Measure cold start time before and after refactoring
- **TEST-033**: Measure function execution time before and after refactoring
- **TEST-034**: Verify no memory leaks with new service layer
- **TEST-035**: Verify database connection pooling efficiency maintained

### Manual Verification Tests

- **TEST-036**: Test local function execution with `func start` after each phase
- **TEST-037**: Deploy to development environment and smoke test after each phase
- **TEST-038**: Verify Application Insights logging still works correctly
- **TEST-039**: Verify bronze-layer storage audit trail still functions
- **TEST-040**: Test API with test-client.html after Phase 4

## 7. Risks & Assumptions

### High-Priority Risks

- **RISK-001**: Breaking changes in API routes during Phase 4 could affect external consumers
  - **Mitigation**: Implement backward compatibility layer with deprecation warnings
  - **Likelihood**: High
  - **Impact**: High

- **RISK-002**: Import path updates during Phase 3 could cause runtime errors
  - **Mitigation**: Comprehensive TypeScript compilation and test suite execution
  - **Likelihood**: Medium
  - **Impact**: High

- **RISK-003**: Service layer abstraction could introduce performance overhead
  - **Mitigation**: Performance testing and benchmarking after Phase 2
  - **Likelihood**: Low
  - **Impact**: Medium

### Medium-Priority Risks

- **RISK-004**: Middleware composition could create unexpected behavior with error handling
  - **Mitigation**: Comprehensive error handling tests and proper error propagation
  - **Likelihood**: Medium
  - **Impact**: Medium

- **RISK-005**: Singleton client patterns in services could cause connection issues
  - **Mitigation**: Use existing proven singleton patterns from current codebase
  - **Likelihood**: Low
  - **Impact**: Medium

- **RISK-006**: Test updates could miss edge cases during migration
  - **Mitigation**: Run tests after each incremental change, maintain test coverage metrics
  - **Likelihood**: Medium
  - **Impact**: Medium

### Low-Priority Risks

- **RISK-007**: Documentation could become outdated during multi-phase refactoring
  - **Mitigation**: Update documentation at end of each phase
  - **Likelihood**: High
  - **Impact**: Low

- **RISK-008**: Type definition centralization could reveal existing type inconsistencies
  - **Mitigation**: Address type issues incrementally, don't block progress
  - **Likelihood**: Medium
  - **Impact**: Low

### Critical Assumptions

- **ASSUMPTION-001**: All existing tests are comprehensive and accurate
  - **Validation**: Review test coverage before starting refactoring

- **ASSUMPTION-002**: No breaking changes needed in database schema
  - **Validation**: Confirm with database schema review

- **ASSUMPTION-003**: Current Azure Functions configuration supports new folder structure
  - **Validation**: Test `func start` with new structure early

- **ASSUMPTION-004**: External API consumers can be notified of route changes
  - **Validation**: Identify and contact all API consumers before Phase 4

- **ASSUMPTION-005**: Development and staging environments available for testing
  - **Validation**: Confirm environment access and deployment pipeline

- **ASSUMPTION-006**: No new features will be added during refactoring period
  - **Validation**: Coordinate with product team to freeze features

- **ASSUMPTION-007**: Team has capacity for 10-13 days of focused refactoring work
  - **Validation**: Confirm team availability and sprint planning

### Success Criteria

- **SUCCESS-001**: All existing tests pass after each phase
- **SUCCESS-002**: No increase in cold start times (< 5% degradation acceptable)
- **SUCCESS-003**: Zero production incidents related to refactoring
- **SUCCESS-004**: Code duplication reduced by > 60%
- **SUCCESS-005**: Average handler file size < 100 lines
- **SUCCESS-006**: All handlers use middleware consistently
- **SUCCESS-007**: All business logic extracted to service layer
- **SUCCESS-008**: RESTful API conventions implemented (Phase 4)
- **SUCCESS-009**: Type system centralized with zero duplicate definitions
- **SUCCESS-010**: Documentation updated and accurate

## 8. Related Specifications / Further Reading

### Research Documentation

- [Azure Functions Refactoring Research (2026-01-29)](project-management/research/20260129-azure-functions-refactoring-research.md)

### Azure Functions Documentation

- [Azure Functions Node.js Developer Guide](https://learn.microsoft.com/en-us/azure/azure-functions/functions-reference-node)
- [Azure Functions Best Practices](https://learn.microsoft.com/en-us/azure/azure-functions/functions-best-practices)
- [Azure Functions Hosting Options](https://learn.microsoft.com/en-us/azure/azure-functions/functions-scale)

### TypeScript & Code Quality

- [TypeScript Handbook - Modules](https://www.typescriptlang.org/docs/handbook/modules.html)
- [ESLint TypeScript Plugin](https://typescript-eslint.io/)

### Architecture Patterns

- [Clean Architecture Principles](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [Middleware Pattern in Node.js](https://expressjs.com/en/guide/writing-middleware.html)
- [Repository Pattern](https://martinfowler.com/eaaCatalog/repository.html)

### Testing

- [Vitest Documentation](https://vitest.dev/)
- [Testing Azure Functions](https://learn.microsoft.com/en-us/azure/azure-functions/functions-test-a-function)

### Project Documentation

- [Azure Functions TypeScript Instructions](.github/instructions/azure-functions-typescript.instructions.md)
- [Spec-Driven Workflow v1](.github/instructions/spec-driven-workflow-v1.instructions.md)
