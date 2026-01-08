# Azure AI Foundry Document Intelligence - Developer Access Package
**Environment**: Development  
**Last Updated**: December 31, 2025

## Quick Start

You've been granted access to deploy document intelligence processing services with **Azure AI Foundry** multi-model capabilities. This package contains everything needed to get started.

## Your Access Scope

✅ **You CAN**:
- Deploy containerized services (Azure Container Apps, Functions) to dedicated resource group
- Access Azure AI Foundry Hub and Project for model deployments
- Deploy multiple AI models (GPT-4o, Llama, Mistral, etc.) for A/B testing
- Read/write to dedicated `vvocr` schema in Azure SQL
- Access Azure Document Intelligence API
- Read/write documents to designated blob storage containers

❌ **You CANNOT**:
- Access customer data factories or pipelines
- Modify core infrastructure outside your resource group
- Access customer schemas (`pfdata`, `vvdata`, `config`)
- Exceed budget limits ($500/month)

## Credentials

Credentials are stored in: `vvocr-3P-Meir-credentials-dev.env`

**Security**: This file contains sensitive secrets. Never commit to source control.

### Authentication
```bash
# Load environment variables
source vvocr-3P-Meir-credentials-dev.env

# Authenticate with Azure
az login --service-principal \
  -u "$AZURE_CLIENT_ID" \
  -p "$AZURE_CLIENT_SECRET" \
  --tenant "$AZURE_TENANT_ID"

# Verify access (should see only your resource group)
az group show --name "$AZURE_RESOURCE_GROUP"
```

## Architecture

### Azure AI Foundry Multi-Model Pipeline (Recommended)

```
PDF Upload → Azure Document Intelligence → Extract Text/Structure
                                              ↓
                          Azure AI Foundry (Your Choice):
                          • GPT-4o (multimodal, high accuracy)
                          • GPT-3.5-Turbo (cost-effective)
                          • Llama 3.1 (open source, large context)
                          • Mistral Large (European alternative)
                                              ↓
                            Structured JSON Output → Azure SQL (vvocr schema)
```

### Why Azure AI Foundry?
- **Multi-Model Access**: Test GPT-4o, Llama, Mistral side-by-side
- **No TPM Quotas**: Pay-per-use models scale with demand
- **Built-in Evaluation**: Compare accuracy, cost, latency metrics
- **Model Switching**: Change models without code changes

## Azure Resources

### Azure AI Foundry
- **Hub Name**: `dragonfruit-dev-3P-Meir-aihub`
- **Project Name**: `dragonfruit-dev-3P-Meir-project`
- **Portal**: https://ai.azure.com (select your project)
- **Discovery Endpoint**: From `AI_PROJECT_ENDPOINT` env var
- **Model Catalog**: Deploy GPT-4o, Llama 3.1, Mistral, Cohere models
- **Pricing**: Varies by model ($0.15-$10/1M tokens)

**Deploying Models**:
1. Visit https://ai.azure.com
2. Select project: `dragonfruit-dev-3P-Meir-project`
3. Navigate to "Model catalog"
4. Deploy models (e.g., "gpt-4o", "llama-3-1-405b-instruct")
5. Use deployment endpoint in your code

### Document Intelligence
- **Endpoint**: From `DOCUMENT_INTELLIGENCE_ENDPOINT` env var
- **API Key**: From `DOCUMENT_INTELLIGENCE_KEY` env var
- **Pricing**: ~$1.50 per 1,000 pages
- **API Docs**: https://learn.microsoft.com/azure/ai-services/document-intelligence/

### Azure SQL Database
- **Connection String**: From `SQL_CONNECTION_STRING` env var
- **Server**: df-dev-pfsql.database.windows.net
- **Database**: df-dev-main
- **Authentication**: Azure AD Service Principal (automatic via connection string)

