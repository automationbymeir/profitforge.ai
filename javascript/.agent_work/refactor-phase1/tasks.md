# Tasks - Azure Functions JavaScript Refactoring Phase 1

**Project:** Azure Functions Refactoring - Extract Middleware Layer  
**Phase:** 1 of 5  
**Date:** 2026-01-29  
**Status:** In Progress

## Task List

| Task ID  | Description                                                           | Status         | Dependencies | Completed Date |
| -------- | --------------------------------------------------------------------- | -------------- | ------------ | -------------- |
| TASK-001 | Create `src/middleware/` directory structure                          | 🔜 Not Started | None         |                |
| TASK-002 | Implement `src/middleware/cors.ts` with `withCors()`                  | 🔜 Not Started | TASK-001     |                |
| TASK-003 | Implement `src/middleware/auth.ts` with `withAuth()`                  | 🔜 Not Started | TASK-001     |                |
| TASK-004 | Implement `src/middleware/rate-limit.ts` with `withRateLimit()`       | 🔜 Not Started | TASK-001     |                |
| TASK-005 | Implement `src/middleware/error-handler.ts` with `withErrorHandler()` | 🔜 Not Started | TASK-001     |                |
| TASK-006 | Create `src/middleware/index.ts` barrel export                        | 🔜 Not Started | TASK-002-005 |                |
| TASK-007 | Refactor `uploadHandler` to use middleware (pilot)                    | 🔜 Not Started | TASK-006     |                |
| TASK-008 | Refactor `deleteVendorHandler` to use middleware (pilot)              | 🔜 Not Started | TASK-007     |                |
| TASK-009 | Run unit tests to verify middleware functionality                     | 🔜 Not Started | TASK-008     |                |
| TASK-010 | Run integration tests to verify no behavioral changes                 | 🔜 Not Started | TASK-009     |                |
| TASK-011 | Roll out middleware to remaining 6 HTTP handlers in `api.ts`          | 🔜 Not Started | TASK-010     |                |
| TASK-012 | Update `src/functions/getResults.ts` to use middleware                | 🔜 Not Started | TASK-010     |                |
| TASK-013 | Update `src/functions/aiProductMapper.ts` to use middleware           | 🔜 Not Started | TASK-010     |                |
| TASK-014 | Run full test suite (unit, integration, E2E)                          | 🔜 Not Started | TASK-011-013 |                |
| TASK-015 | Remove duplicated CORS header code from all handlers                  | 🔜 Not Started | TASK-014     |                |
| TASK-016 | Update documentation with middleware usage examples                   | 🔜 Not Started | TASK-015     |                |

## Detailed Task Specifications

### TASK-001: Create middleware directory structure

**Objective:** Set up folder structure for middleware modules

**Actions:**

- Create `javascript/src/middleware/` directory
- Prepare for middleware implementations

**Expected Outcome:**

- Directory exists: `javascript/src/middleware/`
- Ready for middleware file creation

**Validation:**

- Directory exists
- No build errors

---

### TASK-002: Implement CORS middleware

**Objective:** Create reusable CORS middleware to eliminate header duplication

**Implementation:**

```typescript
// javascript/src/middleware/cors.ts
import { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

type Handler = (req: HttpRequest, context: InvocationContext) => Promise<HttpResponseInit>;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
} as const;

export function withCors(handler: Handler): Handler {
  return async (req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    // Handle OPTIONS preflight
    if (req.method === 'OPTIONS') {
      return {
        status: 204,
        headers: CORS_HEADERS,
      };
    }

    // Execute handler
    const response = await handler(req, context);

    // Merge CORS headers with response headers
    return {
      ...response,
      headers: {
        ...CORS_HEADERS,
        ...response.headers,
      },
    };
  };
}
```

**Expected Outcome:**

- File created: `javascript/src/middleware/cors.ts`
- TypeScript compiles without errors
- CORS headers added to all responses

**Validation:**

- TypeScript build succeeds
- OPTIONS requests return 204
- CORS headers present in responses

---

### TASK-003: Implement authentication middleware

**Objective:** Create reusable auth middleware for API key validation

**Implementation:**

