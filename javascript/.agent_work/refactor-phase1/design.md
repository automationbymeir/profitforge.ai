# Design - Azure Functions JavaScript Refactoring Phase 1

**Project:** Azure Functions Refactoring - Extract Middleware Layer  
**Phase:** 1 of 5  
**Date:** 2026-01-29  
**Status:** In Progress

## Architecture Overview

### High-Level Design

```
┌─────────────────────────────────────────────────────────────┐
│                    Azure Functions Runtime                   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Function Registration (app.http)                │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   Middleware Composition                      │
│  withErrorHandler(withCors(withAuth(withRateLimit(handler)))) │
└─────────────────────────────────────────────────────────────┘
           │                │                 │
           ▼                ▼                 ▼
    Error Handler      CORS Headers    Auth + Rate Limit
           │                │                 │
           └────────────────┴─────────────────┘
                            │
                            ▼
                   ┌────────────────┐
                   │  HTTP Handler  │
                   │ (Business Logic)│
                   └────────────────┘
```

### Middleware Pattern

**Higher-Order Function Pattern:**

```typescript
type Handler = (req: HttpRequest, context: InvocationContext) => Promise<HttpResponseInit>;
type Middleware = (handler: Handler) => Handler;
```

**Composition Order (innermost to outermost):**

1. **Handler** - Core business logic
2. **withRateLimit** - Check IP and daily limits (demo mode only)
3. **withAuth** - Validate API key (demo mode only)
4. **withCors** - Add CORS headers and handle OPTIONS
5. **withErrorHandler** - Catch and handle errors

## Component Designs

### 1. CORS Middleware (`src/middleware/cors.ts`)

**Purpose:** Add CORS headers to all responses and handle preflight OPTIONS requests

**Interface:**

```typescript
export function withCors(handler: Handler): Handler;
```

**Implementation Logic:**

1. Check if request method is OPTIONS
   - If yes: Return 204 No Content with CORS headers
   - If no: Continue to handler
2. Execute handler and await response
3. Merge CORS headers with response headers
4. Return response with CORS headers

**CORS Headers:**

- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, x-api-key`

**Error Handling:**

- Propagates handler errors to outer middleware
- Ensures CORS headers are always present

### 2. Authentication Middleware (`src/middleware/auth.ts`)

**Purpose:** Validate API key in demo mode

**Interface:**

```typescript
export function withAuth(handler: Handler): Handler;
```

**Implementation Logic:**

1. Check if IS_DEMO_MODE === 'true'
   - If no: Skip auth, execute handler
   - If yes: Continue to validation
2. Extract x-api-key header from request
3. Validate against DEMO_API_KEY environment variable
   - If missing: Return 401 with "Missing API key" error
   - If invalid: Return 401 with "Invalid API key" error
   - If valid: Continue to handler
4. Execute handler and return response

**Error Responses:**

- 401 Unauthorized for missing/invalid keys
- Use errorResponse() from httpHelpers

**Security Considerations:**

- No API key logging to prevent leaks
- Generic error messages to prevent enumeration

### 3. Rate Limiting Middleware (`src/middleware/rate-limit.ts`)

**Purpose:** Enforce IP-based and daily upload limits in demo mode

**Interface:**

```typescript
export function withRateLimit(handler: Handler): Handler;
```

**Implementation Logic:**

1. Check if IS_DEMO_MODE === 'true'
   - If no: Skip rate limiting, execute handler
   - If yes: Continue to checks
2. Extract client IP from headers:
   - Check x-forwarded-for (split on comma, take first)
   - Fallback to x-real-ip
   - Fallback to 'unknown'
3. Check IP rate limit using checkIpRateLimit()
   - If exceeded: Return 429 Too Many Requests
4. Check daily upload limit using checkDailyUploadLimit()
   - If exceeded: Return 429 Too Many Requests
5. Execute handler and return response

**Dependencies:**

- usageTracker.ts functions (checkIpRateLimit, checkDailyUploadLimit)

**Error Responses:**

- 429 Too Many Requests with descriptive message
- Use errorResponse() from httpHelpers

### 4. Error Handler Middleware (`src/middleware/error-handler.ts`)

**Purpose:** Catch unhandled errors and provide consistent error responses

**Interface:**

```typescript
export function withErrorHandler(handler: Handler): Handler;
```

**Implementation Logic:**

1. Wrap handler in try-catch block
2. Execute handler and return response on success
3. On error:
   - Log error with context.error()
   - Extract error message (sanitized)
   - Return 500 Internal Server Error with generic message
   - Do not expose stack traces or sensitive data

**Error Response:**

```json
{
  "error": "Internal Server Error",
  "message": "An unexpected error occurred"
}
```

**Logging:**

- Log full error object with context
- Include request URL and method
- Include error stack trace in logs only

### 5. Middleware Index (`src/middleware/index.ts`)

**Purpose:** Barrel export for convenient imports

```typescript
export { withCors } from './cors.js';
export { withAuth } from './auth.js';
export { withRateLimit } from './rate-limit.js';
export { withErrorHandler } from './error-handler.js';
```

## Data Flow

### Request Flow with Middleware

```
1. HTTP Request arrives
   ▼
