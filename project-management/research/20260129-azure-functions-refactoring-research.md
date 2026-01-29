<!-- markdownlint-disable-file -->

# Task Research Notes: Azure Functions JavaScript Folder Refactoring

## Research Executed

### File Analysis

#### Current Structure Analysis

- **javascript/src/functions/api.ts** (1315 lines)
  - Contains 10 HTTP endpoints in single file
  - Functions: upload, deleteVendor, reprocessMapping, confirmMapping, getVersionHistory, deleteRun, deleteDocument, demoUsage
  - Mix of CRUD operations, vendor management, document lifecycle, demo utilities
  - Significant code duplication in CORS handling, database connections, error handling
  - Inline helper functions mixed with business logic

- **javascript/src/functions/documentProcessor.ts** (232 lines)
  - Blob-triggered OCR processing function
  - Integrates Azure Document Intelligence API
  - Bronze-layer storage management
  - Queue integration for next step

- **javascript/src/functions/aiProductMapper.ts** (516 lines)
  - HTTP endpoint for AI mapping
  - OpenAI GPT-4o integration
  - Complex table parsing and product extraction
  - Bronze-layer storage, quality metrics calculation

- **javascript/src/functions/aiProductMapperQueue.ts** (73 lines)
  - Queue-triggered wrapper for aiProductMapper
  - Minimal duplication - good pattern

- **javascript/src/functions/getResults.ts** (176 lines)
  - HTTP GET endpoint for results retrieval
  - Query parameter handling, filtering, versioning logic
  - Database-heavy with complex SQL queries

- **javascript/src/functions/scheduledCleanup.ts** (47 lines)
  - Timer-triggered cleanup function
  - Usage tracking maintenance
  - Clean, focused implementation

- **javascript/src/functions/sanity.ts** (18 lines)
  - Simple hello-world function
  - Test/sanity check endpoint

#### Current Problems Identified

1. **Massive monolithic API file** - 1315 lines with 10 distinct endpoints
2. **No clear separation** between trigger types (HTTP, Blob, Queue, Timer)
3. **Code duplication** in:
   - CORS headers (repeated in every HTTP endpoint)
   - Database connection management (new sql.ConnectionPool pattern repeated)
   - Error handling (try-catch-finally patterns)
   - Response formatting (jsonBody, headers patterns)
4. **Mixed concerns** in api.ts:
   - Document upload (CRUD)
   - Vendor management (CRUD)
   - Document lifecycle (reprocessing, confirmation)
   - Version management (history, deletion)
   - Demo utilities
5. **Inconsistent patterns**:
   - Some functions use `withDatabase` helper (getResults)
   - Others manually manage pool connections (api.ts functions)
6. **No logical grouping** by domain or resource

### Code Search Results

- **app.http registrations**: 11 HTTP endpoints total
  - 10 in api.ts, 1 in aiProductMapper.ts, 1 in getResults.ts
- **app.storageQueue**: 1 queue trigger (aiProductMapperQueue)
- **app.storageBlob**: 1 blob trigger (documentProcessor)
- **app.timer**: 1 timer trigger (scheduledCleanup)

### External Research

#### #fetch:"https://learn.microsoft.com/en-us/azure/azure-functions/functions-reference-node"

**Azure Functions Node.js v4 Programming Model Best Practices:**

- **Recommended folder structure**:

  ```
  <project_root>/
  ├── src/
  │   └── functions/          # All functions
  │       ├── function1.js
  │       └── function2.js
  ├── test/
  │   └── functions/          # Tests mirroring src structure
  ├── host.json
  ├── package.json
  └── local.settings.json
  ```

- **Registration patterns** - Use `app` object from `@azure/functions`:

  ```typescript
  app.http('functionName', { methods: ['POST'], handler: myHandler });
  ```

