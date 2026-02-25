# AGENTS.md - ProfitForge AI (Vendor Vault OCR)

AI-powered document processing pipeline: PDF upload -> Azure Document Intelligence (OCR) -> GPT-4o (product extraction) -> Azure SQL Database. Built with TypeScript, Azure Functions v4, Prisma ORM, and Pulumi IaC.

## Build & Run Commands

All application commands run from `code/` directory. Lint/format commands run from repo root.

```bash
# Build
cd code && npm run build          # prisma generate + tsc

# Lint & Format (from repo root)
npm run lint                      # ESLint check
npm run lint:fix                  # ESLint auto-fix
npm run format                    # Prettier write
npm run format:check              # Prettier check

# Dev server
cd code && npm run dev            # tsc --watch + func start + serve client
```

## Test Commands

Test framework: **Vitest**. All test commands run from `code/` directory.

```bash
# Run all tests (unit -> integration -> e2e sequentially)
npm run test:all

# Run by suite
npm run test:unit                 # Fast, no external deps, parallel
npm run test:integration          # Needs Docker (Azure SQL Edge + Azurite)
npm run test:e2e                  # Needs real Azure credentials

# Watch mode
npm run test:unit:watch
npm run test:integration:watch

# Run a single test FILE
npx vitest run --config test/unit/setup/vitest.config.unit.ts test/unit/services/field-mapper.unit.test.ts

# Run a single test by NAME (regex match with -t)
npx vitest run --config test/unit/setup/vitest.config.unit.ts -t "should map fields"

# Coverage
npm run test:coverage
```

Test file naming: `<feature>.<unit|integration|e2e>.test.ts`

- Unit tests: `test/unit/**/*.unit.test.ts` (10s timeout, parallel)
- Integration tests: `test/integration/**/*.integration.test.ts` (30s timeout, sequential)
- E2E tests: `test/e2e/**/*.e2e.test.ts` (180s timeout, sequential)

Always pass the correct `--config` flag for the test tier you are running.

## Code Style

### Language & Module System

- TypeScript 5.x targeting ES2022, strict mode enabled
- Pure ESM (`"type": "module"`) -- never use `require` or `module.exports`
- All internal imports must use `.js` extension for ESM compatibility:
  ```typescript
  import { RunService } from './run-service.js';
  ```
- Node.js 20+ -- prefer built-in modules (e.g., `node:fs/promises`) over external packages

### Formatting (Prettier)

- Single quotes, semicolons, trailing commas (`es5`)
- 100 char print width, 2-space indentation, no tabs
- Run `npm run format` from repo root before committing

### Linting (ESLint)

- Extends: `eslint.configs.recommended` + `tseslint.configs.strict` + `prettier`
- Source code: `no-explicit-any: error`, `no-non-null-assertion: warn`
- Test code: `no-explicit-any: warn`, `no-non-null-assertion: off`
- Unused variables error with `_` prefix exceptions (`argsIgnorePattern: '^_'`)

### Naming Conventions

| Element            | Convention         | Example                              |
| ------------------ | ------------------ | ------------------------------------ |
| Files              | kebab-case         | `run-service.ts`, `error-handler.ts` |
| Repository files   | PascalCase.prisma  | `DocumentRepository.prisma.ts`       |
| Classes            | PascalCase         | `RunService`, `DocumentRepository`   |
| Interfaces / Types | PascalCase (no I)  | `CreateOCRRunResult`, `Product`      |
| Functions / vars   | camelCase          | `createRunService`, `vendorName`     |
| Constants          | UPPER_SNAKE_CASE   | `PROCESSING_STATUS`, `DB_SCHEMA`     |
| Unused params      | \_ prefix          | `_aiModel`, `_originalSource`        |
| Test files         | kebab.tier.test.ts | `upload.unit.test.ts`                |

### Imports

- External packages first, then internal relative imports
- Use `type` keyword for type-only imports: `import type { Document } from '...'`
- Use `type` in re-exports: `export { type Product } from '...'`

### Exports

- **Named exports only** -- no default exports anywhere in the codebase
- Barrel files (`index.ts`) re-export from modules for clean imports
- Services barrel uses explicit named re-exports; models barrel uses `export * from`

### Types

