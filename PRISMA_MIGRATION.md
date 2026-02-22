# Prisma ORM Migration

## Overview

This branch migrates the data access layer from raw SQL queries (`mssql`) to **Prisma ORM** for type-safe, maintainable database operations.

## What Changed

### New Files Created

- **`code/prisma/schema.prisma`** - Prisma schema definition for Azure SQL Server
- **`code/src/data/prisma-client.ts`** - Singleton Prisma client with retry logic
- **`code/src/data/repositories/DocumentRepository.prisma.ts`** - Prisma-based DocumentRepository
- **`code/src/data/repositories/VendorProductRepository.prisma.ts`** - Prisma-based VendorProductRepository
- **`code/.env.example`** - Example environment configuration for Prisma

### Modified Files

- **`code/package.json`** - Added Prisma dependencies and scripts
  - Dependencies: `@prisma/client@^5.22.0`
  - DevDependencies: `prisma@^5.22.0`
  - Scripts: `prisma:generate`, `prisma:studio`, `prisma:format`, `prisma:push`, `prisma:pull`, `prisma:migrate`
  - Updated `build` script to include `npx prisma generate`

## Benefits

### Type Safety
- **Auto-generated types** from schema eliminate manual type declarations
- **Compile-time validation** catches field name typos and type mismatches
- **IntelliSense support** for all database operations

### Developer Experience
- **725 → ~500 lines** for DocumentRepository (30% reduction)
- **219 → ~180 lines** for VendorProductRepository (18% reduction)
- **No more manual SQL type mapping** (`sql.NVarChar`, `sql.UniqueIdentifier`, etc.)
- **Automatic transactions** for bulk operations (no manual batching loops)
- **Built-in connection pooling** optimized for serverless

### Maintainability
- **Single source of truth** - schema in `schema.prisma`
- **Migration versioning** (ready for `prisma migrate` when needed)
- **Cleaner code** - Fluent API instead of raw SQL strings
- **Better error messages** with Prisma's validation

## Current Status

### ✅ Completed

1. Feature branch created: `feature/prisma-orm-migration`
2. Prisma installed and configured for SQL Server
3. Schema introspected and Prisma models generated
4. Prisma singleton client with Azure Functions optimization
5. DocumentRepository refactored to Prisma (20 methods)
6. VendorProductRepository refactored to Prisma (6 methods)
7. Package.json scripts added for Prisma tooling
8. **Service layer updated** - All 6 services migrated to Prisma
   - Updated imports from `.ts` to `.prisma.ts`
   - Replaced `getConnectionPool()` with `getPrismaClient()`
   - Added factory functions to repositories
   - Build passes successfully

### 🔄 Next Steps (Not Yet Started)

9. **Update test infrastructure** - Refactor mocks and integration tests
   - Unit tests: Mock PrismaClient instead of ConnectionPool
   - Integration tests: Use Prisma for test setup/cleanup
10. **Run tests** - Verify all tests pass with Prisma
11. **Documentation** - Update architecture docs

## Setup Instructions

### Prerequisites

You need a `.env` file with your database connection string:

```bash
cp .env.example .env
# Edit .env and add your SQL_CONNECTION_STRING
```

Format for Azure SQL:
```
SQL_CONNECTION_STRING="sqlserver://your-server.database.windows.net:1433;database=your-db;user=your-user;password=your-password;encrypt=true"
```

### Generate Prisma Client

After pulling this branch:

```bash
cd code
npm install
npm run prisma:generate
```

This generates TypeScript types in `node_modules/.prisma/client`.

### View Database with Prisma Studio

```bash
npm run prisma:studio
```

Opens a web UI at http://localhost:5555 to browse your data.

### Sync Schema Changes

If you modify `schema.prisma`:

```bash
npm run prisma:push  # For development (no migration files)
# OR
npm run prisma:migrate  # For production (creates versioned migrations)
```

## Migration Strategy

### Phase 1: Parallel Implementation (Current)

- ✅ Prisma repositories created with `.prisma.ts` suffix
- ✅ Original repositories kept for comparison
- ✅ Both `mssql` and `@prisma/client` installed

### Phase 2: Integration (Next)

- 🔄 Update services to use Prisma repositories
- 🔄 Refactor tests to use Prisma
- 🔄 Run full test suite to validate equivalence

### Phase 3: Cutover

- Remove original repositories (`.ts` → `.prisma.ts`)
- Remove `mssql` dependency
- Merge to main branch

## Key Decisions

### Why Prisma over Drizzle?

- **Production-ready SQL Server support** (Drizzle is experimental)
- **Proven with Azure Functions** - Large community using it in serverless
- **Better migration tooling** - Handles SQL Server edge cases
- **Trade-off accepted**: +50-100ms cold start is negligible vs Azure SQL auto-pause (30-60s)

### Why Singleton Pattern?

Azure Functions reuse process instances when warm. The singleton pattern ensures:
- Connection pool persists across invocations
- No redundant connection overhead
- Optimal performance for warm functions

### Why `updateMany` instead of `update`?

Prisma's `update` requires the record to exist (throws if not found). Using `updateMany`:
- Returns count (0 or 1) like original SQL
- Matches existing API behavior
- Easier for callers to handle "not found" case

## Testing

### Unit Tests

```bash
npm run test:unit
```

Will need mock updates:
```typescript
// Before (mssql)
vi.mock('mssql')

// After (Prisma)
vi.mock('@prisma/client')
```

### Integration Tests

```bash
npm run test:integration
```

Docker SQL Server setup works with both implementations.

### E2E Tests

```bash
npm run test:e2e
```

No changes needed - tests use HTTP API layer.

## Performance Considerations

### Bundle Size

- **Before**: `mssql` ~1.5MB
- **After**: `@prisma/client` ~3.5MB
- **Delta**: +2MB (acceptable for Azure Functions)

### Cold Start

- **Expected impact**: +50-100ms
- **Context**: Azure SQL Serverless auto-pause adds 30-60s, making this negligible

### Query Performance

- Prisma generates optimized SQL similar to hand-written queries
- Connection pooling handled internally by Prisma
- No performance degradation expected

## Prisma Scripts Reference

| Script | Purpose |
|--------|---------|
| `npm run prisma:generate` | Regenerate TypeScript client after schema changes |
| `npm run prisma:studio` | Open visual database browser |
| `npm run prisma:format` | Auto-format schema.prisma file |
| `npm run prisma:push` | Apply schema changes without migrations (dev) |
| `npm run prisma:pull` | Introspect database to update schema |
| `npm run prisma:migrate` | Create versioned migration (production) |

## Troubleshooting

### Error: "Could not find Prisma Schema"

Run from `code/` directory or specify path:
```bash
npx prisma generate --schema=./prisma/schema.prisma
```

### Error: "URL must start with sqlserver://"

Check your `.env` file has `SQL_CONNECTION_STRING` in correct format.

### Error: "Cannot find module '@prisma/client'"

Generate the client:
```bash
npm run prisma:generate
```

### Connection Timeout

Azure SQL Serverless may be paused. First query will take 30-60s to wake it up.

## Resources

- [Prisma Documentation](https://www.prisma.io/docs)
- [Prisma + SQL Server Guide](https://www.prisma.io/docs/concepts/database-connectors/sql-server)
- [Prisma + Azure Functions](https://www.prisma.io/docs/guides/deployment/deployment-guides/deploying-to-azure-functions)

## Questions?

See [docs/architecture.md](../../docs/architecture.md) for system overview or ask the team.