- **Handler separation** - Handlers should be separate from registration:

  ```typescript
  export async function myHandler(
    request: HttpRequest,
    context: InvocationContext
  ): Promise<HttpResponseInit> {
    // Handler logic
  }

  app.http('myFunction', {
    methods: ['POST'],
    handler: myHandler,
  });
  ```

- **Input/Output patterns**:
  - Trigger input: first argument
  - Return output: function return value
  - Extra inputs/outputs: via `context.extraInputs` and `context.extraOutputs`

- **Helper patterns**:
  - Shared logic should be in separate files
  - Use ES modules or CommonJS consistently
  - Singleton pattern for clients (DB, storage, AI) to avoid connection limits

#### #fetch:"https://learn.microsoft.com/en-us/azure/azure-functions/functions-best-practices"

**Azure Functions Best Practices:**

- **Organize functions by domain**: Group related functions together
- **Avoid long-running functions**: Break into smaller, composable units
- **Write stateless functions**: No in-memory state between invocations
- **Use async/await**: Avoid callback hell
- **Singleton clients**: Reuse connection clients across invocations
- **Separate concerns**: Business logic separate from infrastructure code
- **Error handling**: Use retry patterns, defensive coding
- **CORS configuration**: Centralize CORS setup, don't repeat headers

#### #githubRepo:"Azure/azure-functions-nodejs-library"

**Azure Functions v4 Programming Model Patterns:**

- Functions can be registered from any file loaded by `main` field in `package.json`
- Recommended to use glob patterns: `src/functions/*.js` or `src/{index.js,functions/*.js}`
- Type-specific methods: `app.http()`, `app.timer()`, `app.storageBlob()`, etc.
- Generic method available: `app.generic()` for unsupported types
- Hooks available: `app.hook.preInvocation()`, `app.hook.postInvocation()` for cross-cutting concerns

### Project Conventions

#### From `.github/instructions/azure-functions-typescript.instructions.md`:

- Azure Functions v4 programming model required
- TypeScript with strict mode
- ESLint and Prettier for code quality
- Environment config centralized in `src/utils/config.ts`

#### From existing codebase:

- **Database patterns**: `withDatabase` helper in `src/utils/database.ts` for connection pooling
- **HTTP helpers**: `src/utils/httpHelpers.ts` provides standardized response builders
- **Validation helpers**: `src/utils/validations.ts` for vendor name validation
- **Type guards**: `src/utils/typeGuards.ts` for runtime type checking
- **Constants**: `src/utils/constants.ts` for shared constants

## Key Discoveries

### Project Structure

Current flat structure in `src/functions/` lacks domain organization. All functions are peers with no grouping by:

- Resource type (Documents, Vendors, Results, etc.)
- Trigger type (HTTP, Queue, Blob, Timer)
- Business domain (Upload workflow, AI processing, Admin operations)

### Implementation Patterns

**Good patterns to preserve:**

1. Queue-trigger + HTTP dual access pattern (aiProductMapper)
2. Bronze-layer storage for audit trail
3. `withDatabase` helper for connection management
4. Centralized configuration and validation utilities

**Patterns that need refactoring:**

1. Massive monolithic API file (api.ts) - violates single responsibility
2. Manual database connection management in api.ts (not using helpers)
3. CORS headers repeated in every HTTP handler
4. Error handling patterns duplicated across functions
5. No clear API contract or route organization

### Complete Examples

#### Well-Structured Function (scheduledCleanup.ts)

```typescript
export async function scheduledCleanupHandler(
  timer: Timer,
  context: InvocationContext
): Promise<void> {
  // Single responsibility: cleanup old usage records
  // Clear logging with emojis for visibility
  // Proper error handling
  // Uses utility functions from usageTracker module
}

app.timer('scheduledCleanup', {
  schedule: '0 0 2 * * *',
  handler: scheduledCleanupHandler,
});
```

**Why this works:**

- Handler separated from registration
- Single purpose function
- Uses helpers from utils
- Clear, testable logic

#### Current Anti-Pattern (api.ts excerpts)

