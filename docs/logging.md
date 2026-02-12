# Logging and Monitoring Guide

Comprehensive guide for logging best practices in Azure Functions v4.

## Overview

This application uses a combination of Azure Functions structured logging and standard Node.js console output. Understanding when to use each is critical for maintainability and debugging.

## Logging Methods Comparison

| Method | Purpose | Visibility | Best For |
|--------|---------|-----------|----------|
| **`context.log()`** | Azure Functions structured logging | Application Insights, Log Stream, metrics | Production logging |
| **`console.log()`** | Standard Node.js output | Local dev console, Log Stream (unstructured) | Local debugging only |
| **`context.error()`** | ❌ **Doesn't exist in v4** | N/A | Use `context.log()` instead |
| **`console.error()`** | Error output with stack traces | stderr, Log Stream | Error debugging |

### context.log()

**Advantages:**
- ✅ Integrates with Application Insights
- ✅ Structured logging with correlation IDs
- ✅ Respects `host.json` log levels
- ✅ Includes function invocation context
- ✅ Can be queried/analyzed in Azure Portal
- ✅ Supports custom properties for filtering

**Usage:**
```typescript
// Simple message
context.log('Processing document', documentId);

// Structured data (recommended)
context.log('Document processed', {
  documentId,
  vendor: vendorName,
  productCount: products.length,
  duration: Date.now() - startTime
});

// With emojis for visual clarity (log stream)
context.log('✅ Export complete', { exportedCount: 42 });
```

### console.log()

**Advantages:**
- ✅ Familiar Node.js API
- ✅ Good for local development
- ✅ Works in any JavaScript environment

**Disadvantages:**
- ⚠️ Plain text output only
- ⚠️ No structured data support
- ⚠️ Harder to filter/search in Azure
- ⚠️ Still appears in Application Insights (as unstructured traces)
- ⚠️ Clutters production logs

**Usage:**
```typescript
// Local debugging only
console.log('Creating DocumentService');
console.log('Query returned', result.recordset.length, 'records');

// ❌ AVOID in production code - use context.log() instead
```

## Error Logging

Azure Functions v4 does **not** have `context.error()` or `context.warn()`. Use these alternatives:

### For Production Errors

```typescript
// ✅ BEST: Combine both for maximum visibility
try {
  await processDocument(documentId);
} catch (error) {
  // Structured log for Application Insights
  context.log('❌ Document processing failed', {
    documentId,
    error: error instanceof Error ? error.message : String(error),
    url: req.url,
    timestamp: new Date().toISOString()
  });
  
  // Stack trace for debugging (local + log stream)
  console.error('❌ ERROR:', error instanceof Error ? error.message : String(error));
  if (error instanceof Error && error.stack) {
    console.error('Stack trace:', error.stack);
  }
  
  throw error; // Re-throw for error handler
}
```

### For Warnings

```typescript
// ✅ Use context.log() with warning prefix
context.log('⚠️ Rate limit approaching', {
  currentUsage: 95,
  limit: 100,
  ipAddress: clientIp
});
```

### In Error Handler Middleware

See [error-handler.ts](../code/src/functions/http/common/middleware/error-handler.ts) for the standard pattern:

```typescript
export function withErrorHandler(handler: Handler): Handler {
  return async (req: HttpRequest, context: InvocationContext) => {
    try {
      return await handler(req, context);
    } catch (error) {
      // Structured log for Application Insights
      context.log('❌ Unhandled error in handler:', {
        url: req.url,
        method: req.method,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Console for debugging
      console.error('❌ ERROR:', error instanceof Error ? error.message : String(error));
      if (error instanceof Error && error.stack) {
        console.error('Stack trace:', error.stack);
      }

      // Return error response
      return errorResponse('Internal Server Error', 500);
    }
  };
}
```

## Log Level Configuration

Configure log verbosity in [host.json](../code/host.json) to control noise:

### Recommended Production Configuration

