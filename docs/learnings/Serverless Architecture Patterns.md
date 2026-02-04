# Serverless Architecture Patterns: Dependency Management

**Date:** February 4, 2026  
**Topic:** Comparing dependency management patterns for Azure Functions serverless architecture

## Context

Our current architecture uses OOP classes with singleton factory functions. As we scale and embrace serverless/event-driven patterns, we're evaluating whether this is the optimal approach.

**Key constraint:** Database connection pool MUST be singleton (connections are expensive resources that need to be reused).

---

## Current Implementation: OOP with Singleton Factories

### Architecture

```typescript
// services/document-service.ts
export class DocumentService {
  constructor(
    private documentRepo: DocumentRepository,
    private vendorProductRepo: VendorProductRepository,
    private storageService: StorageService,
    private queueService: QueueService,
    private documentsContainer: string = 'uploads'
  ) {}

  async upload(file: File, vendorName: string): Promise<UploadResult> {
    await this.storageService.uploadBlob(...);
    const resultId = await this.documentRepo.create(...);
    await this.queueService.queueOCRProcessing(resultId, filePath);
    return { resultId, ... };
  }
}

// Singleton factory
let documentServiceInstance: DocumentService | null = null;

export async function getDocumentService(): Promise<DocumentService> {
  if (!documentServiceInstance) {
    const pool = await getConnectionPool(); // DB pool singleton
    const documentRepo = new DocumentRepository(pool);
    const vendorProductRepo = new VendorProductRepository(pool);
    const storageService = new StorageService(process.env.STORAGE_CONNECTION_STRING!);
    const queueService = new QueueService(process.env.STORAGE_CONNECTION_STRING!);
    
    documentServiceInstance = new DocumentService(
      documentRepo,
      vendorProductRepo,
      storageService,
      queueService
    );
  }
  return documentServiceInstance;
}
```

### Usage in Handlers

```typescript
// functions/http/documents/upload.ts
import { getDocumentService } from '../../../services/document-service.js';

export async function uploadHandler(req: HttpRequest, context: InvocationContext) {
  const documentService = await getDocumentService();
  const result = await documentService.upload(file, vendorName);
  return successResponse(result);
}
```

### Pros

✅ **Familiar OOP patterns** — Easy for developers with OOP background  
✅ **Clear encapsulation** — Business logic inside class methods  
✅ **Works well** — Production-tested, no critical issues  
✅ **Dependency injection** — Constructor shows what service needs  
✅ **Resource efficiency** — Singleton ensures one instance per function app  

### Cons

❌ **Manual factory functions** — Each service needs `getXService()` boilerplate  
❌ **Hidden dependencies** — Factories create dependencies internally  
❌ **Testing complexity** — Need to mock singleton getters or bypass factories  
❌ **Heavyweight** — Class overhead (prototypes, `this` binding)  
❌ **Not tree-shakable** — Bundlers include entire class even if only using one method  
❌ **Cold start overhead** — Class instantiation adds minor overhead  
❌ **Circular dependency risk** — Services importing each other's factories  

### Performance

- **Cold start**: ~100-500ms (mostly DB pool creation)
- **Warm requests**: <1ms (singleton cached)
- **Memory**: ~50-100KB per service instance

---

## Option A: Dependency Injection Container (InversifyJS)

### Architecture

```typescript
// container.ts - Single source of truth
import { Container } from 'inversify';
import 'reflect-metadata';

const container = new Container();

// Bind infrastructure (singletons)
container.bind('DatabasePool').toConstantValue(await createPool());
container.bind('ConnectionString').toConstantValue(process.env.STORAGE_CONNECTION_STRING!);

// Bind data layer
container.bind(DocumentRepository).toSelf().inSingletonScope();
container.bind(VendorProductRepository).toSelf().inSingletonScope();

// Bind infrastructure services (singletons)
container.bind(StorageService).toSelf().inSingletonScope();
container.bind(QueueService).toSelf().inSingletonScope();

// Bind domain services (transient or singleton)
container.bind(DocumentService).toSelf().inSingletonScope();

export { container };
```

