# Testing Tools

Quick reference for testing and monitoring your Azure Functions locally.

## 📁 Files in this folder

- `test-invoice.txt` - Sample invoice for testing uploads
- `test-upload.sh` - Upload files to the function
- `monitor.sh` - Live monitoring of blobs and database
- `cleanup.sh` - Clean up test data
- `query.js` - Quick database queries
- `test-client.html` - Web-based upload client

## 🚀 Quick Start

### 1. Start Functions

```bash
cd /home/eitanick/code/profitforge.ai/code
npm start
```

### 2. Monitor in Real-Time

```bash
cd test/tools
./monitor.sh
```

Refreshes every 3 seconds. Press `Ctrl+C` to stop.

### 3. Upload Test Files

```bash
# Go back to test folder
cd ..

# Upload default test-invoice.txt from tools folder
./test-upload.sh tools/test-invoice.txt vendor-acme

# Upload PDF from docs folder
./test-upload.sh docs/sample.pdf vendor-xyz
```

### 4. Query Database

```bash
# Show recent uploads
node query.js

# Custom query
node query.js "SELECT COUNT(*) as total FROM vvocr.document_processing_results"

# Show processing statistics
node query.js "SELECT processing_status, COUNT(*) as count FROM vvocr.document_processing_results GROUP BY processing_status"
```

### 5. Cleanup Test Data

```bash
# Interactive menu
./cleanup.sh

# Delete everything
./cleanup.sh all

# Delete blobs only
./cleanup.sh blobs

# Delete database records only
./cleanup.sh db

# Delete specific vendor's files
./cleanup.sh pattern 'test-vendor-123/*'
```

## 🔍 Monitoring Tools Recommendations

### For Database:

1. **Azure Data Studio** (Recommended) - Free, cross-platform

   ```bash
   # Download from: https://aka.ms/azuredatastudio
   # Or install via snap on Linux:
   sudo snap install azuredatastudio
   ```

2. **VS Code Extension: "SQL Server (mssql)"**
   - Install from VS Code marketplace
   - Connect to: `dev-eitan-vvocr-sql0d3c18e3.database.windows.net`

3. **Our monitoring script** - Simple, terminal-based
   ```bash
   ./monitor.sh
   ```

### For Blob Storage:

1. **Azure Storage Explorer** - Free GUI tool
   - Download: https://azure.microsoft.com/features/storage-explorer/

2. **VS Code Extension: "Azure Storage"**
   - Browse containers directly in VS Code

3. **Azure CLI with watch**
   ```bash
   watch -n 3 'az storage blob list --connection-string "$STORAGE_CONNECTION_STRING" --container-name uploads --output table'
   ```

## 📊 Useful Queries

### Count uploads by vendor

```bash
node query.js "SELECT LEFT(document_path, CHARINDEX('/', document_path) - 1) as vendor, COUNT(*) as count FROM vvocr.document_processing_results GROUP BY LEFT(document_path, CHARINDEX('/', document_path) - 1)"
```

### Show failed uploads

```bash
node query.js "SELECT document_name, error_message, uploaded_at FROM vvocr.document_processing_results WHERE processing_status = 'failed'"
```

### Total cost by day

```bash
node query.js "SELECT CAST(uploaded_at AS DATE) as date, SUM(total_cost_usd) as total_cost FROM vvocr.document_processing_results GROUP BY CAST(uploaded_at AS DATE)"
```

## 🎯 Tips

- **Keep monitor.sh running** in a separate terminal while testing
- **Use test-client.html** to test uploads from a browser (open in browser after starting functions)
- **Clean up regularly** to avoid confusion with old test data
- Set `STORAGE_CONNECTION_STRING` environment variable to avoid connection string lookup in scripts

## 🔧 Troubleshooting

### "Could not fetch database data"

- Check if SQL server firewall allows your IP
- Verify credentials in local.settings.json

### "Could not fetch blob storage data"

- Check STORAGE_CONNECTION_STRING in local.settings.json
- Make sure Azure CLI is logged in: `az login`

### Monitor script not updating

- Press `Ctrl+C` and restart it
- Check if Node.js mssql package is installed: `cd ../.. && npm install`

---

## 🧪 OCR & AI Service Testing (Isolated Mode)

Test OCR and AI services independently with real PDF files for rapid iteration and debugging.

### Test OCR Service

Process a PDF through Document Intelligence and save OCR results:

```bash
npx tsx test/tools/test-ocr-service.ts path/to/catalog.pdf
```