```json
{
  "version": "2.0",
  "logging": {
    "applicationInsights": {
      "samplingSettings": {
        "isEnabled": true,
        "maxTelemetryItemsPerSecond": 20
      }
    },
    "logLevel": {
      "default": "Warning",
      "Function": "Information",
      "Host.Results": "Error",
      "Host.Aggregator": "Warning"
    }
  },
  "extensionBundle": {
    "id": "Microsoft.Azure.Functions.ExtensionBundle",
    "version": "[4.*, 5.0.0)"
  }
}
```

### Log Level Breakdown

| Category | Level | Purpose |
|----------|-------|---------|
| `default` | `Warning` | System components only log warnings/errors |
| `Function` | `Information` | Your `context.log()` statements appear |
| `Host.Results` | `Error` | Silences "Executed 'Functions.xyz' (Succeeded)" spam |
| `Host.Aggregator` | `Warning` | Reduces metric aggregation noise |

### Available Log Levels

From most to least verbose:
1. `Trace` - Very detailed, every operation
2. `Debug` - Detailed debugging information
3. `Information` - General informational messages (default for functions)
4. `Warning` - Warning messages, function still succeeds
5. `Error` - Error messages only
6. `Critical` - Critical failures
7. `None` - No logging

### Local Development Configuration

For local development, you may want more verbose logging:

```json
{
  "version": "2.0",
  "logging": {
    "logLevel": {
      "default": "Information",
      "Function": "Information"
    }
  }
}
```

## Best Practices

### ✅ DO

1. **Use `context.log()` for production:**
   ```typescript
   context.log('Processing complete', { 
     documentId, 
     productCount: 42,
     duration: 1234 
   });
   ```

2. **Log meaningful state changes:**
   ```typescript
   context.log('✅ Document exported to production catalog', {
     vendor: vendorName,
     productsExported: count
   });
   ```

3. **Include context in error logs:**
   ```typescript
   context.log('❌ Failed to parse document', {
     documentId,
     vendor: vendorName,
     error: error.message
   });
   ```

4. **Use emojis for visual scanning in log streams:**
   - ✅ Success
   - ❌ Error
   - ⚠️ Warning
   - 🔄 Processing
   - 📤 Upload
   - 💾 Storage
   - 🎯 Grading

5. **Structure logs with objects:**
   ```typescript
   // Good
   context.log('Query executed', { 
     vendor, 
     limit, 
     resultCount,
     queryTimeMs: 123 
   });
   
   // Bad
   context.log('Query executed for vendor ' + vendor + ' with limit ' + limit);
   ```

### ❌ DON'T

1. **Don't use `console.log()` in production code:**
   ```typescript
   // ❌ BAD: Clutters logs, no structure
   console.log('Creating DocumentService');
   console.log('DocumentService created');
   
   // ✅ GOOD: Single meaningful log
   context.log('Document service initialized');
   ```

2. **Don't log sensitive data:**
   ```typescript
   // ❌ BAD: Exposes secrets
   context.log('Connection string:', process.env.SQL_CONNECTION_STRING);
   
   // ✅ GOOD: Log without sensitive details
   context.log('Database connected', { server: serverName });
   ```

3. **Don't log too verbosely:**
   ```typescript
   // ❌ BAD: Noisy, not useful
   console.log('Query returned', result.recordset.length, 'records');
   console.log('Found vendor_name:', result.recordset[0].vendor_name);
   
   // ✅ GOOD: One meaningful log
   context.log('Vendor document found', { 
     vendor: result.recordset[0].vendor_name,
     recordCount: result.recordset.length 
   });
   ```

4. **Don't use `context.error()` (doesn't exist in v4):**
   ```typescript
   // ❌ BAD: Will throw runtime error
   context.error('Something failed');
   
   // ✅ GOOD: Use context.log() + console.error()
   context.log('❌ Operation failed', { error: error.message });
   console.error('Full error:', error);
   ```

