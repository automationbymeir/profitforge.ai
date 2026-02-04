# Service Architecture: Orchestration and Layering

**Date:** February 4, 2026  
**Topic:** Service-to-service communication patterns and architectural layering

## Core Question

Should a service orchestrate logic (calling other services), or should functions handle orchestration? When is service-to-service communication appropriate?

## Key Principles

### 1. Service Types and Hierarchy

Services are not all equal—they exist in different categories:

**Domain Services** (e.g., DocumentService, VendorService, OrderService)
- Encapsulate business logic and domain rules
- Represent core business concepts
- Own domain entities and aggregates

**Infrastructure Services** (e.g., StorageService, EmailService, LoggingService)
- Provide technical capabilities
- Not domain-specific
- Reusable across different domains

**Application Services** (optional orchestration layer)
- Coordinate complex workflows across multiple domain services
- Handle transaction boundaries
- Orchestrate use cases that span domains

### 2. Valid Communication Patterns

```
API Layer (Functions/Controllers)
    ↓ calls
Application Services (optional)
    ↓ calls
Domain Services
    ↓ calls
Infrastructure Services
    ↓ calls
Data Layer (Repositories/External APIs)
```

**Rules:**
- ✅ Each layer can call the layer directly below
- ✅ Domain services can call infrastructure services (they're utilities, not peers)
- ✅ Domain services can call repositories (data layer)
- ❌ Peer domain services should not directly call each other
- ✅ Peer services can communicate via events/messages/queues
- ❌ Lower layers should never call higher layers (prevents circular dependencies)

### 3. The Function's Role

Functions should be **thin HTTP adapters**, not orchestrators:

```typescript
// ✅ Good - Function as thin HTTP adapter
async function uploadHandlerCore(req, context) {
  // 1. Extract HTTP-specific concerns
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim();
  const formData = await req.formData();
  
  // 2. Validate HTTP-level concerns (format, not business rules)
  if (!file || !vendorName) {
    return errorResponse('Missing required fields', 400);
  }

  // 3. Delegate to service (business logic)
  const result = await documentService.upload(file, vendorName, clientIp);

  // 4. Transform domain result to HTTP response
  return successResponse({ message: 'Success', ...result }, 201);
}
```

**Function responsibilities:**
- Parse HTTP request (headers, params, body)
- Extract protocol-specific data
- Validate request format (not business rules)
- Call appropriate service
- Transform domain response to HTTP response
- Map domain errors to HTTP status codes
- Apply middleware (CORS, auth, rate limiting)

**Functions should NOT:**
- Contain business logic
- Orchestrate multiple domain services
- Directly access repositories or databases
- Handle domain validation rules

## When Service-to-Service Communication Is Appropriate

### ✅ Correct: Domain Service → Infrastructure Service

```typescript
class DocumentService {
  async upload(file, vendorName) {
    // Validate business rules (domain logic)
    if (!this.validateVendorName(vendorName)) {
      throw new Error('Invalid vendor');
    }

    // Call infrastructure service (utility)
    await this.storageService.uploadBlob(container, path, buffer);
    
    // Call data layer
    await this.documentRepo.create({...});
  }
}
```

**Why this is correct:**
- StorageService is an infrastructure/utility service, not a domain peer
- No tight coupling between business domains
- Clear separation of concerns
- Easy to test (mock infrastructure)

### ❌ Problematic: Peer Domain Service → Domain Service

```typescript
// ❌ Bad - Direct coupling between peer domain services
class OrderService {
  async createOrder(items) {
    // Direct call to peer domain service
    const available = await inventoryService.checkStock(items);
    if (!available) throw new Error('Out of stock');
    
    await inventoryService.reserveStock(items);
    return await this.orderRepo.create(...);
  }
}
```

**Problems:**
- Tight coupling between domain services
- Hard to test (must mock peer service)
- Changes in InventoryService affect OrderService
- Circular dependency risk
- Unclear transaction boundaries
- Difficult to maintain as system grows

### ✅ Better: Application Service Orchestrator

```typescript
// ✅ Option 1: Application Service orchestrates peer domains
class OrderApplicationService {
  constructor(
    private orderService: OrderService,
    private inventoryService: InventoryService
  ) {}

  async createOrder(items) {
    // Orchestrate cross-domain workflow
    const available = await this.inventoryService.checkStock(items);
    if (!available) throw new Error('Out of stock');
    
    await this.inventoryService.reserveStock(items);
    return await this.orderService.create(items);
  }
}
```

**Benefits:**
- Domain services remain decoupled
- Clear orchestration point
- Transaction boundaries explicit
- Easy to test each service in isolation

### ✅ Better: Event-Driven Communication

```typescript
// ✅ Option 2: Event-driven (asynchronous)
class OrderService {
  async createOrder(items) {
    const order = await this.orderRepo.create(...);
    
    // Publish event instead of direct call
    await this.eventBus.publish('OrderCreated', { 
      orderId: order.id, 
      items 
    });
    
    return order;
  }
}

// Separate handler (different bounded context)
class InventoryEventHandler {
  async onOrderCreated(event) {
    await this.inventoryService.reserveStock(event.items);
  }
}
```

**Benefits:**
- Complete decoupling of domain services
- Asynchronous processing
- Easy to add new consumers (extensibility)
- Natural fit for distributed systems
- Resilient to service failures
- Supports eventual consistency

## Practical Guidelines

### When to Use Each Pattern

**Domain → Infrastructure Service:**
- When you need technical capabilities (storage, email, logging)
- Infrastructure service is stateless or manages external resources
- No business logic in infrastructure service

**Application Service Orchestrator:**
- Synchronous workflows across multiple domains
- Need transactional consistency
- Clear bounded contexts that need coordination
- Complex use cases requiring multiple domain services

**Event-Driven Communication:**
- Asynchronous workflows acceptable
- Eventual consistency is acceptable
- Need loose coupling and extensibility
- Distributed systems or microservices
- Want to add new behaviors without modifying existing code

### Red Flags (When to Refactor)

🚩 **Domain service directly calling another domain service**
- Solution: Extract to Application Service or use events

🚩 **Functions containing business logic**
- Solution: Move logic to domain service

🚩 **Circular dependencies between services**
- Solution: Extract shared logic to new service or use events

🚩 **Service becomes a "god service" doing too much**
- Solution: Split into smaller, focused services

🚩 **Difficult to test due to complex mocking**
- Solution: Decouple using interfaces and dependency injection

## ProfitForge.ai Assessment

### Current Architecture (Correct)

✅ **Functions as thin HTTP adapters**
- Extract HTTP data
- Validate request format
- Delegate to services
- Transform responses

✅ **DocumentService orchestrates upload workflow**
- Validates business rules (vendor name format, file type, size limits)
- Calls StorageService (infrastructure) to upload blob
- Calls DocumentRepository (data layer) to persist record
- Manages usage tracking

✅ **Clear separation of infrastructure services**
- StorageService provides blob storage capabilities
- Not a domain peer—it's a utility
- Reusable across different domains

### Recommendations

For current codebase size, the architecture is sound. As you scale:

1. **Continue current pattern** for domain → infrastructure communication
2. **If peer services need coordination**, consider:
   - Application Service layer (synchronous)
   - Event/queue-based patterns (asynchronous)
3. **Maintain thin functions** as HTTP adapters only
4. **Keep business logic in domain services**

## References

- Martin Fowler: Service Layer Pattern
- Domain-Driven Design (Eric Evans)
- Clean Architecture (Robert C. Martin)
- Ports and Adapters (Hexagonal Architecture)
- Event-Driven Architecture patterns