```typescript
// javascript/src/middleware/auth.ts
import { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { errorResponse } from '../utils/httpHelpers.js';

type Handler = (req: HttpRequest, context: InvocationContext) => Promise<HttpResponseInit>;

export function withAuth(handler: Handler): Handler {
  return async (req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    // Skip auth if not in demo mode
    if (process.env.IS_DEMO_MODE !== 'true') {
      return handler(req, context);
    }

    // Extract API key from header
    const providedKey = req.headers.get('x-api-key');

    // Validate API key
    if (!providedKey) {
      context.warn('API key validation failed: Missing API key');
      return errorResponse('Missing API key. Include x-api-key header.', 401);
    }

    if (providedKey !== process.env.DEMO_API_KEY) {
      context.warn('API key validation failed: Invalid API key');
      return errorResponse('Invalid API key', 401);
    }

    // API key valid, execute handler
    return handler(req, context);
  };
}
```

**Expected Outcome:**

- File created: `javascript/src/middleware/auth.ts`
- API key validation works in demo mode
- Auth skipped when not in demo mode

**Validation:**

- Returns 401 for missing/invalid keys (demo mode)
- Allows requests with valid keys
- Skips validation when IS_DEMO_MODE !== 'true'

---

### TASK-004: Implement rate limiting middleware

**Objective:** Create reusable rate limiting middleware

**Implementation:**

```typescript
// javascript/src/middleware/rate-limit.ts
import { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { checkDailyUploadLimit, checkIpRateLimit } from '../utils/usageTracker.js';
import { errorResponse } from '../utils/httpHelpers.js';

type Handler = (req: HttpRequest, context: InvocationContext) => Promise<HttpResponseInit>;

export function withRateLimit(handler: Handler): Handler {
  return async (req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    // Skip rate limiting if not in demo mode
    if (process.env.IS_DEMO_MODE !== 'true') {
      return handler(req, context);
    }

    // Extract client IP
    const clientIp =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      req.headers.get('x-real-ip') ||
      'unknown';

    // Check IP rate limit
    const ipLimitCheck = await checkIpRateLimit(clientIp);
    if (!ipLimitCheck.allowed) {
      context.info(`IP rate limit exceeded for ${clientIp}`);
      return errorResponse('Too many requests from this IP address. Please try again later.', 429);
    }

    // Check daily upload limit
    const dailyLimitCheck = await checkDailyUploadLimit();
    if (!dailyLimitCheck.allowed) {
      context.info('Daily upload limit reached');
      return errorResponse('Daily upload limit reached. Please try again tomorrow.', 429);
    }

    // Within limits, execute handler
    return handler(req, context);
  };
}
```

**Expected Outcome:**

- File created: `javascript/src/middleware/rate-limit.ts`
- IP and daily limits enforced in demo mode
- Rate limiting skipped when not in demo mode

**Validation:**

- Returns 429 when limits exceeded
- Allows requests within limits
- Skips validation when IS_DEMO_MODE !== 'true'

---

### TASK-005: Implement error handler middleware

**Objective:** Create centralized error handling middleware

**Implementation:**

```typescript
// javascript/src/middleware/error-handler.ts
import { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { errorResponse } from '../utils/httpHelpers.js';

type Handler = (req: HttpRequest, context: InvocationContext) => Promise<HttpResponseInit>;

export function withErrorHandler(handler: Handler): Handler {
  return async (req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      return await handler(req, context);
    } catch (error) {
      // Log error with context
      context.error('Unhandled error in handler:', {
        url: req.url,
        method: req.method,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Return generic error response
      return errorResponse('Internal Server Error', 500, 'An unexpected error occurred');
    }
  };
}
```

**Expected Outcome:**

- File created: `javascript/src/middleware/error-handler.ts`
- All handler errors caught and logged
- Generic error responses prevent information leakage

**Validation:**

- Handler errors return 500
- Errors logged with context
- No sensitive data in responses

---

### TASK-006: Create barrel export

**Objective:** Centralize middleware exports for convenient imports

**Implementation:**

```typescript
// javascript/src/middleware/index.ts
export { withCors } from './cors.js';
export { withAuth } from './auth.js';
export { withRateLimit } from './rate-limit.js';
export { withErrorHandler } from './error-handler.js';
```

**Expected Outcome:**

- File created: `javascript/src/middleware/index.ts`
- All middleware can be imported from single module

**Validation:**

- Import statement works: `import { withCors, withAuth } from '../middleware/index.js'`
- TypeScript build succeeds

---

### TASK-007: Pilot - Refactor uploadHandler

**Objective:** Migrate uploadHandler to use middleware composition

**Current State:** Inline CORS, auth, rate limiting in handler  
**Target State:** Pure business logic with middleware wrapper

**Implementation Steps:**

1. Extract business logic to `uploadHandlerCore`
2. Remove inline CORS header code
3. Remove inline API key validation
4. Remove inline rate limiting checks
5. Apply middleware composition
6. Update function registration to use OPTIONS method

