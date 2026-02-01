# System Architecture

## Overview

3-stage pipeline for processing vendor product catalogs:

1. **OCR Extraction** - Azure Document Intelligence extracts text and tables
2. **AI Mapping** - GPT-4o maps table columns and extracts structured products
3. **Manual Review** - Human approval before production export

**Tech Stack:**

- Runtime: Node.js 20, TypeScript
- Azure: Functions, Document Intelligence, AI Foundry, SQL Database, Blob Storage
- AI: GPT-4o via Azure OpenAI
- Testing: Vitest, Docker (Azurite, SQL Server)
- Infrastructure: Pulumi (Azure Native)

## Architecture Layers

The application follows a clean, layered architecture separating concerns:

```
┌─────────────────────────────────────────────────────────┐
│ Triggers (HTTP, Blob, Queue, Timer)                    │
│ - Thin routing layer                                    │
│ - Parameter extraction                                  │
│ - Middleware composition                                │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│ Service Layer (Business Logic)                          │
│ - DocumentService, VendorService, OCRService            │
│ - AIService, StorageService, VersionService             │
│ - Orchestrates repositories and external APIs           │
│ - Domain validation and business rules                  │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│ Data Access Layer (Repositories)                        │
│ - DocumentRepository, VendorProductRepository           │
│ - All SQL queries encapsulated                          │
│ - Parameterized queries for security                    │
│ - Connection pooling via singleton pattern              │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│ Database (Azure SQL)                                    │
│ - vvocr.document_processing_results                     │
│ - vvocr.vendor_products                                 │
└─────────────────────────────────────────────────────────┘
```

**Layer Responsibilities:**

- **Triggers**: HTTP routing, parameter extraction, response formatting
- **Services**: Business logic, orchestration, domain validation
- **Repositories**: Database operations, query construction, data mapping
- **Database**: Persistent storage, relational integrity, indexing

## Data Access Layer (DAL)

The DAL uses the **Repository Pattern** to encapsulate all database operations and eliminate embedded SQL from services.

### Repository Architecture

**Core Principles:**

- One repository per domain entity (Document, VendorProduct)
- All SQL queries encapsulated in repository methods
- Services depend on repositories via dependency injection
- Repositories initialized with connection pool from singleton

**Benefits:**

- **Testability**: Services unit test with mocked repositories
- **Maintainability**: SQL changes isolated to repository layer
- **Security**: All queries parameterized, preventing SQL injection
- **Reusability**: Repository methods shared across services
- **Type Safety**: TypeScript interfaces for inputs/outputs

### Repository Classes

#### DocumentRepository

Manages all database operations for `vvocr.document_processing_results` table.

**Key Methods:**

| Method                           | Purpose                             | Returns          |
| -------------------------------- | ----------------------------------- | ---------------- |
| `create(input)`                  | Insert new document record          | UUID (result_id) |
| `findById(id)`                   | Retrieve document by UUID           | Document \| null |
| `findByVendor(vendor)`           | Get all documents for vendor        | Document[]       |
| `findByDocumentPath(path)`       | Find documents by path              | Document[]       |
| `updateOcrResults(id, data)`     | Update OCR extraction results       | void             |
| `updateAiMapping(id, data)`      | Update AI mapping results           | void             |
| `updateExportStatus(id, status)` | Mark document as exported           | void             |
| `deleteById(id)`                 | Delete document by UUID             | void             |
| `deleteByVendor(vendor)`         | Delete all vendor documents         | number           |
| `createReprocessingVersion(id)`  | Create new version for reprocessing | UUID             |

#### VendorProductRepository

Manages all database operations for `vvocr.vendor_products` table.

**Key Methods:**

| Method                          | Purpose                       | Returns         |
| ------------------------------- | ----------------------------- | --------------- |
| `createBulk(products)`          | Insert multiple products      | number (count)  |
| `findByVendor(vendor)`          | Get all products for vendor   | VendorProduct[] |
| `findBySourceDocument(docId)`   | Get products from document    | VendorProduct[] |
| `deleteByVendor(vendor)`        | Delete all vendor products    | number          |
| `deleteBySourceDocument(docId)` | Delete products from document | number          |

## HTTP Handler Architecture

All HTTP endpoints use a **middleware composition pattern** for cross-cutting concerns:

### Middleware Layers

```
Request → Error Handler → CORS → Auth → Rate Limit → Core Handler → Response
```

**Middleware Stack:**

1. **Error Handler** (`withErrorHandler`)
   - Catches unhandled exceptions
   - Logs errors with context to Application Insights
   - Returns standardized 500 responses
   - Ensures consistent error format across all endpoints

