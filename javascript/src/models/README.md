# Models - Type Definitions

This directory contains centralized type definitions for the entire application. All domain models, API contracts, and data structures are defined here.

## Structure

```
src/models/
├── index.ts             # Barrel export (import from here)
├── document.ts          # Document processing types
├── product.ts           # Product and mapping types
├── vendor.ts            # Vendor management types
├── version.ts           # Version control types
├── ocr.ts               # OCR and table extraction types
├── api-responses.ts     # Standard API response formats
└── usage.ts             # Usage tracking and rate limiting types
```

## Usage

Import types from the barrel export for convenience:

```typescript
import { Document, Product, MappingResult, ProcessingStatus } from '../models/index.js';
```

Or import from specific files if needed:

```typescript
import { Document, UploadResult } from '../models/document.js';
import { Product, QualityMetrics } from '../models/product.js';
```

## Model Categories

### Document Models (`document.ts`)

Core types for document processing pipeline:

- `Document` - Full document record with OCR and AI results
- `ProcessingStatus` - Document processing state
- `UploadRequest` / `UploadResult` - Upload operations
- `DeleteDocumentResult` - Deletion operations
- `ReprocessResult` - Reprocessing operations
- `ConfirmMappingResult` - Export operations

### Product Models (`product.ts`)

Types for product extraction and AI mapping:

- `Product` - Extracted product data
- `MappingResult` - Complete AI mapping result
- `QualityMetrics` - Quality assessment scores
- `TokenUsage` - AI token consumption
- `ColumnMapping` - Detected column structure

### Vendor Models (`vendor.ts`)

Vendor management types:

- `VendorNameParts` - Parsed vendor name components
- `DeleteVendorResult` - Vendor deletion result

### Version Models (`version.ts`)

Document versioning and history:

- `Version` - Single version record
- `VersionHistory` - Complete version chain
- `DeleteRunResult` - Version deletion result

### OCR Models (`ocr.ts`)

Azure Document Intelligence types:

- `TableCell` - Individual table cell
- `Table` - Complete table structure
- `OCRResult` - OCR processing result
- `OCRData` - Bronze-layer OCR storage format

### API Response Models (`api-responses.ts`)

Standard HTTP response formats:

- `ApiResponse<T>` - Generic success response
- `ErrorResponse` - Error response format
- `PaginatedResponse<T>` - Paginated data
- `OperationResult` - Operation status

### Usage Models (`usage.ts`)

Rate limiting and tracking:

- `UsageStats` - Current usage statistics
- `RateLimitCheck` - Rate limit validation
- `CleanupResult` - Usage cleanup result

## Design Principles

1. **Single Source of Truth**: All types defined once, imported everywhere
2. **JSDoc Documentation**: Every type has descriptive comments
3. **Consistent Naming**: Clear, descriptive names following conventions
4. **Type Safety**: Strict TypeScript types, no `any`
5. **Reusability**: Types can be composed and extended
6. **API Alignment**: Types match database schema and API contracts

## Benefits

✅ **No Duplication**: Types defined once, used everywhere  
✅ **Better IDE Support**: Autocomplete and type checking  
✅ **Easier Refactoring**: Change once, update everywhere  
✅ **Clear Contracts**: Explicit interfaces between layers  
✅ **Documentation**: Self-documenting code with JSDoc  
✅ **Type Generation**: Ready for OpenAPI schema generation

## Future Enhancements

- **Type Documentation**: Generate HTML docs with TypeDoc
- **Schema Validation**: Add runtime validation with Zod
- **OpenAPI Generation**: Auto-generate API specs from types
- **Database Migrations**: Keep types in sync with schema changes