**Your Schema Access**:
- `vvocr.*` - **Full read/write access** (SELECT, INSERT, UPDATE, DELETE)
- `pfdata.*`, `vvdata.*`, `config.*` - **NO ACCESS** (explicitly denied for security)

**Available Tables** (7 tables in vvocr schema):
- `vvocr.document_processing_results` - Main processing results
- `vvocr.execution_log` - Batch execution tracking
- `vvocr.manual_review_queue` - Documents needing human review
- `vvocr.cost_tracking` - Cost monitoring per document
- `vvocr.vw_processing_summary` - Aggregated metrics (view)
- `vvocr.vw_daily_costs` - Daily cost trends (view)
- `vvocr.vw_review_queue_summary` - Review queue stats (view)

### Azure Storage
- **Account**: From `STORAGE_ACCOUNT_NAME` env var
- **Container**: `df-documents` (your staging area)
- **Access**: Blob Data Reader (read-only)

## Database Schema

### Quick Start: Connect to Database

**Step 1: Verify Connection String**
```bash
# Load credentials
source vvocr-3P-Meir-credentials-dev.env

# Verify SQL_CONNECTION_STRING is set
echo $SQL_CONNECTION_STRING | head -c 50
# Should show: Driver={ODBC Driver 18 for SQL Server};Server=...
```

**Step 2: Test Connection (Python)**
```python
import os
import pyodbc

# This connection string includes service principal auth
conn = pyodbc.connect(os.getenv("SQL_CONNECTION_STRING"))
cursor = conn.cursor()

# Verify you're connected
cursor.execute("SELECT USER_NAME() AS current_user")
print(cursor.fetchone()[0])  # Should print: sp-dragonfruit-3P-Meir-dev

# List your accessible tables
cursor.execute("""
    SELECT TABLE_NAME 
    FROM INFORMATION_SCHEMA.TABLES 
    WHERE TABLE_SCHEMA = 'vvocr'
    ORDER BY TABLE_NAME
""")
for row in cursor.fetchall():
    print(f"  - vvocr.{row[0]}")

conn.close()
```

**Expected Output**:
```
sp-dragonfruit-3P-Meir-dev
  - vvocr.cost_tracking
  - vvocr.document_processing_results
  - vvocr.execution_log
  - vvocr.manual_review_queue
  - vvocr.vw_daily_costs
  - vvocr.vw_processing_summary
  - vvocr.vw_review_queue_summary
```

**Step 3: Verify Security Isolation**
```python
# This should FAIL (access denied to customer data)
try:
    cursor.execute("SELECT COUNT(*) FROM pfdata.item")
    print("ERROR: Should not have access!")
except pyodbc.Error as e:
    print("✓ Correctly denied access to pfdata schema")
```

### Connecting to the Database

**From Python (Recommended)**:
```python
import os
import pyodbc

# Connection string is pre-configured with service principal auth
conn_str = os.getenv("SQL_CONNECTION_STRING")
conn = pyodbc.connect(conn_str)
cursor = conn.cursor()

# Test connection
cursor.execute("SELECT SYSTEM_USER, USER_NAME()")
row = cursor.fetchone()
print(f"Connected as: {row[1]}")  # Should show: sp-dragonfruit-3P-Meir-dev

# Query your data
cursor.execute("SELECT COUNT(*) FROM vvocr.document_processing_results")
count = cursor.fetchone()[0]
print(f"Documents processed: {count}")
```

**Connection String Format**:
The `SQL_CONNECTION_STRING` environment variable contains:
```
Driver={ODBC Driver 18 for SQL Server};
Server=df-dev-pfsql.database.windows.net;
Database=df-dev-main;
Authentication=ActiveDirectoryServicePrincipal;
UID={client_id};
PWD={client_secret};
Encrypt=yes;
TrustServerCertificate=no;
```

**From Container Apps** (using managed environment variables):
```yaml
# In your Container App configuration
env:
  - name: SQL_CONNECTION_STRING
    secretRef: sql-connection-string
```

### vvocr.document_processing_results
Primary table for storing processing results:

