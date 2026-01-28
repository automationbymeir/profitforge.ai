# API Reference

Base URL: `https://your-app.azurewebsites.net/api` or `http://localhost:7071/api`

## Endpoints

### Upload Document

```http
POST /upload
Content-Type: multipart/form-data

file: <PDF file>
vendorId: string
```

**Response:**

```json
{
  "resultId": "uuid",
  "status": "pending",
  "blobPath": "uploads/vendor/filename.pdf"
}
```

**Side effects:**

- Creates record in `document_processing_results` table
- Triggers OCR processing (blob trigger)

---

### Get Processing Status

```http
GET /getResults?documentId={uuid}
```

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

### Trigger AI Mapping

```http
POST /aiProductMapper
Content-Type: application/json

{
  "documentId": "uuid"
}
```

**Requirements:**

- Document status must be `ocr_complete`
- OCR results must exist

**Response:**

```json
{
  "status": "completed",
  "productCount": 234,
  "cost": 0.045,
  "tokens": {
    "prompt": 12500,
    "completion": 8900
  }
}
```

---

### Reprocess Document

```http
POST /reprocessMapping
Content-Type: application/json

{
  "documentId": "uuid"
}
```

**Effect:** Resets status to `ocr_complete`, increments version counter

**Use case:** Test different prompts without re-running OCR

---

### Confirm & Export

```http
POST /confirmMapping
Content-Type: application/json

{
  "documentId": "uuid"
}
```

**Effect:** Inserts products into `vendor_products` table, marks as `confirmed`

---

### Delete Vendor Data

```http
DELETE /deleteVendor?vendorId={vendor}
```

**Effect:** Deletes all blobs and database records for vendor (cascading)

---

## Processing States

```
pending → ocr_complete → completed → confirmed
          ↑                 ↓
          └─── reprocess ───┘
```

## Error Responses

All endpoints return standard error format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {
    /* Optional additional context */
  }
}
```

**Common error codes:**

- `DOCUMENT_NOT_FOUND` - Invalid documentId
- `INVALID_STATUS` - Operation not allowed in current state
- `PROCESSING_ERROR` - Azure service failure
- `VALIDATION_ERROR` - Invalid request parameters
