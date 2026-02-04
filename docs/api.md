# API Reference

> [!NOTE]
> Routes updated in Phase 4 refactoring (commit: `6fa31cb58`) to follow RESTful conventions.
> All endpoints now use resource-based URLs with path parameters instead of query strings.

Base URL: `https://your-app.azurewebsites.net/api` or `http://localhost:7071/api`

## Architecture

All HTTP endpoints use a middleware pattern for cross-cutting concerns:

- **CORS**: Automatic CORS headers on all responses
- **Authentication**: API key validation in demo mode
- **Rate Limiting**: IP and daily upload limits in demo mode
- **Error Handling**: Standardized error responses and logging

Response format: All successful responses return JSON with `jsonBody` property.

## Endpoints

### Upload Document

**Authentication**: Requires `x-api-key` header in demo mode

**Rate Limiting**:

- Max 10 uploads per IP per hour (demo mode)
- Max 50 uploads per day (demo mode)

```http
POST /api/documents/upload
```

Content-Type: multipart/form-data
x-api-key: your-api-key # Required in demo mode

file: <PDF file>
vendorName: string

````

**Response:**

```json
{
  "documentId": "uuid",
  "status": "pending",
  "documentPath": "uploads/vendor/filename.pdf",
  "vendorName": "ACME Corp"
}
````

**Side effects:**

- Creates record in `document_processing_results` table
- Triggers OCR processing (blob trigger)

---

### Get Processing Results

```http
GET /api/documents?vendor={vendor}&limit={n}&allVersions={bool}&resultId={uuid}
```

**Query Parameters:**

- `vendor` (optional) - Filter by vendor name
- `limit` (optional) - Limit results (default: 100)
- `allVersions` (optional) - Include all processing versions (default: false)
- `resultId` (optional) - Get specific document by ID

**Response:**

```json
{
  "results": [
    {
      "documentId": "uuid",
      "vendorName": "ACME Corp",
      "fileName": "catalog.pdf",
      "processingStatus": "completed",
      "productCount": 234,
      "docIntelCostUsd": 0.015,
      "aiModelCostUsd": 0.045,
      "createdAt": "2026-01-28T10:30:00Z",
      "completedAt": "2026-01-28T10:31:15Z"
    }
  ],
  "count": 1
}
```

---

### Get Single Document

```http
GET /api/documents/{id}
```

**Path Parameters:**

- `id` - Document UUID

**Response:**

```json
{
  "documentId": "uuid",
  "vendorName": "ACME Corp",
  "fileName": "catalog.pdf",
  "processingStatus": "completed",
  "productCount": 234,
  "docIntelCostUsd": 0.015,
  "aiModelCostUsd": 0.045,
  "createdAt": "2026-01-28T10:30:00Z",
  "completedAt": "2026-01-28T10:31:15Z",
  "ocrResult": {
    /* Document Intelligence JSON */
  },
  "llmMappingResult": {
    /* Extracted products */
  }
}
```

---

### Delete Document

```http
DELETE /api/documents/{id}
```

**Path Parameters:**

- `id` - Document UUID

**Response:**

```json
{
  "message": "Document deleted successfully",
  "documentId": "uuid",
  "blobsDeleted": 3
}
```

**Side effects:**

- Deletes database record
- Deletes all associated blobs (uploads, bronze-layer)

---

### Reprocess Document

```http
POST /api/documents/{id}/reprocess-ocr
```

**Path Parameters:**

- `id` - Document UUID

**Effect:** Resets status to `ocr_complete`, increments version counter

**Response:**

```json
{
  "message": "Document queued for reprocessing",
  "documentId": "uuid",
  "newVersion": 2
}
```

**Use case:** Test different prompts without re-running OCR

---

### Trigger AI Mapping

```http
POST /api/documents/{id}/reprocess-ai-mapping
```

**Path Parameters:**

- `id` - Document UUID

**Requirements:**

- Document status must be `ocr_complete`
- OCR results must exist

**Response:**

```json
{
  "status": "completed",
  "productCount": 234,
  "cost": 0.045,
  "usage": {
    "promptTokens": 12500,
    "completionTokens": 8900
  }
}
```

---

### Confirm & Export

```http
POST /api/documents/{id}/confirm/{version-id}
```

**Path Parameters:**

- `id` - Document UUID
- `version-id` - Version run number

**Effect:** Inserts products into `vendor_products` table, marks as `confirmed`

**Response:**

```json
{
  "message": "Products exported successfully",
  "documentId": "uuid",
  "productsExported": 234
}
```

---

### Get Document Version History

```http
GET /api/documents/{id}/versions
```

**Path Parameters:**

- `id` - Document UUID

**Response:**

```json
{
  "documentId": "uuid",
  "versions": [
    {
      "runNumber": 1,
      "status": "completed",
      "productCount": 230,
      "createdAt": "2026-01-28T10:30:00Z"
    },
    {
      "runNumber": 2,
      "status": "completed",
      "productCount": 234,
      "createdAt": "2026-01-28T11:15:00Z"
    }
  ]
}
```

---

### Delete Version Run

```http
DELETE /api/documents/{id}/versions/{version-id}
```

**Path Parameters:**

- `id` - Document UUID
- `version-id` - Run number to delete

**Response:**

```json
{
  "message": "Version run deleted successfully",
  "documentId": "uuid",
  "runNumber": 1
}
```

---

### Delete Vendor Data

```http
DELETE /api/vendors/{name}
```

**Path Parameters:**

- `name` - Vendor identifier (e.g., "ACME_01_26")

**Effect:** Deletes all blobs and database records for vendor (cascading)

**Response:**

```json
{
  "message": "Vendor data deleted successfully",
  "vendorName": "ACME_01_26",
  "documentsDeleted": 15,
  "blobsDeleted": 45
}
```

---

### Health Check

```http
GET /api/health
```

**Response:**

```json
{
  "status": "healthy",
  "timestamp": "2026-01-28T10:30:00Z"
}
```

---

## Processing States

```
pending → ocr_complete → completed → confirmed
          ↑                 ↓
          └─── reprocess ───┘