```sql
-- Example query
SELECT TOP 10 
    document_name,
    processing_status,
    doc_intel_confidence_score,
    openai_confidence_score,
    processing_duration_ms,
    created_at
FROM vvocr.document_processing_results
ORDER BY created_at DESC;
```

**Key Columns**:
- `doc_intel_extracted_text` - Raw OCR output
- `doc_intel_structured_data` - JSON from Document Intelligence
- `openai_analysis` - JSON from GPT-4o/other models
- `processing_status` - pending, processing, completed, failed

### vvocr.execution_log
Track batch processing runs:

```sql
-- Monitor batch execution
SELECT 
    execution_run_id,
    documents_processed,
    documents_succeeded,
    documents_failed,
    total_tokens_used,
    total_cost_usd,
    execution_duration_ms
FROM vvocr.execution_log
WHERE execution_start > DATEADD(day, -7, GETUTCDATE())
ORDER BY execution_start DESC;
```

### vvocr.manual_review_queue
Documents requiring manual review:

```sql
-- Get low-confidence documents
SELECT 
    v.validation_id,
    r.document_name,
    r.doc_intel_confidence_score,
    r.openai_confidence_score,
    v.low_confidence_reason
FROM vvocr.manual_review_queue v
JOIN vvocr.document_processing_results r ON v.result_id = r.result_id
WHERE v.validation_status = 'pending'
ORDER BY v.queued_at;
```

### vvocr.cost_tracking
Monitor per-document costs:

```sql
-- Daily cost summary
SELECT 
    CAST(processing_date AS DATE) AS date,
    COUNT(*) AS documents,
    SUM(doc_intel_cost_usd) AS doc_intel_cost,
    SUM(openai_cost_usd) AS openai_cost,
    SUM(total_cost_usd) AS total_cost
FROM vvocr.cost_tracking
WHERE processing_date >= DATEADD(day, -30, GETUTCDATE())
GROUP BY CAST(processing_date AS DATE)
ORDER BY date DESC;
```

## Sample Code

### Python Example - Full Processing Pipeline