2. Azure Functions Runtime invokes function
   ▼
3. withErrorHandler (outermost)
   │
   ├─► Error occurs? → Log + Return 500
   │
   └─► No error ──────────────┐
                              ▼
4. withCors
   │
   ├─► OPTIONS request? → Return 204 with CORS
   │
   └─► Not OPTIONS ──────────┐
                             ▼
5. withAuth (demo mode only)
   │
   ├─► Invalid key? → Return 401
   │
   └─► Valid ────────────────┐
                             ▼
6. withRateLimit (demo mode only)
   │
   ├─► Rate exceeded? → Return 429
   │
   └─► Within limits ────────┐
                             ▼
7. Handler (business logic)
   │
   └─► Return response ──────┐
                             ▼
8. Response bubbles up through middleware
   │
   └─► CORS headers added ───┐
                             ▼
9. Final response returned to client
```

### Pilot Migration: uploadHandler

**Current Code Pattern:**

```typescript
export async function uploadHandler(req, context) {
  // Inline CORS check
  // Inline API key validation
  // Inline IP rate limit check
  // Inline daily limit check
  // Business logic
  // Manual response building with CORS headers
}
```

**Refactored Code Pattern:**

```typescript
const uploadHandlerCore = async (req, context) => {
  // Pure business logic only
  // No CORS, auth, or rate limiting
  // Use successResponse/errorResponse from httpHelpers
};

export const uploadHandler = withErrorHandler(withCors(withAuth(withRateLimit(uploadHandlerCore))));

