## Storage Layer Refactoring (Feb 2026)

### Motivation

The original OCR service implementation had several inefficiencies:

1. **Tight coupling:** OCR service directly used Azure SDK for blob operations
2. **Code duplication:** Storage operations scattered across services
3. **Poor separation of concerns:** Business logic mixed with infrastructure code
4. **Inefficient caching:** Entire OCR response downloaded just to check existence
5. **Incomplete metadata:** OCR metadata not persisted with results in blob

### Refactoring Changes

#### StorageService Extensions

**Added Methods:**

```typescript
// Check if OCR cache exists, return only metadata needed for DB
async checkOCRCache(container, cachePath): Promise<{
  cost, confidenceScore?, processingDuration, pageCount, tableCount
} | null>

// Download PDF for OCR processing with error handling
async downloadPdfForOCR(container, blobPath): Promise<Buffer>

// Upload OCR results with structured metadata
async uploadOCRResults(container, cachePath, ocrResponse, metadata): Promise<{ url }>
```

**Benefits:**

- Single point of responsibility for all blob operations
- Consistent error handling with descriptive messages
- Returns only metadata needed for database (no unnecessary data transfer)
- Reusable across services

#### DocumentRepository Extensions

**Added Method:**

```typescript
// Get run details for processing, throws if not found
async getExistingRunByID(resultId): Promise<{
  resultId, vendorName, documentPath, documentName, processingStatus
}>
```

**Benefits:**

- Explicit method for processing workflows
- Throws error if run doesn't exist (fail-fast)
- Returns only fields needed for processing

#### OCRService Improvements

**Refactored Flow:**

```typescript
async processDocumentFromQueue(documentId, blobPath) {
  // 1. Get run details from repository
  const run = await documentRepo.getExistingRunByID(documentId);

  // 2. Check cache via storage service
  const cachedOCR = await storageService.checkOCRCache(container, cachePath);

  if (cachedOCR) {
    // Use cached metadata
    ocrMetadata = { cost, confidenceScore, processingDuration };
  } else {
    // 3. Download PDF via storage service
    const pdfBuffer = await storageService.downloadPdfForOCR(container, blobPath);

    // 4. Run OCR analysis
    const ocrResponse = await client.beginAnalyzeDocument(...);

    // 5. Calculate metrics (cost, confidence, duration)
    // 6. Upload results with metadata via storage service
    await storageService.uploadOCRResults(container, cachePath, ocrResponse, metadata);
  }

  // 7. Single DB update for both cached and fresh OCR
  await documentRepo.updateOcrResults({
    result_id: documentId,
    doc_intel_confidence_score: ocrMetadata.confidenceScore || null,
    doc_intel_cost_usd: ocrMetadata.cost,
    doc_intel_prompt_used: 'prebuilt-layout',
  });

  // 8. Queue AI mapping with error handling
  await queueService.queueAIMapping(documentId);
}
```

**Key Improvements:**

- **No direct Azure SDK usage:** All blob operations via StorageService
- **Explicit flow:** Clear steps from cache check → download → process → upload
- **Single DB update:** Same code path for cached and fresh OCR
- **Complete metadata persistence:** Cost, duration, confidence saved with OCR results
- **Better error handling:** Try-catch with status updates on failure
- **Consistent logging:** Step-by-step progress with emojis

**OCR Metadata Structure in Blob:**

```json
{
  "metaData": {
    "processingCost": 0.0015,
    "processingDuration": 2341,
    "confidenceScore": 0.92
  },
  "ocrResponse": {
    "pages": [...],
    "tables": [...],
    // Full Azure Document Intelligence response
  }
}
```

### Design Principles Applied

1. **Single Responsibility:** Each service handles its domain (storage, repository, OCR)
2. **Dependency Inversion:** OCR service depends on abstractions (StorageService interface)
3. **DRY (Don't Repeat Yourself):** Storage operations centralized, not duplicated
4. **Fail-Fast:** Explicit error throwing with descriptive messages
5. **Separation of Concerns:** Business logic (OCR) separate from infrastructure (blob operations)

### Performance Benefits

- **Reduced data transfer:** Cache check returns only metadata, not full OCR response
- **Efficient caching:** No unnecessary downloads when cache exists
- **Better monitoring:** Comprehensive logging at each step
- **Error resilience:** Proper error handling prevents silent failures
