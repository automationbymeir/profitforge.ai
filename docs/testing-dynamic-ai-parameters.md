# Dynamic AI Model and Prompt Testing Guide

## Overview

The `process-ai-mapping` endpoint now supports custom AI model and prompt selection. This allows you to:

- Test different AI models (gpt-4o, gpt-4o-mini, gpt-4-turbo)
- Provide custom prompts to influence extraction behavior
- Compare results across different configurations

## Prerequisites

1. **Apply Database Migration**:

   ```bash
   # Run the migration script to add new columns
   sqlcmd -S your-server.database.windows.net -d your-database -U your-user -P your-password -i infra/migrations/add-ai-requested-params.sql
   ```

2. **Ensure you have existing OCR data**:
   - Upload a document first via POST `/api/documents/upload/:vendorName`
   - Wait for OCR processing to complete (status: `ocr_complete` or `completed`)

## API Endpoints

### 1. Get AI Defaults (New Endpoint)

Retrieve default model, prompt, and supported models for UI reference.

**Request:**

```http
GET /api/ai-config/defaults
```

**Response:**

```json
{
  "defaultModel": "gpt-4o",
  "defaultPrompt": "You are analyzing product catalog tables...",
  "supportedModels": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"]
}
```

### 2. Process AI Mapping with Custom Parameters (Enhanced Endpoint)

Create a new AI mapping run with optional custom model and prompt.

**Request:**

```http
POST /api/documents/:vendorName/process-ai-mapping
Content-Type: application/json

{
  "aiModel": "gpt-4o-mini",
  "aiPrompt": "Extract products focusing on SKU and price accuracy..."
}
```

**Parameters:**

- `aiModel` (optional): One of the supported models. Defaults to `gpt-4o`.
- `aiPrompt` (optional): Custom prompt (max 10,000 chars). Defaults to built-in prompt.

**Response:**

```json
{
  "message": "New AI mapping run created with copied OCR results",
  "vendorName": "example-vendor",
  "runId": "12345678-1234-1234-1234-123456789abc",
  "status": "ocr_complete",
  "nextStep": "AI mapping will begin shortly. New run created.",
  "aiModel": "gpt-4o-mini",
  "aiPrompt": "Extract products focusing on..."
}
```

## Testing Scenarios

### Scenario 1: Default Configuration

Test without any custom parameters (uses default model and prompt).

```bash
curl -X POST http://localhost:7071/api/documents/test-vendor/process-ai-mapping \
  -H "Content-Type: application/json"
```

**Expected:**

- Uses `gpt-4o` model
- Uses default prompt template
- `ai_model_requested` and `ai_prompt_requested` are NULL in database
- `ai_model_used` stores "gpt-4o"

### Scenario 2: Custom Model Only

Test with a different model but default prompt.

```bash
curl -X POST http://localhost:7071/api/documents/test-vendor/process-ai-mapping \
  -H "Content-Type: application/json" \
  -d '{
    "aiModel": "gpt-4o-mini"
  }'
```

**Expected:**

- Uses `gpt-4o-mini` model
- Uses default prompt template
- `ai_model_requested` = "gpt-4o-mini"
- `ai_prompt_requested` is NULL
- `ai_model_used` stores "gpt-4o-mini"

### Scenario 3: Custom Prompt Only

Test with a custom prompt but default model.

```bash
curl -X POST http://localhost:7071/api/documents/test-vendor/process-ai-mapping \
  -H "Content-Type: application/json" \
  -d '{
    "aiPrompt": "You are a product catalog expert. Extract only items with both SKU and price. Return JSON with vendor and columnMapping fields."
  }'
```

**Expected:**

- Uses `gpt-4o` model (default)
- Uses provided custom prompt
- `ai_model_requested` is NULL
- `ai_prompt_requested` stores the custom prompt
- `ai_prompt_used` stores the exact prompt sent to AI

### Scenario 4: Both Custom Model and Prompt

Test with both custom parameters.

```bash
curl -X POST http://localhost:7071/api/documents/test-vendor/process-ai-mapping \
  -H "Content-Type: application/json" \
  -d '{
    "aiModel": "gpt-4-turbo",
    "aiPrompt": "Extract product catalog data. Focus on accuracy over completeness. Required fields: name, sku, price."
  }'
```