app.http('upload', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: uploadHandler,
});
```

## Error Handling Strategy

### Error Matrix

| Error Type           | Middleware       | Status Code | Response                     | Logging |
| -------------------- | ---------------- | ----------- | ---------------------------- | ------- |
| Missing API key      | withAuth         | 401         | "Missing API key"            | Warning |
| Invalid API key      | withAuth         | 401         | "Invalid API key"            | Warning |
| IP rate exceeded     | withRateLimit    | 429         | "Too many requests"          | Info    |
| Daily limit exceeded | withRateLimit    | 429         | "Daily upload limit reached" | Info    |
| Handler error        | withErrorHandler | 500         | "Internal Server Error"      | Error   |
| Validation error     | Handler          | 400         | Specific error               | Info    |

### Error Propagation

1. Handler throws error → Caught by withErrorHandler
2. Middleware returns error response → Passed through outer middleware
3. All error responses include CORS headers (via withCors)

## Testing Strategy

### Unit Tests

**Test Files to Create:**

- `test/unit/middleware/cors.unit.test.ts`
- `test/unit/middleware/auth.unit.test.ts`
- `test/unit/middleware/rate-limit.unit.test.ts`
- `test/unit/middleware/error-handler.unit.test.ts`

**Test Cases per Middleware:**

**CORS Tests:**

- ✓ Adds CORS headers to successful responses
- ✓ Adds CORS headers to error responses
- ✓ Returns 204 for OPTIONS requests
- ✓ Preserves existing response headers
- ✓ Works with multiple middleware layers

**Auth Tests:**

- ✓ Skips auth when IS_DEMO_MODE !== 'true'
- ✓ Returns 401 when API key missing
- ✓ Returns 401 when API key invalid
- ✓ Executes handler when API key valid
- ✓ Logs validation failures

**Rate Limit Tests:**

- ✓ Skips rate limiting when IS_DEMO_MODE !== 'true'
- ✓ Returns 429 when IP rate exceeded
- ✓ Returns 429 when daily limit exceeded
- ✓ Executes handler when within limits
- ✓ Extracts IP correctly from headers

**Error Handler Tests:**

- ✓ Catches handler errors
- ✓ Returns 500 with generic message
- ✓ Logs errors with context
- ✓ Does not expose sensitive data
- ✓ Passes through successful responses

### Integration Tests

**Test Files to Update:**

- `test/integration/upload-api.integration.test.ts`
- `test/integration/delete-vendor.integration.test.ts`

**Test Cases:**

- ✓ Upload with valid API key succeeds
- ✓ Upload with invalid API key fails (demo mode)
- ✓ Upload with rate limit exceeded fails (demo mode)
- ✓ CORS headers present in all responses
- ✓ OPTIONS requests return 204

### Regression Tests

**Validation Criteria:**

- All existing unit tests pass
- All existing integration tests pass
- All existing E2E tests pass
- No changes to API response format
- No changes to status codes (except improved error handling)

## Performance Considerations

### Cold Start Impact

**Mitigation:**

- Middleware functions are simple wrappers (no heavy initialization)
- No additional module imports beyond existing dependencies
- Function composition has negligible overhead

**Measurement:**

- Measure cold start before and after Phase 1
- Target: < 5% increase

### Runtime Performance

**Overhead per Request:**

- CORS: ~0.5ms (header manipulation)
- Auth: ~1ms (string comparison + env lookup)
- Rate Limit: ~2ms (in-memory Map lookups)
- Error Handler: ~0.1ms (try-catch overhead)
- **Total: ~3.6ms per request**

**Acceptable:** 3.6ms is < 1% of typical Azure Functions response time (300-500ms)

## Migration Plan

### Pilot Migration (Tasks 7-8)

**Phase 1a: uploadHandler**

1. Extract business logic to uploadHandlerCore
2. Apply middleware composition
3. Run unit tests for uploadHandler
4. Run integration test: upload-api.integration.test.ts
5. Verify no behavioral changes

**Phase 1b: deleteVendorHandler**

1. Extract business logic to deleteVendorHandlerCore
2. Apply middleware composition
3. Run unit tests for deleteVendorHandler
4. Run integration test: delete-vendor.integration.test.ts
5. Verify no behavioral changes

### Full Rollout (Tasks 11-13)

**Remaining 8 handlers in api.ts:**

1. reprocessMappingHandler
2. confirmMappingHandler
3. getVersionHistoryHandler
4. deleteRunHandler
5. deleteDocumentHandler
6. demoUsageHandler

**Other HTTP functions:** 7. getResults (getResults.ts) 8. aiProductMapper (aiProductMapper.ts)

**Strategy:**

- Migrate 2-3 handlers at a time
- Run tests after each batch
- Fix issues before proceeding

## Dependencies

### Required Modules

- `@azure/functions` - Already installed
- `src/utils/httpHelpers.ts` - Already exists
- `src/utils/usageTracker.ts` - Already exists

### Environment Variables

- `IS_DEMO_MODE` - Controls auth and rate limiting
- `DEMO_API_KEY` - API key for demo mode
- (No new environment variables needed)

## Risk Mitigation

### Risk: Middleware composition breaks existing behavior

**Mitigation:**

- Comprehensive unit tests for each middleware
- Integration tests verify end-to-end behavior
- Pilot migration with 2 handlers first
- Incremental rollout with testing after each batch

### Risk: Performance degradation

**Mitigation:**

- Measure cold start and request latency
- Use simple function composition (no heavy abstractions)
- Performance test after Phase 1 completion

### Risk: Error handling edge cases

**Mitigation:**

- Comprehensive error matrix documentation
- Test error scenarios explicitly
- Preserve existing error handling logic
- Log all errors for debugging

## Documentation Updates

### Files to Update

- `docs/api.md` - Add middleware architecture section
- `README.md` - Update with middleware usage examples
- `.github/instructions/azure-functions-typescript.instructions.md` - Add middleware patterns

### Middleware Usage Guide

```typescript
// Example: Creating a new HTTP function with middleware

import { app } from '@azure/functions';
import { withErrorHandler, withCors, withAuth, withRateLimit } from '../middleware/index.js';

const myHandlerCore = async (req, context) => {
  // Pure business logic
  return successResponse({ message: 'Success' });
};

export const myHandler = withErrorHandler(withCors(withAuth(withRateLimit(myHandlerCore))));

app.http('myRoute', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: myHandler,
});
```
