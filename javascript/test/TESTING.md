# Testing Guide - Mini POC

Complete testing setup for Upload → OCR → Database pipeline.

## Test Structure

```
test/
├── setup.ts                      # Global test configuration
├── mocks/
│   └── azureMocks.ts            # Mock factories for Azure SDK
├── unit/
│   ├── api.test.ts              # Upload handler unit tests
│   └── documentProcessor.test.ts # Document processor unit tests
└── e2e/
    └── upload-process.e2e.test.ts # End-to-end integration tests
```

## Running Tests

### Install Dependencies

```bash
cd /home/eitanick/code/profitforge.ai/javascript
npm install
```

### Run All Tests

```bash
npm test
```

### Run Only Unit Tests (Fast, Mocked)

```bash
npm run test:unit
```

### Run Only E2E Tests (Slow, Real Azure)

```bash
npm run test:e2e
```

### Watch Mode (Auto-rerun on changes)

```bash
npm run test:watch
```

### Coverage Report

```bash
npm run test:coverage
```

## Test Types

### Unit Tests (Mocked)

**Purpose:** Fast, isolated testing of individual functions  
**Dependencies:** All Azure services mocked  
**Duration:** < 1 second per test

**What's Tested:**

- Upload handler logic
- File validation (type, size, required fields)
- Database insertion logic
- Error handling paths
- Document processor OCR extraction
- OpenAI mapping logic
- Path parsing and normalization

**How to Add New Unit Tests:**

1. Create test file in `test/unit/`
2. Import mocks from `test/mocks/azureMocks.ts`
3. Use `vi.mock()` to replace Azure SDK modules
4. Write test cases with `describe()` and `it()`

### E2E Tests (Real Azure)

**Purpose:** Validate entire pipeline with real services  
**Dependencies:** Requires running Azure Functions + real Azure resources  
**Duration:** 30-60 seconds per test

**Prerequisites:**

1. Start Azure Functions locally: `npm start`
2. Valid connection strings in `local.settings.json`
3. Document Intelligence API key configured
4. OpenAI API key configured

**What's Tested:**

- Real file upload to Azure Blob Storage
- Actual OCR processing with Document Intelligence
- Real OpenAI GPT-4o product mapping
- Database records created and updated
- Complete end-to-end timing

**How to Run E2E Tests:**

```bash
# Terminal 1: Start functions
cd javascript && npm start

# Terminal 2: Run E2E tests
npm run test:e2e
```

## Test Coverage Goals

- **Unit Tests:** > 80% code coverage
- **E2E Tests:** Cover all happy paths + critical error scenarios
- **Integration:** Both upload and processor functions tested together

## Mock Data

### Azure Blob Storage Mock

Simulates:

- Container client creation
- Blob upload operations
- Success/failure scenarios

### SQL Connection Mock

Simulates:

- Connection pool creation
- Query execution
- Transaction handling
- Error conditions

### Document Intelligence Mock

Returns:

- Sample OCR text
- Extracted tables with cells
- Page counts
- Confidence scores

### OpenAI Mock

Returns:

- Structured product JSON
- Token usage statistics
- Confidence scores per field

## Debugging Tests

### View Test Output

```bash
npm test -- --reporter=verbose
```

### Run Single Test File

```bash
npm test test/unit/api.test.ts
```

### Run Single Test Case

```bash
npm test -- -t "should successfully upload a PDF file"
```

### Debug with VSCode

Add to `.vscode/launch.json`:

```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Vitest Tests",
  "runtimeExecutable": "npm",
  "runtimeArgs": ["run", "test"],
  "console": "integratedTerminal"
}
```

## Common Issues

### "Cannot find module" errors

```bash
# Make sure all dependencies are installed
npm install
```

### E2E tests timing out

```bash
# Increase timeout in test file or check if functions are running
# Functions must be started with: npm start
```

### Mock not working

```bash
# Clear module cache and re-import
# Add vi.clearAllMocks() to beforeEach()
```

### Database connection errors in E2E

```bash
# Verify connection string in local.settings.json
# Check SQL server firewall allows your IP
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: "20"
      - run: npm install
      - run: npm run test:unit
      - run: npm run test:coverage
```

## Next Steps

1. **Add More Test Cases:**

   - Large file uploads (> 10MB)
   - Malformed PDFs
   - Scanned images with low quality
   - Multi-page documents

2. **Performance Testing:**

   - Load test with 100+ concurrent uploads
   - Measure OCR processing time
   - Token usage optimization

3. **Golden Dataset Tests:**
   - Create validated test documents
   - Compare OCR accuracy against ground truth
   - Track accuracy over time

## Questions?

See the main README or run:

```bash
npm test -- --help
```