2. **CORS** (`withCors`)
   - Adds CORS headers to all responses
   - Handles OPTIONS preflight requests
   - Configurable origins (currently `*` in development)

3. **Authentication** (`withAuth`)
   - Validates `x-api-key` header in demo mode
   - Returns 401 for invalid/missing keys
   - Bypassed in production (uses Azure AD)

4. **Rate Limiting** (`withRateLimit`)
   - IP-based rate limiting: 10 uploads/hour per IP
   - Daily upload limit: 50 uploads/day total
   - Active only in demo mode
   - Returns 429 when limits exceeded

### Handler Composition

Handlers are composed using higher-order functions:

```typescript
export const uploadHandler = withErrorHandler(withCors(withAuth(withRateLimit(uploadHandlerCore))));
```

**Benefits:**

- Separation of concerns
- Consistent error handling
- Testable middleware in isolation
- Easy to add/remove middleware layers
- Type-safe function composition

### Response Format

All handlers return structured responses:

```typescript
// Success
{
  status: 200,
  jsonBody: { /* response data */ }
}

// Error
{
  status: 400,
  jsonBody: { error: "Error message" }
}
```

No longer use stringified `body` - all responses use `jsonBody` for direct object serialization.

## Service Layer

Business logic extracted into reusable service classes shared across HTTP, Queue, Blob, and Timer triggers.

### Architecture Principles

- **Handlers**: Thin routing layer (HTTP/Queue/Blob triggers)
- **Services**: Business logic and data orchestration
- **Utils**: Database connections, validation, helpers
- **Middleware**: Cross-cutting concerns (CORS, auth, error handling)

### Service Classes

| Service             | Responsibility                  | Key Methods                                                                       |
| ------------------- | ------------------------------- | --------------------------------------------------------------------------------- |
| **DocumentService** | Document lifecycle management   | `upload()`, `deleteDocument()`, `getResults()`, `reprocess()`, `confirmMapping()` |
| **VendorService**   | Vendor management               | `deleteVendor()`                                                                  |
| **AIService**       | OpenAI GPT-4o product mapping   | `mapProducts()`                                                                   |
| **OCRService**      | Azure Document Intelligence OCR | `processDocument()`, `queueAIMapping()`                                           |
| **StorageService**  | Azure Blob Storage operations   | `uploadBlob()`, `deleteBlob()`, `downloadBlob()`, `uploadBronzeLayer()`           |
| **VersionService**  | Document version history        | `getHistory()`, `deleteRun()`                                                     |

### Singleton Pattern

All services use singleton pattern for connection pooling and consistent state:

```typescript
let serviceInstance: ServiceClass | null = null;

export function getServiceName(): ServiceClass {
  if (!serviceInstance) {
    serviceInstance = new ServiceClass();
  }
  return serviceInstance;
}
```

**Benefits:**

- Connection pooling (OpenAI, Document Intelligence clients)
- Consistent state across invocations
- Reduced initialization overhead

### Error Handling

Services throw errors with `statusCode` property for HTTP mapping:

```typescript
const error = new Error('Document not found') as Error & { statusCode: number };
error.statusCode = 404;
throw error;
```

Error handler middleware catches and maps to appropriate HTTP responses.

## Folder Structure

Functions organized by domain and trigger type:

```
src/functions/
├── http/                    # HTTP-triggered functions
│   ├── admin/               # Admin operations
│   │   └── cleanup.ts
│   ├── documents/           # Document operations
│   │   ├── upload.ts        # POST /api/documents
│   │   ├── get-results.ts   # GET /api/documents
│   │   ├── delete.ts        # DELETE /api/documents/{id}
│   │   ├── reprocess.ts     # POST /api/documents/{id}/reprocess
│   │   ├── confirm.ts       # POST /api/documents/{id}/confirm
│   │   └── ai-mapper.ts     # POST /api/documents/{id}/mapping
│   ├── health/              # Health checks
│   │   └── sanity.ts
│   ├── vendors/             # Vendor operations
│   │   └── delete.ts        # DELETE /api/vendors/{name}
│   └── versions/            # Version control
│       ├── history.ts       # GET /api/documents/{id}/versions
│       └── delete-run.ts    # DELETE /api/documents/{id}/versions/{runId}
├── queues/                  # Queue-triggered functions
│   └── ai-mapper.ts
├── blobs/                   # Blob-triggered functions
│   └── document-processor.ts
└── timers/                  # Timer-triggered functions
    └── cleanup.ts
```

**Rationale:**

- Clear organization by domain and trigger type
- Improved discoverability
- Easy to add new functions following established patterns
- Supports future microservices extraction

## RESTful API Routes

Phase 4 refactoring (commit: `6fa31cb58`) migrated to RESTful conventions:

| Old Route                                 | New Route                                     | Parameter Change      |
| ----------------------------------------- | --------------------------------------------- | --------------------- |
| `POST /api/upload`                        | `POST /api/documents`                         | No change (form data) |
| `GET /api/getResults`                     | `GET /api/documents`                          | Query params remain   |
| `DELETE /api/deleteDocument?documentId=X` | `DELETE /api/documents/{id}`                  | Query → path param    |
| `POST /api/reprocessMapping` (body.id)    | `POST /api/documents/{id}/reprocess`          | Body → path param     |
| `POST /api/confirmMapping` (body.id)      | `POST /api/documents/{id}/confirm`            | Body → path param     |
| `POST /api/aiProductMapper` (body.id)     | `POST /api/documents/{id}/mapping`            | Body → path param     |
| `DELETE /api/deleteVendor?vendorName=X`   | `DELETE /api/vendors/{name}`                  | Query → path param    |
| `GET /api/getVersionHistory?documentId=X` | `GET /api/documents/{id}/versions`            | Query → path param    |
| `DELETE /api/deleteRun`                   | `DELETE /api/documents/{id}/versions/{runId}` | Body → path params    |

**Benefits:**

- RESTful resource-based URLs
- Clear resource hierarchy (`documents/{id}/versions/{runId}`)
- Standard HTTP methods for CRUD operations
- Easier to document with OpenAPI
- Future-ready for API versioning (`/v1/documents`)

## Data Flow

```
┌─────────────┐
│ Upload PDF  │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────┐
│ Azure Blob Storage                      │
│ ├── uploads/                            │
│ └── bronze-layer/                       │
│     ├── raw/        (original PDFs)     │
│     ├── ocr/        (Document Intel)    │
│     ├── ai-mapping/ (GPT-4o results)    │
│     └── prompts/    (versioned prompts) │
└──────┬──────────────────────────────────┘
       │ (blob trigger)
       ▼
┌─────────────────────────┐
│ Document Intelligence   │
│ - Extract text          │
│ - Parse tables          │
│ - Confidence scores     │
└──────┬──────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│ Azure SQL Database                   │
│ vvocr.document_processing_results    │
│ - status: ocr_complete               │
│ - ocr_result: JSON                   │
└──────┬───────────────────────────────┘
       │ (queue message)
       ▼
┌─────────────────────────┐
│ Azure AI Foundry        │
│ - GPT-4o                │
│ - Column mapping        │
│ - Product extraction    │
└──────┬──────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│ Azure SQL Database                   │
│ - status: completed                  │
│ - llm_mapping_result: JSON           │
│ - product_count: int                 │
└──────┬───────────────────────────────┘
       │ (manual approval)
       ▼
┌──────────────────────────┐
│ vvocr.vendor_products    │
│ (production catalog)     │
└──────────────────────────┘
```

## Database Schema

### `vvocr.document_processing_results`

Main processing table - one record per uploaded document.

**Key columns:**

- `document_id` - UUID primary key
- `vendor_name` - Vendor identifier
- `file_name` - Original filename
- `processing_status` - State machine: pending → ocr_complete → completed → confirmed
- `ocr_result` - Document Intelligence JSON output
- `llm_mapping_result` - Extracted products JSON
- `product_count` - Number of products extracted
- `doc_intel_cost_usd` - OCR cost
- `ai_model_cost_usd` - LLM cost
- `created_at`, `completed_at` - Timestamps

### `vvocr.vendor_products`

Production catalog - only confirmed products.

**Key columns:**

- `product_id` - Auto-increment primary key
- `document_id` - Foreign key to processing results
- `vendor_name` - Denormalized vendor identifier
- `sku` - Vendor SKU
- `name` - Product name
- `unit_price` - Price (decimal)
- `unit_of_measure` - UOM (e.g., "EA", "CS")
- `created_at` - Export timestamp

## Bronze-Layer Storage

All intermediate data retained permanently in `bronze-layer` container:

**Directory structure:**

```
bronze-layer/
├── raw/{vendor}/{timestamp}-{filename}.pdf        # Original uploads
├── ocr/{vendor}/{documentId}.json                 # Document Intelligence output
├── ai-mapping/{vendor}/{documentId}-v{N}.json     # GPT-4o results (versioned)
└── prompts/{vendor}/{documentId}-v{N}.txt         # Exact prompts used
```

**Purpose:**

- Audit trail for compliance
- Reprocess without re-OCR
- Compare prompt versions
- Debug accuracy issues

## Cost Model

### Document Intelligence

- **Rate**: $1.50 per 1,000 pages
- **Calculation**: `pageCount / 1000 * 1.5`
- **Typical**: $0.015 for 10-page PDF

