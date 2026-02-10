# Dynamic AI Model Discovery

## Overview

The system now dynamically discovers available Azure OpenAI model deployments instead of hardcoding them. This ensures the application stays in sync with Azure deployments automatically.

## Architecture

### Components

1. **AIService.listAvailableModels()** - Queries Azure OpenAI Management API for deployed models
2. **GET /api/ai-config/deployments** - Public endpoint exposing deployment info with metadata
3. **RunService.getDeployedModels()** - Validates user-requested models against live deployments (with 5-min cache)
4. **MODEL_METADATA constant** - Static metadata about known models (pricing, capabilities)

### Data Flow

```
Azure OpenAI Deployments
         ↓
AIService.listAvailableModels()
         ↓
GET /api/ai-config/deployments
         ↓
UI Dropdown / Validation
```

## API Endpoint

### GET /api/ai-config/deployments

Returns list of available model deployments with enriched metadata.

**Response:**

```json
{
  "deployments": [
    {
      "name": "gpt-4o",
      "displayName": "GPT-4o (Recommended)",
      "deployment": "gpt-4o",
      "status": "succeeded",
      "inputCostPer1M": 2.5,
      "outputCostPer1M": 10.0,
      "contextWindow": 128000,
      "capabilities": ["structured-output", "json-mode", "function-calling"],
      "recommended": true
    },
    {
      "name": "gpt-4o-mini",
      "displayName": "GPT-4o Mini (Cost-Effective)",
      "deployment": "gpt-4o-mini",
      "status": "succeeded",
      "inputCostPer1M": 0.15,
      "outputCostPer1M": 0.6,
      "contextWindow": 128000,
      "capabilities": ["structured-output", "json-mode", "function-calling"]
    }
  ],
  "defaultModel": "gpt-4o",
  "defaultPrompt": "...",
  "totalDeployments": 2
}
```

## Model Metadata

### Pricing (per 1M tokens)

| Model       | Input Cost | Output Cost | Context Window |
| ----------- | ---------- | ----------- | -------------- |
| GPT-4o      | $2.50      | $10.00      | 128K           |
| GPT-4o Mini | $0.15      | $0.60       | 128K           |
| GPT-4 Turbo | $10.00     | $30.00      | 128K           |
| GPT-4       | $30.00     | $60.00      | 8K             |

### Capabilities

- **structured-output**: Native structured output format support
- **json-mode**: JSON response format support
- **function-calling**: Function/tool calling support

## Validation Logic

### Request Validation (RunService)

1. User provides optional `aiModel` parameter
2. RunService calls `getDeployedModels()` (cached 5 min)
3. If cache miss, queries AIService.listAvailableModels()
4. Validates user model against deployment list
5. Returns 400 error if model not deployed

### Fallback Strategy

If dynamic discovery fails:

- Falls back to `SUPPORTED_AI_MODELS` constant
- Logs warning to console
- Continues with hardcoded list

## UI Integration

### Model Dropdown

The results viewer dynamically populates the model dropdown:

```javascript
const response = await fetch(`${baseUrl}/api/ai-config/deployments`);
const data = await response.json();

// Populate dropdown with pricing info
data.deployments.forEach((deployment) => {
  const label = `${deployment.displayName} ($${deployment.inputCostPer1M}/$${deployment.outputCostPer1M} per 1M tokens)`;
  // Add to dropdown...
});
```

### Features

- ⭐ Marks default/recommended models
- 💰 Shows pricing information inline
- 📊 Sorts by recommendation first
- 🔄 Refreshes on page load

## Benefits

✅ **No Code Changes for New Models** - Add deployments in Azure, automatically available
✅ **Cost Visibility** - Users see pricing before selecting model
✅ **Accurate Validation** - Only allows models that are actually deployed
✅ **Performance** - 5-minute cache reduces API calls
✅ **Resilient** - Falls back to hardcoded list if discovery fails

## Maintenance

### Adding Model Metadata

To add pricing/capabilities for a new model, edit `src/utils/constants.ts`:

```typescript
export const MODEL_METADATA: Record<string, ModelMetadata> = {
  'new-model-name': {
    name: 'new-model-name',
    displayName: 'New Model Display Name',
    inputCostPer1M: 1.0,
    outputCostPer1M: 3.0,
    contextWindow: 128000,
    capabilities: ['structured-output'],
    recommended: false,
  },
};
```

### Cache Configuration

Adjust cache TTL in `src/services/run-service.ts`:

```typescript
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes (adjust as needed)
```

## Migration Notes

### Deprecated Constants

- `SUPPORTED_AI_MODELS` - Still used as fallback, but prefer dynamic discovery
- Hardcoded model lists in UI - Replaced with API-driven dropdowns

### Breaking Changes

None - backward compatible with existing code.

### Testing

Update E2E tests to use only deployed models:

```typescript
// ❌ Old (might not be deployed)
aiModel: 'gpt-4-turbo';

// ✅ New (query available first)
const deployments = await fetch('/api/ai-config/deployments');
aiModel: deployments.data.deployments[0].deployment;
```
