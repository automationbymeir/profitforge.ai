# Dynamic AI Model and Prompt Selection - Implementation Summary

## Overview

Enhanced the `process-ai-mapping` endpoint to support custom AI model and prompt selection, enabling users to test different configurations without re-running expensive OCR processing.

## Changes Made

### 1. Database Schema (`infra/vvocr-schema.sql`)

Added two new columns to `document_processing_results` table:

- `ai_model_requested NVARCHAR(100) NULL` - User-requested model
- `ai_prompt_requested NVARCHAR(MAX) NULL` - User-requested custom prompt (10k char limit enforced by app)

**Migration Script**: [`infra/migrations/add-ai-requested-params.sql`](../infra/migrations/add-ai-requested-params.sql)

### 2. Constants Configuration (`code/src/utils/constants.ts`)

**Added:**

- `AI_MODELS.GPT_4O_MINI` and `AI_MODELS.GPT_4_TURBO` model options
- `SUPPORTED_AI_MODELS` - Array of valid model names for validation
- `DEFAULT_AI_MODEL` - Default model (gpt-4o)
- `DEFAULT_AI_PROMPT` - Template prompt with `{HEADERS}` and `{CONTEXT}` placeholders
- `AI_PROMPT_MAX_LENGTH = 10000` - Maximum prompt length

### 3. Document Repository (`code/src/data/repositories/DocumentRepository.ts`)

**Added:**

- `UpdateAiParametersInput` interface
- `updateAiParameters()` method - Stores requested model/prompt
- Updated `getRunByID()` query to include new columns

### 4. Run Service (`code/src/services/run-service.ts`)

**Enhanced `createAIRun()` method:**

- Removed `_` prefix from `aiModel` and `aiPrompt` parameters
- Added validation for model (must be in `SUPPORTED_AI_MODELS`)
- Added validation for prompt length (max 10,000 chars)
- Stores requested parameters via `documentRepo.updateAiParameters()`
- Parameters flow: endpoint → database → queue → AI service

### 5. AI Service (`code/src/services/ai-service.ts`)

**Major Refactoring:**

- Changed constructor to store endpoint/apiKey instead of creating fixed OpenAI client
- Added `createOpenAIClient()` method - Creates client for specific model deployment
- Enhanced `mapProducts()` method:
  - Retrieves `ai_model_requested` and `ai_prompt_requested` from database
  - Defaults to `DEFAULT_AI_MODEL` and `DEFAULT_AI_PROMPT` if not specified
  - Creates OpenAI client dynamically based on requested model
  - Uses custom prompt directly or populates template with headers/context
  - Graceful error handling for unavailable model deployments (503 error)
  - Stores actual model/prompt used in `ai_model_used` and `ai_prompt_used`

### 6. HTTP Endpoint - Process AI Mapping (`code/src/functions/http/documents/process-ai-mapping.ts`)

**No changes needed** - Already accepts `aiModel` and `aiPrompt` parameters in request body.

### 7. Queue Trigger (`code/src/functions/infra-adapters/queues.ts`)

**No changes needed** - Already passes documentId to AIService, which retrieves parameters from database.

### 8. New Endpoint - Get AI Defaults (`code/src/functions/http/documents/get-ai-defaults.ts`)

**Created new GET endpoint:**

- Route: `/api/ai-config/defaults`
- Returns: `defaultModel`, `defaultPrompt`, `supportedModels`
- Purpose: UI can fetch defaults to display as reference

### 9. Document Type (`code/src/functions/http/common/models/document.ts`)

**Updated `Document` interface:**

- Added `ai_model_requested: string | null`
- Added `ai_prompt_requested: string | null`

## Data Flow

```
1. HTTP Request
   POST /api/documents/:vendorName/process-ai-mapping
   Body: { aiModel?: string, aiPrompt?: string }

2. RunService.createAIRun()
   - Validates model (must be in SUPPORTED_AI_MODELS)
   - Validates prompt length (max 10,000 chars)
   - Creates new run record
   - Stores ai_model_requested, ai_prompt_requested in DB
   - Queues processing

3. Queue Trigger (aiProductMapperQueueTrigger)
   - Receives documentId
   - Calls AIService.mapProducts(documentId)

4. AIService.mapProducts()
   - Retrieves document including ai_model_requested, ai_prompt_requested
   - Defaults to DEFAULT_AI_MODEL and DEFAULT_AI_PROMPT if null
   - Creates OpenAI client for requested model
   - Uses custom prompt or populates template
   - Calls OpenAI API with requested configuration
   - Stores ai_model_used, ai_prompt_used (what was actually used)
```

## Validation & Error Handling

### Input Validation (RunService)

- **Invalid Model**: Returns 400 with list of supported models
- **Prompt Too Long**: Returns 400 with max length (10,000) and provided length

### Runtime Errors (AIService)

- **Model Deployment Unavailable**: Returns 503 with descriptive error
- **Document Not Found**: Returns 404
- **Invalid Processing Status**: Returns 400

### Graceful Degradation

- If no custom parameters provided, uses defaults
- If model deployment fails, returns clear error message
- Queue retries automatically on transient failures

## API Examples

### Get Defaults

```bash
GET /api/ai-config/defaults
```

Response:

```json
{
  "defaultModel": "gpt-4o",
  "defaultPrompt": "You are analyzing product catalog tables...",
  "supportedModels": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"]
}
```

### Process with Defaults

```bash
POST /api/documents/vendor-name/process-ai-mapping
Content-Type: application/json
```

Uses `gpt-4o` and default prompt template.

### Process with Custom Model

```bash
POST /api/documents/vendor-name/process-ai-mapping
Content-Type: application/json

{
  "aiModel": "gpt-4o-mini"
}
```

### Process with Custom Prompt

```bash
POST /api/documents/vendor-name/process-ai-mapping
Content-Type: application/json

{
  "aiPrompt": "Extract products focusing on SKU and price accuracy..."
}
```

### Process with Both Custom

```bash
POST /api/documents/vendor-name/process-ai-mapping
Content-Type: application/json

{
  "aiModel": "gpt-4-turbo",
  "aiPrompt": "Custom prompt here..."
}
```

## Database Schema

```sql
-- Requested parameters (what user asked for)
ai_model_requested NVARCHAR(100) NULL,
ai_prompt_requested NVARCHAR(MAX) NULL,

-- Used parameters (what actually ran)
ai_model_used NVARCHAR(100) NULL,
ai_prompt_used NVARCHAR(MAX) NULL
```

This separation allows tracking:

- What the user wanted to test
- What actually executed
- Differences due to defaults or fallbacks

## Testing

See comprehensive testing guide: [`docs/testing-dynamic-ai-parameters.md`](testing-dynamic-ai-parameters.md)

Includes:

- 7 test scenarios
- Database verification queries
- Expected behavior matrix
- Troubleshooting guide

## Benefits

1. **Experimentation**: Test different models without re-running OCR
2. **Cost Optimization**: Try cheaper models (gpt-4o-mini) for less complex documents
3. **Prompt Engineering**: Iterate on prompts to improve extraction quality
4. **A/B Testing**: Compare results across configurations
5. **UI Flexibility**: Provide model/prompt selection in UI with sensible defaults

## Future Enhancements

- **Prompt Library**: Save successful prompts for reuse
- **Result Comparison**: UI to compare runs side-by-side
- **Auto-Selection**: Recommend model based on document complexity
- **Prompt Templates**: Pre-built templates for common scenarios
- **Cost Tracking**: Dashboard showing cost per model/vendor