```typescript
// 10 different HTTP handlers in one file
// Manual pool management repeated everywhere:
const pool = new sql.ConnectionPool(SQL_CONNECTION_STRING!);
await pool.connect();
try {
  // logic
} finally {
  await pool.close();
}

// CORS headers repeated 10+ times:
return {
  status: 200,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  },
  jsonBody: data,
};
```

### API and Schema Documentation

**Current API Routes (implicit):**

- `POST /api/upload` - Document upload with vendor
- `DELETE /api/deleteVendor` - Delete all vendor documents
- `POST /api/reprocessMapping` - Create new AI mapping version
- `POST /api/confirmMapping` - Export products to production
- `GET /api/getVersionHistory` - Get document versions
- `DELETE /api/deleteRun` - Delete specific version
- `DELETE /api/deleteDocument` - Delete all versions
- `GET /api/demo/usage` - Usage stats (demo mode)
- `POST /api/demo/usage` - Trigger cleanup (demo mode)
- `GET /api/getResults` - Query processed documents
- `POST /api/aiProductMapper` - Manual AI mapping trigger

**Missing:**

- No OpenAPI/Swagger spec
- No versioning strategy
- Inconsistent naming (`deleteVendor` vs `deleteDocument`)
- No clear REST conventions (some use query params, some use body)

### Configuration Examples

**Environment variables pattern (from config.ts):**

```typescript
// Centralized validation and caching
export function getConfig(): AppConfig {
  if (cachedConfig) return cachedConfig;

  assertDefined(process.env.STORAGE_CONNECTION_STRING, 'message');
  // ... validate all required vars

  cachedConfig = {
    /* typed config object */
  };
  return cachedConfig;
}
```

**Database connection pattern (from database.ts):**

```typescript
export async function withDatabase<T>(
  operation: (pool: sql.ConnectionPool) => Promise<T>
): Promise<T> {
  // Automatic retry, connection pooling, error handling
  const pool = await getConnectionPool();
  return await operation(pool);
}
```

### Technical Requirements

Based on codebase analysis:

- **TypeScript**: All functions in TypeScript with proper typing
- **Azure Functions v4**: Using `@azure/functions` v4 programming model
- **Database**: SQL Server with mssql library, connection pooling
- **Storage**: Azure Blob Storage for documents and bronze-layer
- **AI**: OpenAI GPT-4o via Azure AI Project endpoint
- **Document Intelligence**: Azure Document Intelligence for OCR
- **Queue**: Azure Storage Queue for async processing
- **Testing**: Vitest for unit, integration, and E2E tests

## Recommended Approach

### 1. Folder Structure Reorganization

Organize by **business domain + trigger type**:

```
javascript/
├── src/
│   ├── functions/
│   │   ├── http/                    # HTTP-triggered functions
│   │   │   ├── documents/           # Document management domain
│   │   │   │   ├── upload.ts        # POST /api/documents/upload
│   │   │   │   ├── get-results.ts   # GET /api/documents/results
│   │   │   │   ├── delete.ts        # DELETE /api/documents/:id
│   │   │   │   ├── reprocess.ts     # POST /api/documents/:id/reprocess
│   │   │   │   └── confirm.ts       # POST /api/documents/:id/confirm
│   │   │   ├── vendors/             # Vendor management domain
│   │   │   │   └── delete.ts        # DELETE /api/vendors/:name
│   │   │   ├── versions/            # Version management domain
│   │   │   │   ├── history.ts       # GET /api/versions/:docId/history
│   │   │   │   └── delete-run.ts    # DELETE /api/versions/:docId/runs/:runId
│   │   │   ├── admin/               # Admin/demo utilities
│   │   │   │   └── usage.ts         # GET/POST /api/admin/usage
│   │   │   └── health/              # Health checks
│   │   │       └── sanity.ts        # GET /api/health/sanity
│   │   ├── queues/                  # Queue-triggered functions
│   │   │   └── ai-product-mapper.ts # Async AI mapping
│   │   ├── blobs/                   # Blob-triggered functions
│   │   │   └── document-processor.ts # OCR on upload
│   │   ├── timers/                  # Timer-triggered functions
│   │   │   └── scheduled-cleanup.ts # Daily cleanup
│   │   └── index.ts                 # Optional: central registration
│   ├── services/                    # Business logic layer
│   │   ├── document-service.ts      # Document CRUD operations
│   │   ├── vendor-service.ts        # Vendor operations
│   │   ├── ai-service.ts            # AI/OpenAI interactions
│   │   ├── ocr-service.ts           # Document Intelligence operations
│   │   ├── storage-service.ts       # Blob storage operations
│   │   └── version-service.ts       # Version management logic
│   ├── middleware/                  # Cross-cutting concerns
│   │   ├── cors.ts                  # CORS middleware
│   │   ├── auth.ts                  # API key validation
│   │   ├── rate-limit.ts            # Rate limiting checks
│   │   └── error-handler.ts         # Centralized error handling
│   ├── models/                      # Domain models and types
│   │   ├── document.ts              # Document types
│   │   ├── product.ts               # Product types
│   │   ├── vendor.ts                # Vendor types
│   │   └── api-responses.ts         # API response types
│   └── utils/                       # Existing utilities (keep)
│       ├── config.ts
│       ├── database.ts
│       ├── httpHelpers.ts
│       ├── validations.ts
│       └── ...
├── test/
│   ├── unit/
│   │   ├── services/               # Service layer tests
│   │   └── middleware/             # Middleware tests
│   ├── integration/
│   │   ├── documents/              # Document API tests
│   │   └── vendors/                # Vendor API tests
│   └── e2e/                        # End-to-end tests
└── package.json
```

**Benefits:**

- **Clear domain separation**: Documents, Vendors, Versions, Admin
- **Trigger type grouping**: Easy to find HTTP vs Queue vs Blob functions
- **Scalability**: New endpoints go in logical domain folders
- **Testability**: Tests mirror source structure
- **Maintainability**: Small, focused files vs. 1315-line monolith

### 2. API Contract Reorganization

**Current issues:**

- Inconsistent naming (`deleteVendor` vs `deleteDocument`)
- Mixed REST patterns (some use body, some query params)
- No versioning
- Route names don't reflect resource hierarchy

**Proposed RESTful API structure:**

```typescript
// Documents domain
POST   /api/documents                    # Upload document
GET    /api/documents                    # Get all/filtered documents
GET    /api/documents/:id                # Get specific document
DELETE /api/documents/:id                # Delete document + all versions
POST   /api/documents/:id/reprocess      # Create new AI mapping version
POST   /api/documents/:id/confirm        # Export to production

// Vendors domain
DELETE /api/vendors/:name                # Delete vendor (all documents)

// Versions domain (sub-resource of documents)
GET    /api/documents/:id/versions       # Get version history
DELETE /api/documents/:id/versions/:runId # Delete specific version

// Admin domain
GET    /api/admin/usage                  # Usage statistics
POST   /api/admin/usage/cleanup          # Trigger cleanup

// Health domain
GET    /api/health                       # Health check
```

**Benefits:**

- RESTful conventions
- Clear resource hierarchy
- Consistent naming
- Easier to document (OpenAPI spec)
- Version-ready (can add `/v1` prefix later)

### 3. Shared Code Extraction

#### Middleware Layer

**Create `src/middleware/cors.ts`:**

```typescript
import { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
} as const;

export function withCors(
  handler: (req: HttpRequest, ctx: InvocationContext) => Promise<HttpResponseInit>
) {
  return async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    // Handle preflight
    if (req.method === 'OPTIONS') {
      return { status: 200, headers: CORS_HEADERS };
    }

    // Execute handler and add CORS headers
    const response = await handler(req, ctx);
    return {
      ...response,
      headers: { ...CORS_HEADERS, ...response.headers },
    };
  };
}
```