```

## Error Responses

All endpoints use standardized error handling middleware. Errors are logged automatically with context and return consistent JSON responses:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {
    /* Optional additional context */
  }
}
```

**HTTP Status Codes:**

- `400` - Bad Request (validation errors, missing parameters)
- `401` - Unauthorized (invalid API key in demo mode)
- `404` - Not Found (invalid documentId or vendor name)
- `429` - Too Many Requests (rate limit exceeded in demo mode)
- `500` - Internal Server Error (unhandled exceptions, logged automatically)

**Common error codes:**

- `DOCUMENT_NOT_FOUND` - Invalid documentId
- `VENDOR_NOT_FOUND` - Invalid vendor name
- `INVALID_STATUS` - Operation not allowed in current state
- `PROCESSING_ERROR` - Azure service failure
- `VALIDATION_ERROR` - Invalid request parameters
- `RATE_LIMIT_EXCEEDED` - Too many requests (demo mode)
- `UNAUTHORIZED` - Invalid or missing API key (demo mode)

## Migration from Old Routes

| Old Endpoint                              | New Endpoint                                  | Change                               |
| ----------------------------------------- | --------------------------------------------- | ------------------------------------ |
| `POST /api/upload`                        | `POST /api/documents`                         | Renamed for REST conventions         |
| `GET /api/getResults`                     | `GET /api/documents`                          | Renamed for REST conventions         |
| `DELETE /api/deleteDocument?documentId=X` | `DELETE /api/documents/{id}`                  | Query → path param                   |
| `POST /api/reprocessMapping`              | `POST /api/documents/{id}/reprocess`          | Body → path param + nested resource  |
| `POST /api/confirmMapping`                | `POST /api/documents/{id}/confirm`            | Body → path param + nested resource  |
| `POST /api/aiProductMapper`               | `POST /api/documents/{id}/mapping`            | Body → path param + nested resource  |
| `DELETE /api/deleteVendor?vendorName=X`   | `DELETE /api/vendors/{name}`                  | Query → path param                   |
| `GET /api/getVersionHistory?documentId=X` | `GET /api/documents/{id}/versions`            | Query → path param + nested resource |
| `DELETE /api/deleteRun`                   | `DELETE /api/documents/{id}/versions/{runId}` | Body → path params + nested resource |
| `GET /api/helloWorld`                     | `GET /api/health`                             | Renamed for clarity                  |