## Viewing Logs

### Local Development

```bash
# Start functions with visible logs
cd code
npm run dev

# Logs appear in terminal automatically
```

### Remote Azure Function App

#### Live Log Stream (CLI)

```bash
# Stream logs from deployed function
func azure functionapp logstream profitforge-staging-functions --browser

# Or with Azure CLI
az webapp log tail \
  --name profitforge-staging-functions \
  --resource-group profitforge-staging-rg
```

#### Azure Portal

1. Navigate to Function App in Azure Portal
2. **Monitor > Log stream** - Real-time logs
3. **Monitor > Application Insights** - Query historical logs

#### Application Insights Queries

Access via Portal > Application Insights > Logs:

```kusto
// All logs from last hour
traces
| where timestamp > ago(1h)
| order by timestamp desc

// Errors only
traces
| where severityLevel >= 3
| where timestamp > ago(24h)
| project timestamp, message, severityLevel, customDimensions

// Specific function
traces
| where timestamp > ago(1h)
| where operation_Name == "getResults"
| project timestamp, message, customDimensions

// Custom dimensions (from context.log structured data)
traces
| where timestamp > ago(1h)
| extend documentId = tostring(customDimensions.documentId)
| extend productCount = toint(customDimensions.productCount)
| where isnotnull(productCount)
| project timestamp, message, documentId, productCount
```

## Cleaning Up Debug Logs

Before deploying to production, audit and remove debug logs:

```bash
# Find all console.log statements
grep -rn "console\.log" code/src --include="*.ts"

# Count them
grep -r "console\.log" code/src --include="*.ts" | wc -l

# Find debug/trace logs
grep -rn "console\.\|Creating \|Query returned" code/src --include="*.ts"
```

### Recommended Cleanup

Keep these logs:
- ✅ Function entry points with key parameters
- ✅ Significant state transitions (started, completed, failed)
- ✅ User-facing actions (export, upload, delete)
- ✅ Error conditions with context

Remove these logs:
- ❌ `console.log('Creating DocumentService')`
- ❌ `console.log('Query returned X records')`
- ❌ `console.log('getResults invoked')`
- ❌ Service initialization details
- ❌ Internal method entry/exit

## Environment-Aware Logging Utility (Optional)

Create `code/src/utils/logger.ts` for automatic verbosity control:

```typescript
import { InvocationContext } from '@azure/functions';

const isDevelopment = process.env.NODE_ENV !== 'production';

export function logDebug(context: InvocationContext | null, message: string, data?: any) {
  if (isDevelopment) {
    console.log(`[DEBUG] ${message}`, data || '');
  }
  // In production, these are silenced
}

export function logInfo(context: InvocationContext | null, message: string, data?: any) {
  if (context) {
    context.log(message, data);
  } else {
    console.log(message, data || '');
  }
}

export function logError(context: InvocationContext | null, message: string, error: any) {
  if (context) {
    context.log(`❌ ${message}`, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
  }
  console.error(`❌ ${message}`, error);
  if (error instanceof Error && error.stack) {
    console.error('Stack:', error.stack);
  }
}
```

Usage:

```typescript
import { logDebug, logInfo, logError } from '../utils/logger.js';

// Verbose in dev, silent in production
logDebug(context, 'Creating DocumentService');

// Always logged
logInfo(context, '✅ Document processed', { documentId, productCount: 42 });

// Errors with full context
try {
  await processDocument();
} catch (error) {
  logError(context, 'Document processing failed', error);
  throw error;
}
```

## Further Reading

- [Azure Functions Monitoring](https://learn.microsoft.com/en-us/azure/azure-functions/functions-monitoring)
- [Application Insights for Azure Functions](https://learn.microsoft.com/en-us/azure/azure-functions/functions-monitoring?tabs=cmd#application-insights-integration)
- [Configure monitoring for Azure Functions](https://learn.microsoft.com/en-us/azure/azure-functions/configure-monitoring)