```typescript
// services/document-service.ts
import { injectable, inject } from 'inversify';

@injectable()
export class DocumentService {
  constructor(
    @inject(DocumentRepository) private documentRepo: DocumentRepository,
    @inject(VendorProductRepository) private vendorProductRepo: VendorProductRepository,
    @inject(StorageService) private storageService: StorageService,
    @inject(QueueService) private queueService: QueueService
  ) {}

  async upload(file: File, vendorName: string): Promise<UploadResult> {
    // Same business logic
  }
}
```

### Usage in Handlers

```typescript
// functions/http/documents/upload.ts
import { container } from '../../../container.js';
import { DocumentService } from '../../../services/document-service.js';

export async function uploadHandler(req: HttpRequest, context: InvocationContext) {
  const documentService = container.get(DocumentService);
  const result = await documentService.upload(file, vendorName);
  return successResponse(result);
}
```

### Testing

```typescript
// Easy mocking
const mockContainer = new Container();
mockContainer.bind(StorageService).toConstantValue(mockStorage);
mockContainer.bind(QueueService).toConstantValue(mockQueue);
mockContainer.bind(DocumentService).toSelf();

const service = mockContainer.get(DocumentService);
```

### Pros

✅ **Centralized configuration** — All bindings in one place  
✅ **Explicit dependency graph** — Container shows entire app structure  
✅ **Easy testing** — Mock entire container or individual services  
✅ **Type-safe** — TypeScript support with decorators  
✅ **Flexible scopes** — Singleton, transient, request-scoped  
✅ **No manual factories** — Container handles creation  
✅ **Circular dependency detection** — Container warns about cycles  

### Cons

❌ **Decorator overhead** — Requires `reflect-metadata`, experimental decorators  
❌ **Bundle size** — InversifyJS adds ~50KB to bundle  
❌ **Learning curve** — Team needs to understand DI container concepts  
❌ **Overkill for small projects** — More complexity than needed for <10 services  
❌ **Cold start overhead** — Container initialization adds ~10-20ms  
❌ **Still OOP-based** — Doesn't address class overhead issues  

### Performance

- **Cold start**: ~110-520ms (container init + DB pool)
- **Warm requests**: <1ms
- **Memory**: ~150-200KB (container + service instances)
- **Bundle size**: +50KB

### When to Use

✅ Large codebases (>20 services)  
✅ Complex dependency graphs  
✅ Teams familiar with enterprise patterns (Spring, .NET Core)  
✅ Need for advanced features (decorators, middleware, interceptors)  

---

## Option B: Functional Composition (Recommended for Serverless)

### Architecture

```typescript
// types.ts
export interface Dependencies {
  db: DatabasePool;
  storage: StorageService;
  queue: QueueService;
}

export interface DocumentRepository {
  create(input: CreateDocumentInput): Promise<string>;
  findById(id: string): Promise<Document | null>;
  findByVendor(vendor: string): Promise<Document[]>;
}

export interface StorageService {
  uploadBlob(container: string, path: string, buffer: Buffer): Promise<{ url: string }>;
  deleteBlob(container: string, path: string): Promise<void>;
}

export interface QueueService {
  queueOCRProcessing(documentId: string, blobPath: string): Promise<void>;
  queueAIMapping(documentId: string): Promise<void>;
}
```

```typescript
// bootstrap.ts - Singleton dependencies
let _deps: Dependencies | null = null;

export async function getDependencies(): Promise<Dependencies> {
  if (!_deps) {
    const connectionString = process.env.STORAGE_CONNECTION_STRING!;
    
    _deps = {
      db: await createPool(),
      storage: createStorageService(connectionString),
      queue: createQueueService(connectionString)
    };
  }
  return _deps;
}
```

