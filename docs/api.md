# API Reference

> [!NOTE]
> Architecture uses vendorName as primary identifier (Feb 2026).
> Each processing attempt creates a new run (result_id).
> Reprocessing creates new runs - old runs are preserved for history.
> Routes use vendorName for RESTful, business-focused URLs.

Base URL: `https://your-app.azurewebsites.net/api` or `http://localhost:7071/api`

## API Changes Summary

**Recent endpoint updates (Feb 2026):**

| Old Endpoint                                        | New Endpoint                                      | Status     | Breaking Change  | Notes                                    |
| --------------------------------------------------- | ------------------------------------------------- | ---------- | ---------------- | ---------------------------------------- |
| `POST /documents/{vendorName}/reprocess-ocr`        | `POST /documents/{vendorName}/process-ocr`        | ✅ Updated | Yes - rename     | Now uses RunService, creates new runs    |
| `POST /documents/{vendorName}/reprocess-ai-mapping` | `POST /documents/{vendorName}/process-ai-mapping` | ✅ Updated | Yes - rename     | Accepts custom aiModel/aiPrompt params   |
| Upload creates DB record                            | Upload only saves blob                            | ✅ Updated | Yes - behavior   | Blob trigger now creates run record      |
| OCR always processes                                | OCR checks cache first                            | ✅ Updated | No - enhancement | Reuses `ocr-azure-doc-intelligence.json` |

**Service layer refactoring:**

- **NEW**: `run-service.ts` - Run creation and queue management
- **NEW**: Blob upload trigger - Automatic run creation on PDF upload
- **UPDATED**: `document-service.ts` - Simplified to vendor/document management only
- **UPDATED**: `ocr-service.ts` - Added caching logic for OCR results

**Blob storage updates:**

- OCR results now saved as: `<vendorName>/ocr-azure-doc-intelligence.json` (was: `<vendorName>/ocr.json`)
- Only structured data (tables) saved to blob, not extracted text

## Architecture Principles

**Processing Run Model:**

- Documents identified by `vendorName` (currently 1-1 with document)
- Each processing attempt creates a new `result_id` (processing run)
- Multiple runs can exist for same vendorName (reprocessing history)
- Latest run is the current state
- Old runs preserved for audit trail and comparison
- Calculated fields (token counts, product counts) computed from stored data
- OCR structured data stored in blob storage (`<vendorName>/ocr-azure-doc-intelligence.json`)
- AI mapping results stored in database per run (`ai_mapping_result` field)

**Reprocessing:**

- Creates NEW processing run (new result_id) - doesn't update existing
- For OCR reprocess: new OCR → new AI mapping → new run
- For AI reprocess: reuse existing OCR → new AI mapping → new run
- Old runs remain accessible via GET /documents?vendor={name}
- Can delete specific runs via DELETE /documents/runs/{runId}

**Middleware Pattern:**

- **CORS**: Automatic CORS headers on all responses
- **Authentication**: API key validation in demo mode
- **Rate Limiting**: IP and daily upload limits in demo mode
- **Error Handling**: Standardized error responses and logging