```python
import os
import pyodbc
from azure.ai.formrecognizer import DocumentAnalysisClient
from azure.core.credentials import AzureKeyCredential
from openai import AzureOpenAI
import json
from datetime import datetime

# Initialize clients
doc_client = DocumentAnalysisClient(
    endpoint=os.getenv("DOCUMENT_INTELLIGENCE_ENDPOINT"),
    credential=AzureKeyCredential(os.getenv("DOCUMENT_INTELLIGENCE_KEY"))
)

openai_client = AzureOpenAI(
    azure_endpoint=os.getenv("OPENAI_ENDPOINT"),
    api_key=os.getenv("OPENAI_KEY"),
    api_version=os.getenv("OPENAI_API_VERSION")
)

# Database connection
db_conn = pyodbc.connect(os.getenv("SQL_CONNECTION_STRING"))

def process_document(pdf_path, document_name):
    """
    Complete document processing pipeline:
    1. Extract text with Document Intelligence
    2. Analyze with OpenAI
    3. Store results in vvocr schema
    """
    cursor = db_conn.cursor()
    start_time = datetime.utcnow()
    
    try:
        # Stage 1: Document Intelligence extraction
        print(f"Processing: {document_name}")
        with open(pdf_path, "rb") as f:
            poller = doc_client.begin_analyze_document("prebuilt-layout", f)
        doc_result = poller.result()
        
        extracted_text = doc_result.content
        doc_confidence = sum(p.confidence for p in doc_result.pages) / len(doc_result.pages)
        
        print(f"  Document Intelligence confidence: {doc_confidence:.2%}")
        
        # Stage 2: OpenAI analysis
        response = openai_client.chat.completions.create(
            model=os.getenv("OPENAI_DEPLOYMENT_NAME"),
            messages=[
                {
                    "role": "system",
                    "content": "Extract structured vendor catalog data as JSON. Required fields: vendor_name, vendor_sku, product_name, unit_price, category."
                },
                {
                    "role": "user",
                    "content": f"Extract product data from:\n\n{extracted_text}"
                }
            ],
            response_format={"type": "json_object"},
            max_tokens=1000,
            temperature=0.1
        )
        
        openai_result = json.loads(response.choices[0].message.content)
        tokens_used = response.usage.total_tokens
        
        # Calculate costs (example rates)
        doc_intel_cost = 0.0015  # $1.50 per 1000 pages
        openai_cost = (response.usage.prompt_tokens * 0.0000025) + \
                     (response.usage.completion_tokens * 0.00001)  # GPT-4o rates
        
        processing_time_ms = (datetime.utcnow() - start_time).total_seconds() * 1000
        
        # Stage 3: Store in database
        cursor.execute("""
            INSERT INTO vvocr.document_processing_results (
                document_name,
                doc_intel_extracted_text,
                doc_intel_structured_data,
                doc_intel_confidence_score,
                openai_analysis,
                openai_total_tokens,
                openai_confidence_score,
                processing_status,
                processing_duration_ms,
                created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, GETUTCDATE())
        """, (
            document_name,
            extracted_text,
            json.dumps(doc_result.to_dict()),
            doc_confidence,
            json.dumps(openai_result),
            tokens_used,
            0.95,  # Calculate based on validation logic
            'completed',
            processing_time_ms
        ))
        
        result_id = cursor.execute("SELECT @@IDENTITY").fetchone()[0]
        
        # Track costs
        cursor.execute("""
            INSERT INTO vvocr.cost_tracking (
                result_id,
                doc_intel_cost_usd,
                openai_cost_usd,
                total_cost_usd,
                processing_date
            ) VALUES (?, ?, ?, ?, GETUTCDATE())
        """, (result_id, doc_intel_cost, openai_cost, doc_intel_cost + openai_cost))
        
        db_conn.commit()
        
        print(f"  ✓ Completed in {processing_time_ms:.0f}ms | Tokens: {tokens_used} | Cost: ${openai_cost:.4f}")
        return {
            "result_id": result_id,
            "status": "success",
            "confidence": doc_confidence
        }
        
    except Exception as e:
        # Log error to database
        cursor.execute("""
            INSERT INTO vvocr.document_processing_results (
                document_name,
                processing_status,
                error_message,
                created_at
            ) VALUES (?, ?, ?, GETUTCDATE())
        """, (document_name, 'failed', str(e)))
        db_conn.commit()
        
        print(f"  ✗ Error: {e}")
        return {"status": "failed", "error": str(e)}

# Usage
result = process_document("vendor-catalog.pdf", "ACE_2025_Catalog_Page_1.pdf")
print(json.dumps(result, indent=2))
```

### Azure Container App Deployment

```bash
# Build Docker image
docker build -t docintel-processor:latest .

# Push to Azure Container Registry (or GitHub Container Registry)
docker tag docintel-processor:latest ghcr.io/yourorg/docintel-processor:latest
docker push ghcr.io/yourorg/docintel-processor:latest

# Deploy to Azure Container Apps
az containerapp create \
  --name docintel-processor \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --image ghcr.io/yourorg/docintel-processor:latest \
  --environment docintel-env \
  --cpu 1.0 --memory 2Gi \
  --min-replicas 0 --max-replicas 5 \
  --secrets \
    doc-intel-key="$DOCUMENT_INTELLIGENCE_KEY" \
    openai-key="$OPENAI_KEY" \
    sql-connection="$SQL_CONNECTION_STRING" \
  --env-vars \
    DOCUMENT_INTELLIGENCE_ENDPOINT="$DOCUMENT_INTELLIGENCE_ENDPOINT" \
    OPENAI_ENDPOINT="$OPENAI_ENDPOINT" \
    OPENAI_DEPLOYMENT_NAME="$OPENAI_DEPLOYMENT_NAME"
```