```typescript
// services/document-service.ts - Pure functions
import type { Dependencies, DocumentRepository } from '../types.js';

export const createDocumentService = (
  deps: Dependencies,
  documentRepo: DocumentRepository,
  vendorProductRepo: VendorProductRepository
) => ({
  upload: async (file: File, vendorName: string): Promise<UploadResult> => {
    // Same business logic, but pure
    await deps.storage.uploadBlob(container, filePath, fileBuffer, file.type);
    const resultId = await documentRepo.create({ ... });
    await deps.queue.queueOCRProcessing(resultId, filePath);
    
    return { resultId, documentName: file.name, vendorName, filePath, status: 'pending' };
  },

  deleteDocument: async (documentId: string): Promise<DeleteResult> => {
    const document = await documentRepo.findById(documentId);
    if (!document) {
      const error = new Error('Document not found') as Error & { statusCode: number };
      error.statusCode = 404;
      throw error;
    }
    
    await deps.storage.deleteBlob(container, document.document_path);
    const deleted = await documentRepo.deleteById(documentId);
    
    return { documentsDeleted: deleted, blobsDeleted: 1 };
  },

  // ... other methods
});
```

```typescript
// services/index.ts - Compose once at module level
import { getDependencies } from '../bootstrap.js';
import { DocumentRepository } from '../data/repositories/DocumentRepository.js';
import { VendorProductRepository } from '../data/repositories/VendorProductRepository.js';
import { createDocumentService } from './document-service.js';
import { createOCRService } from './ocr-service.js';

let _services: Services | null = null;

export async function getServices() {
  if (!_services) {
    const deps = await getDependencies();
    const documentRepo = new DocumentRepository(deps.db);
    const vendorProductRepo = new VendorProductRepository(deps.db);
    
    _services = {
      document: createDocumentService(deps, documentRepo, vendorProductRepo),
      ocr: createOCRService(deps, documentRepo),
      ai: createAIService(deps, documentRepo)
    };
  }
  return _services;
}
```

### Usage in Handlers

```typescript
// functions/http/documents/upload.ts
import { getServices } from '../../../services/index.js';

export async function uploadHandler(req: HttpRequest, context: InvocationContext) {
  const { document } = await getServices();
  const result = await document.upload(file, vendorName);
  return successResponse(result);
}
```

### Testing

```typescript
// Easy pure function testing
const mockDeps = {
  storage: { uploadBlob: vi.fn() },
  queue: { queueOCRProcessing: vi.fn() }
};

const mockRepo = { create: vi.fn(), findById: vi.fn() };
const service = createDocumentService(mockDeps, mockRepo, mockVendorRepo);

await service.upload(file, 'vendor');
expect(mockDeps.storage.uploadBlob).toHaveBeenCalled();
```

### Pros

✅ **No classes** — Plain objects and functions, minimal overhead  
✅ **Tree-shakable** — Bundlers eliminate unused code  
✅ **Easy to test** — Pure functions, simple mocking  
✅ **Type-safe** — Full TypeScript support with interfaces  
✅ **Fast cold starts** — No class instantiation overhead  
✅ **Clear dependencies** — Function parameters show exactly what's needed  
✅ **Composable** — Easy to create service variations  
✅ **Modern JavaScript** — Aligns with current ecosystem trends  
✅ **Small bundle size** — No framework dependencies  

### Cons

❌ **Paradigm shift** — Team needs to adapt from OOP to functional  
❌ **Less encapsulation** — No private methods (use nested functions)  
❌ **Potential duplication** — Might duplicate validation logic across functions  
❌ **Loss of `this`** — Can't use class instance state (but that's also a pro)  

### Performance

- **Cold start**: ~95-495ms (5-10ms faster than OOP)
- **Warm requests**: <1ms
- **Memory**: ~30-50KB (no class overhead)
- **Bundle size**: No additional dependencies