### GPT-4o

- **Input**: $2.50 per 1M tokens → `promptTokens * 0.0025 / 1000`
- **Output**: $10.00 per 1M tokens → `completionTokens * 0.01 / 1000`
- **Typical**: $0.03-0.05 for 10-page PDF

### Total

| Pages | Doc Intel | GPT-4o | Total |
| ----- | --------- | ------ | ----- |
| 10    | $0.02     | $0.03  | $0.05 |
| 50    | $0.08     | $0.07  | $0.15 |
| 100   | $0.15     | $0.15  | $0.30 |

Costs tracked per document in `doc_intel_cost_usd` and `ai_model_cost_usd` columns.

## Versioned Reprocessing

**Use case**: Improve prompt without re-running expensive OCR.

**Flow:**

1. Initial run: `ai-mapping/doc-uuid-v1.json`
2. Tune prompt in code
3. POST `/api/documents/{id}/reprocess` → resets status to `ocr_complete`
4. POST `/api/documents/{id}/mapping` → creates `ai-mapping/doc-uuid-v2.json`
5. Compare versions in bronze-layer

**Benefits:**

- Fast iteration on prompt quality
- No additional OCR costs
- Historical comparison of prompt effectiveness

## Error Handling

### Transient Failures

- **Document Intelligence timeout**: Retry with exponential backoff (3 attempts)
- **Azure SQL deadlock**: Automatic retry by Azure Functions runtime
- **Storage throttling**: Built-in retry with Azurite SDK

### Permanent Failures

- **Corrupt PDF**: Status set to `failed`, error logged in `processing_status` column
- **Invalid OCR output**: Status remains `ocr_complete`, manual intervention required
- **LLM parsing error**: Status set to `failed`, raw LLM response logged

All errors logged to Application Insights with correlation IDs.

## Security

- **Service Principal**: Limited to `vvocr` schema, cannot access customer data
- **Secrets**: Stored in Azure Key Vault, injected via Function App settings
- **Network**: Functions communicate via Azure backbone (no public internet)
- **Audit**: All operations logged with user identity and timestamp

## Refactoring History

The codebase underwent a comprehensive 5-phase refactoring (Jan 2026) transforming a monolithic 1,315-line `api.ts` file into a clean, maintainable, domain-driven architecture.

### Phase 1: Middleware Extraction

Extracted cross-cutting concerns into reusable middleware:

- CORS handling → `cors.ts`
- Authentication → `auth.ts`
- Rate limiting → `rate-limit.ts`
- Error handling → `error-handler.ts`

### Phase 2: Service Layer Creation

Extracted business logic into dedicated service classes:

- DocumentService, VendorService, AIService, OCRService, StorageService, VersionService
- Singleton pattern for connection pooling
- Testable services independent of HTTP concerns

### Phase 3: Folder Reorganization

**Commit**: `28f259dec`

Reorganized from flat structure to domain-based hierarchy:

- HTTP functions → `http/{domain}/`
- Queue triggers → `queues/`
- Blob triggers → `blobs/`
- Timer triggers → `timers/`

### Phase 4: RESTful API Routes

**Commit**: `6fa31cb58`

Migrated to RESTful conventions:

- Resource-based URLs (`/api/documents/{id}`)
- Route parameters instead of query strings or body
- Standard HTTP methods for CRUD operations

### Phase 5: Type Model Extraction

**Commit**: `c260780c6`

Centralized all domain types into `src/models/`:

- 744 lines of documented types
- Eliminated type duplication across services
- Single source of truth for domain contracts
- Ready for OpenAPI schema generation

### Metrics

**Before:** 1 monolithic file (1,315 lines), mixed concerns, type duplication, flat structure

**After:**

- 14 HTTP functions across 4 domain folders
- Separated concerns: Middleware (5 files), Services (6 files), Models (8 files)
- Type system: 744 lines of centralized types
- RESTful routes with resource-based URLs

**Benefits:**

- Faster feature development (clear patterns)
- Easier debugging (logic separated by layer)
- More testable (services unit tested independently)
- Simpler refactoring (changes isolated to specific layers)
- Easy to extend (add functions following patterns)

## Testing Strategy

See [testing.md](testing.md) for comprehensive test strategy, coverage, and examples.

## Deployment

See [deployment.md](deployment.md) for Pulumi infrastructure deployment guide.

## References

- [API Reference](api.md) - Endpoint documentation
- [Testing Guide](testing.md) - Test strategy and execution
- [Deployment Guide](deployment.md) - Infrastructure provisioning
- Refactoring commits: `28f259dec`, `6fa31cb58`, `c260780c6`
