# PDF Catalog Processing Pipeline - Project Overview

## System Architecture

**3-Stage Pipeline:** Upload → OCR Processing → AI Product Mapping → Export to Production

```
Upload PDF → Azure Blob → Document Intelligence (OCR) → GPT-4o (Extract Products) → SQL Database
```

### Bronze-Layer Storage

All data is retained in `bronze-layer` container:

- `raw/` - Original PDFs with timestamps
- `ocr/` - Document Intelligence JSON outputs
- `ai-mapping/` - Product extraction results (versioned)
- `prompts/` - Exact prompts used (versioned)

### Database Tables

- **`vvocr.document_processing_results`** - All processing runs, costs, prompts
- **`vvocr.vendor_products`** - Production catalog (confirmed products only)

---

## API Endpoints

### 1. Upload PDF

```bash
POST /api/upload
Form Data: file (PDF), vendorId (string)
Returns: { resultId: "uuid", status: "pending" }
```

### 2. Check Status

```bash
GET /api/getResults?documentId={uuid}
Returns: Full processing status, product count, costs
```

### 3. Trigger AI Mapping

```bash
POST /api/aiProductMapper
Body: { "documentId": "uuid" }
Requires: Status must be "ocr_complete"
Returns: { productCount, cost, tokens }
```

### 4. Reprocess Mapping

```bash
POST /api/reprocessMapping
Body: { "documentId": "uuid" }
Use: Test different prompts, tune accuracy
Returns: Status reset to "ocr_complete"
```

### 5. Export to Production

```bash
POST /api/confirmMapping
Body: { "documentId": "uuid" }
Effect: Inserts products into vendor_products table
Returns: { productsExported: count }
```

### 6. Delete Vendor Data

```bash
DELETE /api/deleteVendor?vendorId={vendor}
Effect: Deletes all blobs and DB records for vendor
```

---

## Processing Flow

### Stage 1: Upload (Manual)

- User uploads PDF via API
- File stored in `uploads/` container
- Database record created with status `pending`

### Stage 2: OCR (Automatic)

- Blob trigger fires on upload
- Azure Document Intelligence extracts text and tables
- Cost: $1.50 per 1,000 pages
- Results stored in database + `bronze-layer/ocr/`
- Status: `pending` → `ocr_complete`

### Stage 3: AI Mapping (Manual Trigger)

- HTTP POST triggers GPT-4o processing
- Phase 1: Column mapping (detect SKU, name, price fields)
- Phase 2: Product extraction from table rows
- Cost: ~$0.02-0.10 per document (GPT-4o tokens)
- Results stored in database + `bronze-layer/ai-mapping/`
- Status: `ocr_complete` → `completed`

### Stage 4: Export (Manual Approval)

- Review extracted products
- Confirm export via API
- Products inserted into `vendor_products` table
- Export status: `pending` → `confirmed`

---

## Workflow Examples

### Standard Processing

```bash
# 1. Upload
curl -X POST $API_URL/upload -F "file=@catalog.pdf" -F "vendorId=ACME"
# Returns: { resultId: "doc-uuid" }

# 2. Wait for OCR (automatic, ~30 seconds)

# 3. Check status
curl "$API_URL/getResults?documentId=doc-uuid"
# Status: "ocr_complete"

# 4. Trigger AI mapping
curl -X POST $API_URL/aiProductMapper \
  -H "Content-Type: application/json" \
  -d '{"documentId": "doc-uuid"}'

# 5. Check results
curl "$API_URL/getResults?documentId=doc-uuid"
# Status: "completed", productCount: 234

# 6. Export to production
curl -X POST $API_URL/confirmMapping \
  -H "Content-Type: application/json" \
  -d '{"documentId": "doc-uuid"}'
```

### Reprocessing (Prompt Tuning)

```bash
# After initial run, improve prompt in code

# Reset document
curl -X POST $API_URL/reprocessMapping -d '{"documentId": "doc-uuid"}'

# Run AI mapping again (creates version 2)
curl -X POST $API_URL/aiProductMapper -d '{"documentId": "doc-uuid"}'

# Results stored as ai-mapping/doc-uuid-v2.json
# Compare versions in bronze-layer
```

---

## Cost Tracking

| Service               | Rate              | Formula                          |
| --------------------- | ----------------- | -------------------------------- |
| Document Intelligence | $1.50/1,000 pages | `pageCount / 1000 * 1.5`         |
| GPT-4o Input          | $2.50/1M tokens   | `promptTokens * 0.0025 / 1000`   |
| GPT-4o Output         | $10.00/1M tokens  | `completionTokens * 0.01 / 1000` |

**Example Costs:**

- 10-page catalog: ~$0.05 total
- 50-page catalog: ~$0.15 total
- 100-page catalog: ~$0.30 total

---

## Monitoring Queries

### Processing Status

```sql
SELECT processing_status, COUNT(*) as count
FROM vvocr.document_processing_results
GROUP BY processing_status;
```

### Vendor Summary

```sql
SELECT vendor_name, COUNT(*) as docs, SUM(product_count) as products,
       SUM(doc_intel_cost_usd + ai_model_cost_usd) as total_cost
FROM vvocr.document_processing_results
WHERE processing_status = 'completed'
GROUP BY vendor_name;
```

### Daily Costs

```sql
SELECT CAST(created_at AS DATE) as date,
       COUNT(*) as docs,
       SUM(doc_intel_cost_usd) as ocr_cost,
       SUM(ai_model_cost_usd) as ai_cost
FROM vvocr.document_processing_results
WHERE processing_status IN ('completed', 'failed')
GROUP BY CAST(created_at AS DATE)
ORDER BY date DESC;
```

---

## Key Features

✅ **Separated OCR and AI stages** - OCR runs once, AI can rerun multiple times  
✅ **Versioned reprocessing** - Test different prompts without re-OCR  
✅ **Bronze-layer retention** - Full audit trail, all intermediate results preserved  
✅ **Manual approval gate** - Review before production export  
✅ **Cost tracking** - Per-document costs for Document Intelligence and GPT-4o  
✅ **Golden dataset testing** - Automated accuracy validation framework

---

## Environment Configuration

Required environment variables:

```bash
SQL_CONNECTION_STRING="Server=..."
STORAGE_CONNECTION_STRING="DefaultEndpointsProtocol=https..."
DOCUMENT_INTELLIGENCE_ENDPOINT="https://..."
DOCUMENT_INTELLIGENCE_KEY="..."
AI_PROJECT_ENDPOINT="https://..."
AI_PROJECT_KEY="..."
```

---

## Source Files

```
javascript/src/functions/
├── api.ts                  # Upload, delete, reprocess, confirm
├── documentProcessor.ts    # OCR stage (blob trigger)
├── aiProductMapper.ts      # AI mapping stage (HTTP trigger)
└── getResults.ts           # Query results

infra/
├── vvocr-schema.sql        # Database schema
├── storage.ts              # Blob containers
└── functions.ts            # Function app deployment
```

---

## Troubleshooting

**OCR stuck at "pending"**: Check blob trigger logs, verify file in `uploads/` container  
**AI mapping fails**: Ensure status is `ocr_complete`, check function logs for errors  
**Low accuracy**: Tune prompts in `aiProductMapper.ts`, use reprocessing workflow  
**Missing products**: Check `llm_mapping_result` field, verify product_count matches