**Output:**

- Saves to: `test/outputs/ocr-azure-doc-intelligence-<filename>.json`
- Shows page count, table count, cell distribution
- Estimated cost per document

**Use Case:** Understand OCR structure variations across PDF formats, identify extraction issues before AI processing.

### Test AI Service

Process saved OCR data through AI normalization:

```bash
npx tsx test/tools/test-ai-service.ts test/outputs/ocr-azure-doc-intelligence-sample.json
```

**Output:**

- Shows table merge statistics (e.g., 29 raw tables → 8 logical tables)
- Per-table and aggregated results
- Quality metrics (completeness: 77%, confidence: 1.6%)
- Saves to: `test/outputs/ai-mapping-result-<filename>.json`
- Detailed analysis: `test/outputs/ai-mapping-analysis-<filename>.json`

**Use Case:** Iterate on prompts, validate table merging, analyze extraction quality without deploying.

### Test with Custom Prompts

Experiment with custom prompt strategies:

```bash
# Create prompt with {{TABLE_DATA}} placeholder
echo 'Extract all products from this catalog table: {{TABLE_DATA}}' > my-prompt.txt

# Test it
npx tsx test/tools/test-ai-service.ts test/outputs/ocr-azure-doc-intelligence-sample.json my-prompt.txt
```

### Typical Workflow

```bash
# 1. OCR a new vendor catalog
npx tsx test/tools/test-ocr-service.ts vendor-new-format.pdf

# 2. Check OCR quality
cat test/outputs/ocr-azure-doc-intelligence-vendor-new-format.json | jq '.ocrResponse.tables | length'

# 3. Test AI extraction
npx tsx test/tools/test-ai-service.ts test/outputs/ocr-azure-doc-intelligence-vendor-new-format.json

# 4. Review quality metrics
cat test/outputs/ai-mapping-analysis-vendor-new-format.json | jq '.qualityAnalysis'

# 5. If quality is poor, try custom prompt
npx tsx test/tools/test-ai-service.ts test/outputs/ocr-azure-doc-intelligence-vendor-new-format.json prompts/improved.txt

# 6. Compare results
diff test/outputs/ai-mapping-result-vendor-new-format.json test/outputs/ai-mapping-result-vendor-new-format-custom.json
```

### Understanding Quality Metrics

**Completeness Score (0-100%)**

- Measures: % of all possible fields that are populated
- Good: >85% | Acceptable: 60-85% | Poor: <60%

**Confidence Score (0-100%)**

- Measures: % of products with ALL fields populated
- Good: >80% | Acceptable: 40-80% | Poor: <40%

**Example Interpretation:**

```
Completeness: 77% | Confidence: 1.6%
→ Most products missing at least one field
→ Sparse but widespread data extraction
→ Need prompt tuning or better column mapping
```

### Debugging: OCR vs AI Issues

**Low quality extraction? Determine the root cause:**

**Step 1 - Check OCR structure:**

```bash
npx tsx test/tools/test-ocr-service.ts problem.pdf
cat test/outputs/ocr-azure-doc-intelligence-problem.json | jq '.ocrResponse.tables[0].cells[0:3]'
```

Questions:

- Are tables detected?
- Are cell contents accurate?
- Are column headers marked correctly?
- Are tables split across pages?

**Step 2 - Check AI extraction:**

```bash
npx tsx test/tools/test-ai-service.ts test/outputs/ocr-azure-doc-intelligence-problem.json
```

Questions:

- Are tables merged correctly?
- Are canonical headers identified?
- Is product extraction accurate?
- Are field population rates acceptable?

**Step 3 - Fix the issue:**

- If OCR is wrong → PDF preprocessing or manual correction
- If AI is wrong → Prompt engineering or model tuning

### Environment Variables

```bash
# For OCR testing
export DOCUMENT_INTELLIGENCE_ENDPOINT="https://your-resource.cognitiveservices.azure.com/"
export DOCUMENT_INTELLIGENCE_KEY="your-key"

# For AI testing
export AI_PROJECT_ENDPOINT="https://your-openai.openai.azure.com"
export AI_PROJECT_KEY="your-key"
export AI_MODEL="gpt-4o"  # optional
```

### Tips

- Save OCR results for different PDF formats to build a test suite
- Version your custom prompts to track improvements
- Use `jq` for quick JSON analysis
- Compare vendors side-by-side to identify format-specific issues
- Commit test outputs to track quality trends over time
