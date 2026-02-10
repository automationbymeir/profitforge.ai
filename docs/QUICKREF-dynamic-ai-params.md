# Quick Reference: Dynamic AI Model & Prompt Selection

## What Changed?

The `process-ai-mapping` endpoint now accepts optional `aiModel` and `aiPrompt` parameters to test different AI configurations without re-running OCR.

## New Endpoints

### Get AI Defaults

```bash
GET /api/ai-config/defaults
```

Returns: default model, default prompt template, supported models

## Enhanced Endpoint

### Process AI Mapping (Updated)

```bash
POST /api/documents/:vendorName/process-ai-mapping
Content-Type: application/json

{
  "aiModel": "gpt-4o-mini",     # Optional: gpt-4o | gpt-4o-mini | gpt-4-turbo
  "aiPrompt": "Custom prompt..."  # Optional: max 10,000 chars
}
```

## Quick Examples

**Default (no params):**

```bash
curl -X POST http://localhost:7071/api/documents/vendor-name/process-ai-mapping
```

**Custom Model:**

```bash
curl -X POST http://localhost:7071/api/documents/vendor-name/process-ai-mapping \
  -H "Content-Type: application/json" \
  -d '{"aiModel": "gpt-4o-mini"}'
```

**Custom Prompt:**

```bash
curl -X POST http://localhost:7071/api/documents/vendor-name/process-ai-mapping \
  -H "Content-Type: application/json" \
  -d '{"aiPrompt": "Extract products. Required: name, sku, price."}'
```

**Both:**

```bash
curl -X POST http://localhost:7071/api/documents/vendor-name/process-ai-mapping \
  -H "Content-Type: application/json" \
  -d '{
    "aiModel": "gpt-4-turbo",
    "aiPrompt": "Custom extraction instructions..."
  }'
```

## Validation Rules

| Field      | Rule                                         | Error                    |
| ---------- | -------------------------------------------- | ------------------------ |
| `aiModel`  | Must be in: gpt-4o, gpt-4o-mini, gpt-4-turbo | 400 - Invalid AI model   |
| `aiPrompt` | Max 10,000 characters                        | 400 - AI prompt too long |

## Database Columns

**New Columns Added:**

- `ai_model_requested` - What user requested
- `ai_prompt_requested` - Custom prompt provided

**Existing Columns (still used):**

- `ai_model_used` - What actually ran
- `ai_prompt_used` - Actual prompt sent to AI

## Migration Required

```bash
# Run this SQL migration:
sqlcmd -S server -d database -U user -P password \
  -i infra/migrations/add-ai-requested-params.sql
```

## Files Modified

1. **Schema**: `infra/vvocr-schema.sql` - Added columns
2. **Constants**: `code/src/utils/constants.ts` - Added models, prompt, limits
3. **Repository**: `code/src/data/repositories/DocumentRepository.ts` - New methods
4. **Service**: `code/src/services/run-service.ts` - Validation & storage
5. **AI Service**: `code/src/services/ai-service.ts` - Dynamic model/prompt
6. **Types**: `code/src/functions/http/common/models/document.ts` - New fields
7. **Endpoint**: `code/src/functions/http/documents/get-ai-defaults.ts` - NEW

## Testing

See full guide: `docs/testing-dynamic-ai-parameters.md`

**Quick Test:**

```bash
# 1. Start the app
cd code && npm run dev

# 2. Get defaults
curl http://localhost:7071/api/ai-config/defaults

# 3. Process with custom model
curl -X POST http://localhost:7071/api/documents/test-vendor/process-ai-mapping \
  -H "Content-Type: application/json" \
  -d '{"aiModel": "gpt-4o-mini"}'

# 4. Check database
# Query: SELECT ai_model_requested, ai_model_used FROM vvocr.document_processing_results ORDER BY created_at DESC
```

## Cost Comparison

| Model       | Input Cost | Output Cost | Use Case              |
| ----------- | ---------- | ----------- | --------------------- |
| gpt-4o      | $2.50/1M   | $10.00/1M   | Default, best quality |
| gpt-4o-mini | Lower      | Lower       | Cost optimization     |
| gpt-4-turbo | Similar    | Similar     | Alternative model     |

## Common Issues

**"No existing runs found"**
→ Upload a document first

**"OCR processing not complete"**
→ Wait for OCR to finish (check status)

**"AI model 'X' failed...deployment may not exist"**
→ Verify Azure deployment exists for that model

**Custom prompt produces bad results**
→ Ensure prompt explicitly requests JSON format

## UI Integration Tips

1. Fetch defaults on page load: `GET /api/ai-config/defaults`
2. Display default prompt as placeholder/reference
3. Populate model dropdown from `supportedModels` array
4. Validate prompt length client-side (10k chars)
5. Show model cost estimates based on selection
6. Allow side-by-side comparison of runs

## Next Steps

- Deploy database migration
- Test with different models
- Compare extraction quality
- Monitor costs per model
- Build UI for prompt customization