### When to Use

✅ Serverless/FaaS architectures  
✅ Small to medium codebases  
✅ Teams comfortable with functional programming  
✅ Performance-critical applications  
✅ Projects prioritizing cold start optimization  

---

## Option C: Azure Durable Functions (Event Orchestration)

### Architecture

```typescript
// orchestrators/document-processing.ts
import { orchestrator } from 'durable-functions';

export const documentProcessingOrchestrator = orchestrator(function* (context) {
  const { file, vendorName } = context.df.getInput();
  
  try {
    // Step 1: Upload document
    const uploadResult = yield context.df.callActivity('uploadDocument', { file, vendorName });
    
    // Step 2: Process OCR (with retry)
    const ocrResult = yield context.df.callActivityWithRetry('processOCR', {
      maxNumberOfAttempts: 3,
      firstRetryIntervalInMilliseconds: 5000
    }, { documentId: uploadResult.documentId, blobPath: uploadResult.filePath });
    
    // Step 3: AI Mapping (with retry)
    const products = yield context.df.callActivityWithRetry('mapProducts', {
      maxNumberOfAttempts: 3,
      firstRetryIntervalInMilliseconds: 5000
    }, { documentId: uploadResult.documentId, ocrData: ocrResult });
    
    // Step 4: Optional - Wait for user confirmation
    const confirmEvent = yield context.df.waitForExternalEvent('confirm-mapping');
    
    // Step 5: Export to production
    const exportResult = yield context.df.callActivity('exportProducts', {
      documentId: uploadResult.documentId,
      products
    });
    
    return {
      status: 'completed',
      documentId: uploadResult.documentId,
      productsExported: exportResult.count
    };
    
  } catch (error) {
    // Compensating transaction
    yield context.df.callActivity('cleanupFailedDocument', { documentId });
    throw error;
  }
});
```

```typescript
// activities/upload-document.ts
export async function uploadDocument([input]: [{ file: File; vendorName: string }]) {
  const deps = await getDependencies();
  
  await deps.storage.uploadBlob(container, filePath, fileBuffer);
  const resultId = await deps.db.query(/* insert */);
  
  return { documentId: resultId, filePath, vendorName };
}
```

```typescript
// activities/process-ocr.ts
export async function processOCR([input]: [{ documentId: string; blobPath: string }]) {
  const deps = await getDependencies();
  
  // Download blob
  const blob = await deps.storage.downloadBlob(container, blobPath);
  
  // Process with Document Intelligence
  const ocrResult = await processWithDocumentIntelligence(blob);
  
  // Update database
  await deps.db.query(/* update OCR results */);
  
  return ocrResult;
}
```

### Usage in Handler

```typescript
// functions/http/documents/upload.ts
import { getClient } from 'durable-functions';

export async function uploadHandler(req: HttpRequest, context: InvocationContext) {
  const client = getClient(context);
  
  // Start orchestration
  const instanceId = await client.startNew('documentProcessingOrchestrator', {
    input: { file, vendorName }
  });
  
  // Return immediately with tracking URL
  return client.createCheckStatusResponse(req, instanceId);
}
```

### Monitoring

```typescript
// Check status
const status = await client.getStatus(instanceId);
// status.runtimeStatus: 'Running', 'Completed', 'Failed'
// status.output: Final result
// status.history: Full execution history
```

### Pros

✅ **Built-in orchestration** — Complex workflows with visual diagrams  
✅ **Automatic retry** — Configurable retry policies per activity  
✅ **State management** — Automatic checkpointing and recovery  
✅ **Compensation logic** — Built-in support for rollback transactions  
✅ **External events** — Wait for user input or external systems  
✅ **Monitoring** — Azure Portal shows execution history and status  
✅ **Scalable** — Activities can run in parallel or on different instances  
✅ **Durable** — Survives function app restarts  
✅ **Timeouts** — Built-in support for long-running operations  

