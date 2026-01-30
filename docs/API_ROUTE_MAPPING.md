# API Route Mapping - Phase 4 Refactoring

## Overview

This document maps the old API routes to new RESTful conventions.

## Route Changes

| Old Route                             | Method   | New Route                              | Handler File                  |
| ------------------------------------- | -------- | -------------------------------------- | ----------------------------- |
| `/api/upload`                         | POST     | `/api/documents`                       | http/documents/upload.ts      |
| `/api/getResults`                     | GET      | `/api/documents`                       | http/documents/get-results.ts |
| `/api/deleteDocument?documentId=X`    | DELETE   | `/api/documents/{id}`                  | http/documents/delete.ts      |
| `/api/deleteVendor?vendorName=X`      | DELETE   | `/api/vendors/{name}`                  | http/vendors/delete.ts        |
| `/api/reprocessMapping`               | POST     | `/api/documents/{id}/reprocess`        | http/documents/reprocess.ts   |
| `/api/confirmMapping`                 | POST     | `/api/documents/{id}/confirm`          | http/documents/confirm.ts     |
| `/api/getVersionHistory?documentId=X` | GET      | `/api/documents/{id}/versions`         | http/versions/history.ts      |
| `/api/deleteRun?documentId=X`         | DELETE   | `/api/documents/{id}/versions/{runId}` | http/versions/delete-run.ts   |
| `/api/demo/usage`                     | GET/POST | `/api/admin/usage`                     | http/admin/usage.ts           |
| `/api/helloWorld`                     | GET      | `/api/health`                          | http/health/sanity.ts         |
| `/api/aiProductMapper`                | POST     | `/api/documents/{id}/mapping`          | http/documents/ai-mapper.ts   |

## Parameter Changes

### Documents

- **Upload**: No change (uses form data)
- **Get Results**: Query params remain (vendor, limit, allVersions, resultId)
- **Delete**: `documentId` moves from query param to route param `{id}`
- **Reprocess**: `documentId` moves from body to route param `{id}`
- **Confirm**: `documentId` moves from body to route param `{id}`

### Vendors

- **Delete**: `vendorName` moves from query param to route param `{name}`

### Versions

- **Get History**: `documentId` moves from query param to route param `{id}`
- **Delete Run**: `documentId` moves from query param to route param `{id}`, add `{runId}` route param

### Admin

- **Usage**: Route already correct (demo/usage → admin/usage)

### Health

- **Sanity**: Rename from `helloWorld` to `health`

## Benefits

1. RESTful resource-based URLs
2. Clear resource hierarchy (documents/{id}/versions/{runId})
3. Standard HTTP methods for CRUD operations
4. Easier to document with OpenAPI
5. Future-ready for API versioning (/v1/documents)