**Expected Outcome:**

- uploadHandler uses middleware
- No inline CORS/auth/rate-limit code
- All existing tests pass

**Validation:**

- Unit tests pass
- Integration test: `upload-api.integration.test.ts` passes
- API behavior unchanged

---

### TASK-008: Pilot - Refactor deleteVendorHandler

**Objective:** Migrate deleteVendorHandler to use middleware composition

**Implementation Steps:**

1. Extract business logic to `deleteVendorHandlerCore`
2. Remove inline CORS header code
3. Remove inline API key validation
4. Apply middleware composition
5. Update function registration to use OPTIONS method

**Expected Outcome:**

- deleteVendorHandler uses middleware
- No inline CORS/auth code
- All existing tests pass

**Validation:**

- Unit tests pass
- Integration test: `delete-vendor.integration.test.ts` passes
- API behavior unchanged

---

### TASK-009: Run unit tests

**Objective:** Verify middleware functionality with unit tests

**Actions:**

- Run: `npm test -- test/unit/middleware/`
- Fix any failing tests

**Expected Outcome:**

- All middleware unit tests pass
- Coverage > 90% for middleware functions

**Validation:**

- Test output shows green
- No errors or warnings

---

### TASK-010: Run integration tests

**Objective:** Verify pilot handlers work correctly with middleware

**Actions:**

- Run: `npm test -- test/integration/upload-api.integration.test.ts`
- Run: `npm test -- test/integration/delete-vendor.integration.test.ts`
- Fix any failing tests

**Expected Outcome:**

- Both integration tests pass
- API behavior unchanged

**Validation:**

- Tests pass
- Response format unchanged
- Status codes correct

---

### TASK-011: Roll out to remaining handlers

**Objective:** Apply middleware to 6 remaining handlers in api.ts

**Handlers to Migrate:**

1. reprocessMappingHandler
2. confirmMappingHandler
3. getVersionHistoryHandler
4. deleteRunHandler
5. deleteDocumentHandler
6. demoUsageHandler

**Strategy:**

- Migrate 2 handlers at a time
- Run tests after each batch

**Expected Outcome:**

- All 8 handlers in api.ts use middleware
- No inline CORS/auth/rate-limit code

**Validation:**

- Unit tests pass
- Integration tests pass

---

### TASK-012: Update getResults.ts

**Objective:** Apply middleware to getResults function

**Implementation:**

- Refactor getResultsHandler to use middleware
- Remove inline CORS code

**Expected Outcome:**

- getResults uses middleware
- Integration test passes

**Validation:**

- Test: `test/integration/get-results-api.integration.test.ts` passes

---

### TASK-013: Update aiProductMapper.ts

**Objective:** Apply middleware to aiProductMapper function

**Implementation:**

- Refactor aiProductMapperHandler to use middleware
- Remove inline CORS code

**Expected Outcome:**

- aiProductMapper uses middleware
- Tests pass

**Validation:**

- Unit test passes

---

### TASK-014: Run full test suite

**Objective:** Comprehensive validation of Phase 1 changes

**Actions:**

- Run: `npm test`
- Verify unit, integration, and E2E tests

**Expected Outcome:**

- All tests pass (unit, integration, E2E)
- No regressions

**Validation:**

- Test summary shows all green
- E2E tests: `golden-dataset.e2e.test.ts`, `upload-to-completion.e2e.test.ts` pass

---

### TASK-015: Remove duplicated code

**Objective:** Clean up old inline CORS header code

**Actions:**

- Search for remaining inline CORS header definitions
- Remove duplicated code
- Verify no CORS code outside middleware

**Expected Outcome:**

- CORS headers only in `cors.ts`
- Code duplication reduced by 40%+

**Validation:**

- grep search finds no inline CORS headers
- Code review confirms cleanup

---

### TASK-016: Update documentation

**Objective:** Document middleware architecture and usage

**Files to Update:**

- `docs/api.md` - Add middleware section
- `README.md` - Add usage examples
- `.github/instructions/azure-functions-typescript.instructions.md` - Add middleware patterns

**Expected Outcome:**

- Documentation reflects new architecture
- Usage examples provided
- Guidelines for new functions

**Validation:**

- Documentation reviewed
- Examples accurate

---

## Progress Tracking

**Phase 1 Status:** 🔜 Not Started  
**Tasks Completed:** 0 / 16  
**Progress:** 0%

**Next Actions:**

1. Start TASK-001: Create middleware directory
2. Implement TASK-002-005: Create middleware functions
3. Execute pilot migration (TASK-007-008)