### Cons

❌ **Azure-specific** — Tight coupling to Azure Durable Functions  
❌ **Learning curve** — Generator functions, orchestrator constraints  
❌ **Debugging complexity** — Replay behavior can be confusing  
❌ **Cost** — Storage costs for orchestration state  
❌ **Local development** — Requires Azurite storage emulator  
❌ **Orchestrator limitations** — No direct I/O, no random numbers, must be deterministic  
❌ **Overkill for simple workflows** — Too heavy for basic CRUD operations  

### Performance

- **Cold start**: ~200-600ms (orchestrator + activity startup)
- **Per activity**: ~50-200ms overhead (checkpoint + state management)
- **Storage cost**: ~$0.05 per 10,000 orchestrations
- **Good for**: Long-running workflows (minutes to hours)
- **Overkill for**: Sub-second operations

### When to Use

✅ Complex multi-step workflows  
✅ Need for retry/compensation logic  
✅ Long-running operations (>30 seconds)  
✅ Human-in-the-loop scenarios (approval workflows)  
✅ Need execution history and monitoring  
✅ Coordinating multiple distributed services  

---

## Decision Matrix

| Criteria | Current (OOP) | Option A (DI Container) | Option B (Functional) | Option C (Durable) |
|----------|---------------|-------------------------|----------------------|-------------------|
| **Learning Curve** | Low | Medium | Low-Medium | High |
| **Bundle Size** | Medium | Large (+50KB) | Small | Medium |
| **Cold Start** | ~100-500ms | ~110-520ms | ~95-495ms | ~200-600ms |
| **Testability** | Good | Excellent | Excellent | Good |
| **Type Safety** | Excellent | Excellent | Excellent | Good |
| **Boilerplate** | Medium | Low | Low | High |
| **Vendor Lock-in** | Low | Low | Low | High |
| **Scalability** | Good | Good | Excellent | Excellent |
| **Monitoring** | Basic | Basic | Basic | Advanced |
| **Complexity** | Low | Medium | Low | High |

---

## Recommendation

### For ProfitForge.ai Current State:

**Migrate to Option B (Functional Composition)** for these reasons:

1. ✅ **Best cold start performance** — Critical for serverless
2. ✅ **Smallest bundle size** — No framework dependencies
3. ✅ **Easy testing** — Pure functions are trivial to test
4. ✅ **Modern patterns** — Aligns with serverless best practices
5. ✅ **Low risk migration** — Can do incrementally, one service at a time
6. ✅ **Team familiarity** — JavaScript/TypeScript ecosystem standard

### Migration Path:

**Phase 1:** Create functional versions alongside OOP classes
- Keep existing classes working
- Create `services-v2/` folder with functional implementations
- Migrate one handler at a time

**Phase 2:** Update tests to use functional services
- Tests become simpler and faster
- Validate functional versions match OOP behavior

**Phase 3:** Remove OOP classes
- Delete old service classes
- Remove singleton factory functions
- Clean up unused code

**Phase 4:** Optimize
- Add function-level caching if needed
- Measure performance improvements
- Document new patterns

---

## Future Considerations

**When to consider Option A (DI Container):**
- Codebase grows to >20 services
- Need advanced DI features (decorators, interceptors)
- Team has Spring/Angular/.NET background

**When to consider Option C (Durable Functions):**
- Adding complex multi-step workflows
- Need human approval steps
- Long-running operations (>30 seconds)
- Require execution history and monitoring

---

## References

- [Azure Functions Performance Best Practices](https://docs.microsoft.com/azure/azure-functions/functions-best-practices)
- [Functional Programming in TypeScript](https://github.com/gcanti/fp-ts)
- [InversifyJS Documentation](https://inversify.io/)
- [Azure Durable Functions Patterns](https://docs.microsoft.com/azure/azure-functions/durable/durable-functions-overview)
- [Clean Architecture by Robert C. Martin](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