**Response format:** All successful responses return JSON with `jsonBody` property.

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
  "blobsDeleted": 2
}
```

**Side effects:**

- Deletes database record
- Deletes all associated blobs (uploads, OCR results, AI mapping)

---

### Process OCR

Creates a new processing run with fresh OCR analysis. Original processing run preserved for history.

**Note:** Blob upload trigger automatically creates runs for new PDFs. This endpoint is for manual reprocessing.

```http
POST /api/documents/{vendorName}/process-ocr
```

**Path Parameters:**

- `vendorName` - Vendor identifier (e.g., "ACME_01_26")

**Request Body (optional):**

```json
{
  "ocrOptions": {
    "features": ["tables", "keyValuePairs"],
    "locale": "en-US"
  }
}
```

**Requirements:**

- Vendor must have existing processing run
- Original file must be in blob storage

**Response:**

```json
{
  "message": "New OCR processing run created",
  "newRunId": "uuid",
  "vendorName": "ACME_01_26",
  "documentPath": "ACME_01_26/catalog.pdf",
  "status": "pending",
  "nextStep": "OCR processing will begin shortly via queue"
}
```

**Side effects:**

- Creates NEW processing run (new result_id)
- Queues OCR processing
- Triggers AI mapping after OCR completes
- Old runs remain accessible

---

### Process AI Mapping

Creates a new processing run with fresh AI mapping. Reuses existing OCR results from latest run. Original processing run preserved for history.

**NEW (Feb 2026)**: Now supports custom AI model and prompt selection for testing different extraction configurations.

```http
POST /api/documents/{vendorName}/process-ai-mapping
```

**Path Parameters:**

- `vendorName` - Vendor identifier (e.g., "ACME_01_26")

**Request Body (optional):**

```json
{
  "aiModel": "gpt-4o-mini",
  "aiPrompt": "Extract all products with prices. Include SKU if available."
}
```

**Parameters:**

- `aiModel` (optional) - Custom AI model to use. Must be one of: `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`. Defaults to `gpt-4o`.
- `aiPrompt` (optional) - Custom extraction prompt (max 10,000 characters). Defaults to built-in template. Completely replaces the default prompt.

**Requirements:**

- Vendor must have existing run with status `ocr_complete` or `completed`
- OCR results must exist in blob storage (will be copied to new run)
- Custom model must be in the supported models list
- Custom prompt must not exceed 10,000 characters

**Response:**

```json
{
  "message": "New AI mapping run created with copied OCR results",
  "vendorName": "ACME_01_26",
  "runId": "12345678-1234-1234-1234-123456789abc",
  "status": "ocr_complete",
  "nextStep": "AI mapping will begin shortly. New run created.",
  "aiModel": "gpt-4o-mini",
  "aiPrompt": "Extract all products with..."
}
```

**Error Responses:**

_Invalid Model (400):_

```json
{
  "error": "Invalid AI model",
  "details": {
    "message": "AI model 'gpt-5' is not supported. Supported models: gpt-4o, gpt-4o-mini, gpt-4-turbo",
    "supportedModels": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"]
  }
}
```

_Prompt Too Long (400):_

```json
{
  "error": "AI prompt too long",
  "details": {
    "message": "AI prompt exceeds maximum length of 10000 characters (provided: 12500)",
    "maxLength": 10000
  }
}
```

_No Existing Run (404):_

```json
{
  "error": "No existing runs found for vendor",
  "details": {
    "message": "No processing runs found for vendor ACME_01_26. Upload a document first."
  }
}
```

**Side effects:**

- Creates NEW processing run (new result_id)
- Copies OCR results from latest run
- Stores requested AI parameters in database (`ai_model_requested`, `ai_prompt_requested`)
- Queues AI mapping with custom configuration
- Old runs remain accessible

**Notes:**

- Custom parameters are stored when creating the run
- Queue trigger retrieves parameters from database during processing
- If model deployment unavailable, processing fails gracefully with 503 error
- Use GET `/api/ai-config/defaults` to retrieve default model and prompt for UI display

---

### Get AI Configuration Defaults

**NEW (Feb 2026)**: Retrieve default AI model, prompt template, and supported models for UI reference.

```http
GET /api/ai-config/defaults
```

**Response:**

```json
{
  "defaultModel": "gpt-4o",
  "defaultPrompt": "You are analyzing product catalog tables. Extract products with the following MINIMAL REQUIRED SCHEMA:\n- name (product name/description) - REQUIRED\n- SKU (item code/product code) - REQUIRED...",
  "supportedModels": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"]
}
```

**Use Cases:**

- Display default prompt as reference in UI
- Populate model dropdown with supported options
- Show users what the default configuration looks like before customizing

---

### Delete Processing Run

Delete a specific processing run. Use with caution - this is permanent.

```http
DELETE /api/documents/runs/{runId}
```

**Path Parameters:**

- `runId` - Processing run UUID (result_id)

**Response:**

```json
{
  "message": "Processing run deleted successfully",
  "runId": "uuid",
  "vendorName": "ACME_01_26"
}
```

**Side effects:**

- Deletes database record for this run ONLY
- Does NOT delete blobs (OCR cache is shared across runs)
- Other runs for same vendor unaffected
- To delete all runs AND blobs, use `DELETE /documents/{vendorName}`

---

### Trigger AI Mapping (Deprecated)

> [!WARNING]
> Deprecated: Use `/documents/{vendorName}/reprocess-ai-mapping` instead

```http
POST /api/documents/{id}/mapping
```

**Path Parameters:**

- `id` - Document UUID

**Requirements:**

- Document status must be `ocr_complete`
- OCR results must exist in blob storage

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

**Note:** Normally triggered automatically by queue after OCR completion.
This endpoint allows manual triggering if needed.

---

### Confirm & Export Products

```http
POST /api/documents/{id}/confirm
```

**Path Parameters:**

- `id` - Document UUID

**Requirements:**

- Document must have status `completed` (AI mapping done)
- Products must exist in `ai_mapping_result`

**Effect:**

- Inserts/updates products in `vendor_products` table
- Marks document as `confirmed` in database

**Response:**

```json
{
  "message": "Products exported successfully",
  "documentId": "uuid",
  "productsExported": 234
}
```

---

### Delete Vendor

```http
DELETE /api/vendors/{name}
```

**Path Parameters:**

- `name` - Vendor identifier (e.g., "ACME_01_26")

**Effect:** Deletes all documents and blobs for vendor

**Response:**

```json
{
  "message": "Vendor deleted successfully",
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
   ↑            ↑            ↑
   └─ reprocess-ocr ─────────┘
                └─ mapping ──┘
```

**State Transitions:**

- `pending`: Processing run created, waiting for OCR
- `ocr_complete`: OCR finished, waiting for AI mapping
- `completed`: AI mapping finished, products extracted
- `confirmed`: Products exported to vendor_products table

**Processing Runs:**

- Each upload creates Run 1 (initial processing)
- Reprocess OCR creates new run (new OCR + new AI mapping)
- Reprocess AI creates new run (reuse OCR + new AI mapping)
- Latest run is current state (query with `GET /documents?vendor={name}`)
- Old runs accessible for history/comparison
- Delete specific runs with `DELETE /documents/runs/{runId}`

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

## API Evolution (Feb 2026)

**Changed:**

- ✅ Routes now use `vendorName` instead of UUID: `/documents/{vendorName}/...`
- ✅ Reprocessing creates NEW runs (not in-place updates)
- ✅ Processing runs tracked by `result_id` (each attempt is separate record)
- ✅ Delete specific runs: `DELETE /documents/runs/{runId}`
- ✅ Renamed `/mapping` to `/reprocess-ai-mapping` for clarity

**Architecture:**

- Each processing attempt = new result_id (run)
- Multiple runs per vendor preserved for history
- Latest run = current state
- Old runs queryable and deletable individually
- vendorName is primary business identifier in URLs