**Expected:**

- Uses `gpt-4-turbo` model
- Uses provided custom prompt
- Both `ai_model_requested` and `ai_prompt_requested` are populated
- Processing uses these custom values

### Scenario 5: Invalid Model (Error Handling)

Test validation with an unsupported model.

```bash
curl -X POST http://localhost:7071/api/documents/test-vendor/process-ai-mapping \
  -H "Content-Type: application/json" \
  -d '{
    "aiModel": "gpt-5"
  }'
```

**Expected:**

- Returns 400 Bad Request
- Error message lists supported models
- No run created

### Scenario 6: Prompt Too Long (Error Handling)

Test validation with a prompt exceeding 10,000 characters.

```bash
# Generate a long prompt (>10k chars)
LONG_PROMPT=$(python3 -c "print('A' * 10001)")
curl -X POST http://localhost:7071/api/documents/test-vendor/process-ai-mapping \
  -H "Content-Type: application/json" \
  -d "{\"aiPrompt\": \"$LONG_PROMPT\"}"
```

**Expected:**

- Returns 400 Bad Request
- Error indicates max length exceeded
- No run created

### Scenario 7: Model Deployment Unavailable (Graceful Failure)

Test with a valid model name that doesn't have an Azure deployment.

**Expected:**

- Processing starts successfully
- Queue trigger fails with 503 error
- Error message indicates deployment unavailable
- Queue retries automatically

## Verification Steps

### 1. Check Database Values

```sql
-- View requested vs. used parameters
SELECT
    result_id,
    vendor_name,
    ai_model_requested,
    ai_prompt_requested,
    ai_model_used,
    LEFT(ai_prompt_used, 50) as prompt_preview,
    processing_status,
    created_at
FROM vvocr.document_processing_results
WHERE vendor_name = 'test-vendor'
ORDER BY created_at DESC;
```

### 2. Monitor Queue Processing

```bash
# Watch Azure Functions logs
cd code
npm run dev

# In another terminal, trigger processing and watch logs
```

### 3. Compare Results

After running multiple configurations:

1. Check product counts across runs
2. Compare quality metrics (completeness, confidence scores)
3. Analyze extraction accuracy differences
4. Compare processing costs

## Expected Behavior Summary

| Scenario           | Model Used       | Prompt Used      | DB Columns Populated  |
| ------------------ | ---------------- | ---------------- | --------------------- |
| Default            | gpt-4o (default) | Default template | NULL, NULL            |
| Custom model only  | Provided model   | Default template | model, NULL           |
| Custom prompt only | gpt-4o (default) | Provided prompt  | NULL, prompt          |
| Both custom        | Provided model   | Provided prompt  | model, prompt         |
| Invalid model      | N/A - error      | N/A - error      | None (no run created) |
| Prompt too long    | N/A - error      | N/A - error      | None (no run created) |

## Cost Considerations

Different models have different pricing:

- **gpt-4o**: $2.50/1M input, $10.00/1M output tokens
- **gpt-4o-mini**: Lower cost (check Azure pricing)
- **gpt-4-turbo**: Similar to gpt-4o

Monitor `ai_model_cost_usd` in results to compare costs.

## Troubleshooting

### Error: "No existing runs found for vendor"

- Upload a document first before calling process-ai-mapping

### Error: "OCR processing not complete"

- Wait for initial OCR processing to finish
- Check status via GET `/api/documents/:vendorName/results`

### Error: "AI model 'X' failed: ...deployment may not exist"

- Verify the model deployment exists in Azure AI Foundry
- Check that the deployment name matches the model name requested
- Falls back gracefully with 503 error

### Custom prompt produces invalid JSON

- Ensure your prompt explicitly asks for JSON output
- Include schema requirements in the prompt
- Response format is forced to `json_object` by the API call

## Next Steps

1. **UI Integration**: Use GET `/api/ai-config/defaults` to populate form defaults
2. **Result Comparison**: Build UI to compare runs side-by-side
3. **Prompt Library**: Save successful prompts for reuse
4. **A/B Testing**: Run same document through multiple configurations