- Avoid `any` -- use `unknown` plus narrowing instead
- Use `as const` objects + derived union types instead of enums:
  ```typescript
  export const PROCESSING_STATUS = { PENDING: 'pending', COMPLETED: 'completed' } as const;
  export type ProcessingStatus = (typeof PROCESSING_STATUS)[keyof typeof PROCESSING_STATUS];
  ```
- Inline types for service-local concerns; shared domain types go in `code/src/utils/models/`
- Use TypeScript utility types (`Readonly`, `Partial`, `Record`) to express intent

### Error Handling

- Attach `statusCode` and `details` to errors via `Object.assign`:
  ```typescript
  throw Object.assign(new Error('Not found'), { statusCode: 404, details: { message: '...' } });
  ```
- All HTTP handlers are wrapped with `withErrorHandler` middleware that catches and formats errors
- Queue triggers: catch, log, and re-throw to trigger queue retry
- Type guards in `code/src/utils/typeGuards.ts` for runtime checks (`hasStatusCode`, `isValidUUID`)

### Documentation

- JSDoc on all exported classes, functions, and interfaces
- Use `@param`, `@returns`, `@example`, `@deprecated`, `@module` tags
- Comments explain "why" not "what"

## Architecture

Three-layer separation -- functions never access the data layer directly:

```
functions/ (thin HTTP/trigger handlers)
  -> services/ (business logic)
    -> data/ (repositories + storage)
```

### Key Patterns

- **Constructor injection + factory functions**: Classes accept deps via constructor; companion `async` factory functions (`createRunService()`) wire production dependencies with dynamic `await import()`
- **Middleware composition**: Higher-order `with*` functions composed right-to-left:
  ```typescript
  export const handler = withErrorHandler(withCors(withAuth(withRateLimit(handlerCore))));
  ```
- **Repository pattern**: `*Repository` classes abstract Prisma ORM with domain-type mapping
- **HTTP response helpers**: `successResponse()`, `errorResponse()`, `validationError()`, etc. in `httpHelpers.ts`

### Directory Layout (`code/src/`)

```
data/              Data access: repositories, prisma-client, storage
functions/
  http/            HTTP-triggered functions grouped by domain (documents/, runs/, vendors/)
  infra-adapters/  Queue triggers, blob triggers, scheduled cleanup
services/          Business logic (ai-service, ocr-service, document-service, run-service)
utils/
  middleware/      Auth, CORS, error handler, rate limit (with* HOFs)
  models/          Shared domain types (document, product, ocr, api-responses)
  config.ts        Centralized env config with validation
  constants.ts     App constants (UPPER_SNAKE_CASE, as const)
  httpHelpers.ts   Standardized HTTP response builders
  typeGuards.ts    Runtime type checking utilities
  validations.ts   Input validation functions
```

## Testing Patterns

### Unit Tests

- All external services fully mocked via factory functions in `test/unit/setup/mocks.ts`
- Pattern: `vi.mock('module-path')` at top, `vi.clearAllMocks()` in `beforeEach`
- Never modify source code to make it easier to test

### Integration Tests

- Docker containers for Azure SQL Edge + Azurite (storage emulator)
- AI services mocked with JSON fixtures in `test/integration/common/fixtures/`
- `cleanTestDatabase()` in `beforeEach` for isolation
- Tests make HTTP requests via `fetch` to `localhost:7071`

### E2E Tests

- No mocking -- uses real Azure services
- Polling utilities for async document processing (`pollDocumentStatus`)
- Individual test timeouts up to 300 seconds

### Mocking Convention

- Service mocks accept `overrides?` parameter for test-specific customization
- Use `vi.mocked(fn)` to type-safely override mock return values per test
- `as any` is acceptable in tests for mocking purposes

## Copilot Instructions (Summary)

The `.github/instructions/` directory contains auto-applied Copilot instructions:

- Prefer readable, explicit solutions over clever shortcuts
- Extend current abstractions before inventing new ones
- Use `async/await` for all async code
- Prefer Node.js built-in modules; ask before adding external dependencies
- Never use `null` -- use `undefined` for optional values
- Guard edge cases early to avoid deep nesting
- Keep functions focused; extract helpers when logic branches grow
- Validate external input with type guards or schema validators
- Use parameterized queries to prevent injection