## Cost Monitoring

### Budget Limits
- **Total Monthly**: $500
- **Alert Threshold**: 80% ($400)
- **OpenAI TPM Quota**: 10,000 tokens/minute

### Estimate Your Costs

```python
# Document Intelligence: $1.50 per 1,000 pages
pages = 100000
doc_intel_cost = (pages / 1000) * 1.50  # $150

# GPT-4o: $2.50 per 1M input tokens, $10 per 1M output tokens
documents = 100000
tokens_per_doc = 500  # OCR text + prompt
output_tokens_per_doc = 200  # JSON response

input_cost = (documents * tokens_per_doc / 1_000_000) * 2.50  # $125
output_cost = (documents * output_tokens_per_doc / 1_000_000) * 10.00  # $200

total_cost = doc_intel_cost + input_cost + output_cost  # $475
print(f"Estimated cost for {documents:,} documents: ${total_cost:.2f}")
```

### Monitor Real-Time Costs

```bash
# Check current spend
az consumption usage list \
  --start-date $(date -u -d '1 month ago' +%Y-%m-%d) \
  --end-date $(date -u +%Y-%m-%d) \
  --query "[?resourceGroup=='$AZURE_RESOURCE_GROUP'].{Cost:pretaxCost,Service:meterCategory}" \
  --output table

# Track OpenAI token usage
# Query database: SELECT SUM(openai_total_tokens) FROM docintel.document_processing_results;
```

## Support & Troubleshooting

### Common Issues

**Rate Limiting (429 errors)**:
- GPT-4o quota: 10,000 TPM
- Solution: Implement retry logic with exponential backoff
- Alternative: Batch documents and process asynchronously

**Low Confidence Scores**:
- Document Intelligence < 0.7: Likely noisy scan
- Solution: Use GPT-4o vision to validate/correct
- Queue for manual review if both scores < 0.7

**High Costs**:
- Monitor token usage per document
- Consider GPT-4o-mini for simpler documents
- Use Document Intelligence-only for standard layouts

### Access Issues

```bash
# Test service principal authentication
az login --service-principal \
  -u "$AZURE_CLIENT_ID" \
  -p "$AZURE_CLIENT_SECRET" \
  --tenant "$AZURE_TENANT_ID"

# Verify resource group access
az group show --name "$AZURE_RESOURCE_GROUP"

# Test SQL connection
sqlcmd -S df-dev-pfsql.database.windows.net -d df-dev-main \
  -U "$AZURE_CLIENT_ID" -P "$AZURE_CLIENT_SECRET" -G \
  -Q "SELECT COUNT(*) AS TotalDocuments FROM vvocr.document_processing_results"

# Test Document Intelligence
curl -X POST "$DOCUMENT_INTELLIGENCE_ENDPOINT/formrecognizer/documentModels/prebuilt-layout:analyze?api-version=2024-02-29-preview" \
  -H "Ocp-Apim-Subscription-Key: $DOCUMENT_INTELLIGENCE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"urlSource":"https://example.com/sample.pdf"}'
```

### Contact

For infrastructure issues or access problems, contact the Dragonfruit platform team.

## Security Reminders

- ✅ Store credentials in environment variables, never in code
- ✅ Use Key Vault references in production containers
- ✅ Rotate client secret every 90 days (automatic via Key Vault)
- ✅ Monitor activity logs for suspicious access
- ❌ Never commit credentials to source control
- ❌ Don't share credentials via email/Slack (use secure channels)

## Next Steps

1. **Authenticate**: Run `az login --service-principal` with provided credentials
2. **Test Access**: Query database, test Document Intelligence and OpenAI APIs
3. **Deploy POC**: Build containerized service and deploy to resource group
4. **Validate**: Process sample documents, measure accuracy and costs
5. **Review**: Share results with platform team for production approval

---

**Questions?** Refer to Azure documentation or contact the platform team for infrastructure support.
