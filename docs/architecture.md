# System Architecture

## Overview

3-stage pipeline for processing vendor product catalogs:

1. **OCR Extraction** - Azure Document Intelligence extracts text and tables
2. **AI Mapping** - GPT-4o maps table columns and extracts structured products
3. **Manual Review** - Human approval before production export

## Data Flow

```
┌─────────────┐
│ Upload PDF  │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────┐
│ Azure Blob Storage                      │
│ ├── uploads/                            │
│ └── bronze-layer/                       │
│     ├── raw/        (original PDFs)     │
│     ├── ocr/        (Document Intel)    │
│     ├── ai-mapping/ (GPT-4o results)    │
│     └── prompts/    (versioned prompts) │
└──────┬──────────────────────────────────┘
       │ (blob trigger)
       ▼
┌─────────────────────────┐
│ Document Intelligence   │
│ - Extract text          │
│ - Parse tables          │
│ - Confidence scores     │
└──────┬──────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│ Azure SQL Database                   │
│ vvocr.document_processing_results    │
│ - status: ocr_complete               │
│ - ocr_result: JSON                   │
└──────┬───────────────────────────────┘
       │ (queue message)
       ▼
┌─────────────────────────┐
│ Azure AI Foundry        │
│ - GPT-4o                │
│ - Column mapping        │
│ - Product extraction    │
└──────┬──────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│ Azure SQL Database                   │
│ - status: completed                  │
│ - llm_mapping_result: JSON           │
│ - product_count: int                 │
└──────┬───────────────────────────────┘
       │ (manual approval)
       ▼
┌──────────────────────────┐
│ vvocr.vendor_products    │
│ (production catalog)     │
└──────────────────────────┘
```

## Database Schema

### `vvocr.document_processing_results`

Main processing table - one record per uploaded document.

**Key columns:**

- `document_id` - UUID primary key
- `vendor_name` - Vendor identifier
- `file_name` - Original filename
- `processing_status` - State machine: pending → ocr_complete → completed → confirmed
- `ocr_result` - Document Intelligence JSON output
- `llm_mapping_result` - Extracted products JSON
- `product_count` - Number of products extracted
- `doc_intel_cost_usd` - OCR cost
- `ai_model_cost_usd` - LLM cost
- `created_at`, `completed_at` - Timestamps

### `vvocr.vendor_products`

Production catalog - only confirmed products.

**Key columns:**

- `product_id` - Auto-increment primary key
- `document_id` - Foreign key to processing results
- `vendor_name` - Denormalized vendor identifier
- `sku` - Vendor SKU
- `name` - Product name
- `unit_price` - Price (decimal)
- `unit_of_measure` - UOM (e.g., "EA", "CS")
- `created_at` - Export timestamp

## Bronze-Layer Storage

All intermediate data retained permanently in `bronze-layer` container:

**Directory structure:**

```
bronze-layer/
├── raw/{vendor}/{timestamp}-{filename}.pdf        # Original uploads
├── ocr/{vendor}/{documentId}.json                 # Document Intelligence output
├── ai-mapping/{vendor}/{documentId}-v{N}.json     # GPT-4o results (versioned)
└── prompts/{vendor}/{documentId}-v{N}.txt         # Exact prompts used
```

**Purpose:**

- Audit trail for compliance
- Reprocess without re-OCR
- Compare prompt versions
- Debug accuracy issues

## Cost Model

### Document Intelligence

- **Rate**: $1.50 per 1,000 pages
- **Calculation**: `pageCount / 1000 * 1.5`
- **Typical**: $0.015 for 10-page PDF

### GPT-4o

- **Input**: $2.50 per 1M tokens → `promptTokens * 0.0025 / 1000`
- **Output**: $10.00 per 1M tokens → `completionTokens * 0.01 / 1000`
- **Typical**: $0.03-0.05 for 10-page PDF

### Total

| Pages | Doc Intel | GPT-4o | Total |
| ----- | --------- | ------ | ----- |
| 10    | $0.02     | $0.03  | $0.05 |
| 50    | $0.08     | $0.07  | $0.15 |
| 100   | $0.15     | $0.15  | $0.30 |

Costs tracked per document in `doc_intel_cost_usd` and `ai_model_cost_usd` columns.

## Versioned Reprocessing

**Use case**: Improve prompt without re-running expensive OCR.

**Flow:**

1. Initial run: `ai-mapping/doc-uuid-v1.json`
2. Tune prompt in code
3. POST `/reprocessMapping` → resets status to `ocr_complete`
4. POST `/aiProductMapper` → creates `ai-mapping/doc-uuid-v2.json`
5. Compare versions in bronze-layer

**Benefits:**

- Fast iteration on prompt quality
- No additional OCR costs
- Historical comparison of prompt effectiveness

## Error Handling

### Transient Failures

- **Document Intelligence timeout**: Retry with exponential backoff (3 attempts)
- **Azure SQL deadlock**: Automatic retry by Azure Functions runtime
- **Storage throttling**: Built-in retry with Azurite SDK

### Permanent Failures

- **Corrupt PDF**: Status set to `failed`, error logged in `processing_status` column
- **Invalid OCR output**: Status remains `ocr_complete`, manual intervention required
- **LLM parsing error**: Status set to `failed`, raw LLM response logged

All errors logged to Application Insights with correlation IDs.

## Security

- **Service Principal**: Limited to `vvocr` schema, cannot access customer data
- **Secrets**: Stored in Azure Key Vault, injected via Function App settings
- **Network**: Functions communicate via Azure backbone (no public internet)
- **Audit**: All operations logged with user identity and timestamp