**Create `src/middleware/auth.ts`:**

```typescript
export function withAuth(
  handler: (req: HttpRequest, ctx: InvocationContext) => Promise<HttpResponseInit>
) {
  return async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (process.env.IS_DEMO_MODE !== 'true') {
      return handler(req, ctx);
    }

    const apiKey = req.headers.get('x-api-key');
    if (!apiKey || apiKey !== process.env.DEMO_API_KEY) {
      return unauthorizedError('Invalid or missing API key');
    }

    return handler(req, ctx);
  };
}
```

**Create `src/middleware/rate-limit.ts`:**

```typescript
export function withRateLimit(
  handler: (req: HttpRequest, ctx: InvocationContext) => Promise<HttpResponseInit>
) {
  return async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    // Extract IP and check limits
    const clientIp = getClientIp(req);

    const limitCheck = await checkDailyUploadLimit();
    if (!limitCheck.allowed) {
      return rateLimitError(limitCheck.current, limitCheck.limit, 'midnight UTC');
    }

    const ipCheck = await checkIpRateLimit(clientIp);
    if (!ipCheck.allowed) {
      return rateLimitError(ipCheck.current, ipCheck.limit, ipCheck.resetTime);
    }

    return handler(req, ctx);
  };
}
```

**Usage example:**

```typescript
// src/functions/http/documents/upload.ts
import { withCors } from '../../../middleware/cors';
import { withAuth } from '../../../middleware/auth';
import { withRateLimit } from '../../../middleware/rate-limit';

async function uploadHandler(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  // Pure business logic - no CORS, auth, or rate limit code
  const formData = await req.formData();
  // ... handle upload
}

app.http('upload', {
  methods: ['POST'],
  route: 'documents',
  handler: withCors(withAuth(withRateLimit(uploadHandler))),
});
```

#### Service Layer

**Create `src/services/document-service.ts`:**

```typescript
export class DocumentService {
  async upload(vendorName: string, file: File): Promise<UploadResult> {
    // 1. Validate vendor
    // 2. Check for duplicates
    // 3. Upload to blob
    // 4. Create DB record
    // 5. Return result
  }

  async delete(documentId: string): Promise<void> {
    // 1. Get document + versions
    // 2. Delete blobs
    // 3. Delete DB records
  }

  async getResults(filters: ResultFilters): Promise<Document[]> {
    // Query with filters, pagination
  }

  async reprocess(documentId: string): Promise<ReprocessResult> {
    // Create new version record
  }
}
```

**Create `src/services/vendor-service.ts`:**

```typescript
export class VendorService {
  async delete(vendorName: string): Promise<DeleteResult> {
    // 1. Get all vendor documents
    // 2. Delete all blobs
    // 3. Delete all DB records
  }
}
```

**Create `src/services/ai-service.ts`:**

```typescript
export class AIService {
  private openaiClient: OpenAI;

  constructor() {
    // Initialize OpenAI client (singleton)
  }

  async mapProducts(documentId: string, ocrData: OCRData): Promise<MappingResult> {
    // 1. Column detection prompt
    // 2. Product extraction
    // 3. Quality metrics
    // 4. Store in bronze-layer
    // 5. Update DB
  }
}
```

**Benefits of service layer:**

- Reusable across HTTP and Queue triggers
- Easier to test (no HTTP concerns)
- Clear separation: Functions = routing, Services = business logic
- Can be used from CLI tools, tests, or future APIs

### 4. Model/Type Definitions

**Create `src/models/document.ts`:**

```typescript
export interface Document {
  resultId: string;
  documentName: string;
  documentPath: string;
  vendorName: string;
  processingStatus: 'pending' | 'ocr_complete' | 'completed' | 'failed';
  exportStatus: 'pending' | 'confirmed';
  reprocessingCount: number;
  parentDocumentId?: string;
  // ... other fields
}

export interface UploadRequest {
  file: File;
  vendorName: string;
}

export interface UploadResult {
  resultId: string;
  documentName: string;
  vendorName: string;
  filePath: string;
  status: string;
}
```

**Create `src/models/api-responses.ts`:**

```typescript
export interface ApiResponse<T = unknown> {
  message?: string;
  data?: T;
}

export interface ErrorResponse {
  error: string;
  message?: string;
  details?: unknown;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
```

### 5. Database Access Consolidation

**Issue:** Some functions use `withDatabase` helper, others manually manage pools.

**Solution:** Enforce `withDatabase` usage everywhere:

```typescript
// BAD (current pattern in api.ts):
const pool = new sql.ConnectionPool(SQL_CONNECTION_STRING!);
await pool.connect();
try {
  // query
} finally {
  await pool.close();
}

// GOOD (enforced pattern):
await withDatabase(async (pool) => {
  // query - connection managed automatically
});
```

**Update all HTTP handlers to use withDatabase:**

- Handles connection pooling
- Automatic retry on transient errors
- Consistent error handling
- No forgotten close() calls

## Implementation Guidance

### Phase 1: Extract Middleware (Low Risk)

**Objectives:**

1. Create middleware folder with cors, auth, rate-limit modules
2. Update 2-3 existing handlers to use middleware (pilot)
3. Verify tests still pass
4. Roll out to all HTTP handlers

**Dependencies:** None - purely additive

**Success Criteria:**

- Zero CORS header duplication
- All HTTP handlers use middleware
- Tests pass unchanged

### Phase 2: Create Service Layer (Medium Risk)

**Objectives:**

1. Create services folder with document-service, vendor-service, ai-service
2. Extract business logic from 2-3 handlers into services (pilot)
3. Update handlers to call services
4. Verify tests pass (may need test updates)
5. Roll out to remaining handlers

**Dependencies:** Phase 1 complete

**Success Criteria:**

- Handlers are thin routing layers (<50 lines each)
- Business logic in services, testable independently
- All integration tests pass

### Phase 3: Reorganize Folder Structure (Higher Risk)

**Objectives:**

1. Create new folder structure (http/, queues/, blobs/, timers/)
2. Move functions one domain at a time (documents → vendors → versions → admin)
3. Update imports and tests
4. Update package.json main field to glob pattern

**Dependencies:** Phases 1 & 2 complete

**Success Criteria:**

- All functions in new locations
- Tests updated and passing
- No regression in functionality
- Build and deployment successful

### Phase 4: API Contract Refactoring (Highest Risk)

**Objectives:**

1. Design RESTful API routes (OpenAPI spec)
2. Update function registrations to new routes
3. Add route versioning if needed (/v1)
4. Update clients (tests, documentation)
5. Maintain backward compatibility OR coordinate breaking change

**Dependencies:** Phase 3 complete

**Success Criteria:**

- Consistent RESTful API
- OpenAPI spec documented
- All E2E tests pass
- Client applications updated

### Phase 5: Extract Models (Low Risk, High Value)

**Objectives:**

1. Create models folder with type definitions
2. Replace inline types with imported models
3. Add JSDoc comments for documentation
4. Generate type docs if needed

**Dependencies:** Can run parallel to other phases

**Success Criteria:**

- Centralized type definitions
- No duplicate type declarations
- Better IDE autocomplete
- Type documentation available

---

**Overall Timeline:**

- Phase 1: 1-2 days
- Phase 2: 2-3 days
- Phase 3: 2-3 days
- Phase 4: 3-4 days
- Phase 5: 1 day
- **Total: ~10-13 days** for complete refactoring

**Risk Mitigation:**

- Each phase independently testable
- Can stop after any phase if needed
- Tests act as regression safety net
- Service layer allows incremental migration
- Middleware is backward compatible
