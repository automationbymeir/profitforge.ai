# Vendor Vault OCR POC - Implementation Summary

**Client:** ProfitForge  
**Project:** AI-Ready Retail Product Database  
**Developer:** Third-Party Contractor (Meir)  
**Timeline:** December 20, 2025 - January 24, 2026 (5 weeks)  
**Budget:** $7,500  
**Status:** ✅ Infrastructure Deployed, Development In Progress  
**Last Updated:** January 15, 2026

---

## Executive Summary

The Vendor Vault OCR (vvocr) system is an AI-powered document processing pipeline designed to automate the extraction, standardization, and transformation of vendor product data from PDFs, spreadsheets, and catalogs. The system uses Azure AI services to process documents with high accuracy while maintaining human oversight through a staged approval workflow.

### Key Value Propositions

✅ **AI-Powered Extraction**: Uses Azure Document Intelligence + LLMs (GPT-4o/Claude) for 85%+ accuracy  
✅ **Multi-Model Access**: Azure AI Foundry enables testing multiple AI models (GPT-4o, Llama, Mistral) side-by-side  
✅ **Production Quality**: Golden dataset testing framework with automated quality gates  
✅ **Learning System**: Remembers vendor formats for faster repeat processing  
✅ **Human-in-the-Loop**: Staged approval workflow ensures data quality before production import  
✅ **Cost Transparency**: Complete token usage tracking and budget projections  
✅ **Bronze-Layer Storage**: All raw and processed files retained permanently for audit trails

---

## 🚀 MINI POC: Simplified Proof of Concept (PRIORITY)

**Client Request:** "POC for the POC" - Minimal viable demonstration delivered ASAP

### Scope: Upload → OCR → Database Mapping

**Included (Core Flow Only):**

- ✅ Upload single PDF document to Blob Storage
- ✅ Azure Document Intelligence OCR extraction (text + tables)
- ✅ Store results in SQL database (`document_processing_results` table)
- ✅ Simple logging and error handling

**Excluded (Deferred to Full POC):**

- ❌ AI mapping with LLMs (GPT-4o/Llama) - use raw OCR output only
- ❌ Golden dataset testing framework
- ❌ Manual review workflow
- ❌ Vendor mapping memory
- ❌ Cost tracking and budget projections
- ❌ Web UI (use command-line upload script only)

### Timeline: 2-3 Days Max

**Day 1:**

- Complete Document Intelligence integration
- Store OCR results in database
- Test with 3-5 sample documents

**Day 2:**

- Error handling and retry logic
- End-to-end testing
- Simple monitoring script

**Day 3:**

- Documentation and demo prep
- Client walkthrough

### Deliverables

1. **Working Azure Function**

   - Blob trigger activated on file upload
   - Processes PDF/image documents
   - Stores OCR text + tables in SQL database

2. **Test Script**

   - Command-line tool to upload test documents
   - Monitors processing status
   - Queries database for results

3. **Sample Data**

   - 5 processed vendor documents
   - Database records showing extracted text and confidence scores

4. **Demo**
   - Live walkthrough: upload → process → query results
   - <5 minutes from upload to database record

### Success Criteria (Minimal)

✅ **Functional:** Upload document, get OCR results in database within 30 seconds  
✅ **Accurate:** Extract text with >90% accuracy on printed PDFs  
✅ **Reliable:** Process 10 consecutive documents without crashes  
✅ **Visible:** Client can query database and see extracted data

### What This Proves

- ✅ Azure infrastructure is working (Functions, Document Intelligence, SQL)
- ✅ End-to-end pipeline is viable (upload → OCR → storage)
- ✅ Foundation is solid for adding AI mapping layer later
- ✅ Client can evaluate OCR quality before investing in full POC

---

## System Architecture (Full POC)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DOCUMENT PROCESSING PIPELINE                         │
└─────────────────────────────────────────────────────────────────────────────┘

   1. UPLOAD              2. OCR EXTRACTION           3. AI MAPPING
┌──────────────┐       ┌──────────────────┐      ┌─────────────────────┐
│ PDF/Excel/   │──────▶│ Azure Document   │─────▶│ Azure AI Foundry    │
│ CSV Upload   │       │ Intelligence     │      │                     │
│              │       │                  │      │ • GPT-4o            │
│ • Web UI     │       │ • OCR Text       │      │ • Llama 3.1         │
│ • Blob Store │       │ • Table Extract  │      │ • Mistral Large     │
│ • Drag/Drop  │       │ • Confidence     │      │                     │
└──────────────┘       └──────────────────┘      └─────────────────────┘
                                                            │
                                                            ▼
   4. VALIDATION          5. APPROVAL               6. PRODUCTION
┌──────────────┐       ┌──────────────────┐      ┌─────────────────────┐
│ Golden       │       │ Manual Review    │      │ SQL Database        │
│ Dataset Test │       │ Queue            │      │                     │
│              │       │                  │      │ • Standardized      │
│ • Accuracy   │       │ • View Results   │      │ • Validated         │
│ • Confidence │       │ • Flag Errors    │      │ • Ready for AI      │
│ • Model Drift│       │ • Approve/Reject │      │ • Import to ERP     │
└──────────────┘       └──────────────────┘      └─────────────────────┘
```

---

## Azure Infrastructure

### Deployed Resources (Client's Azure Subscription)

**Resource Group:** `dragonfruit-dev-3P-Meir-rg` (East US)

| Resource                  | Name                             | Purpose                               | Pricing             |
| ------------------------- | -------------------------------- | ------------------------------------- | ------------------- |
| **Azure AI Foundry Hub**  | dragonfruit-dev-3P-Meir-aihub    | Multi-model AI access (no TPM quotas) | Pay-per-use         |
| **Azure AI Project**      | dragonfruit-dev-3P-Meir-project  | Model deployments & evaluation tools  | Free (included)     |
| **Document Intelligence** | dragonfruit-dev-3P-Meir-docintel | OCR & table extraction                | ~$1.50/1k pages     |
| **SQL Database**          | dfdev-sql-main (vvocr schema)    | Structured data storage               | Basic tier (~$5/mo) |
| **Blob Storage**          | dragonfruitdevsa                 | Document uploads & archives           | ~$0.02/GB           |
| **Key Vault**             | dragonfruitdevkv                 | Secrets & API keys                    | ~$0.03/secret       |
| **Budget Alert**          | 3P-Meir-dev-budget               | Cost monitoring ($500/month)          | Free                |

### Service Principal (Developer Access)

- **App ID:** `9f48fda1-ebda-459e-a595-d05660e06152`
- **Permissions:**
  - ✅ Contributor on resource group
  - ✅ Azure AI Developer on AI Hub
  - ✅ Cognitive Services User on Document Intelligence
  - ✅ Key Vault Secrets User
  - ✅ Storage Blob Data Reader
  - ❌ **NO ACCESS** to customer data (`pfdata`, `vvdata`, `config` schemas)

---

## Database Schema

### vvocr Schema (Isolated POC Workspace)

**Tables:**

1. **`document_processing_results`**

   - Document metadata (name, path, size, type)
   - Processing status (pending → processing → completed/failed)
   - Document Intelligence results (extracted text, tables, confidence)
   - AI model outputs (GPT-4o/Llama analysis, confidence scores)
   - Token usage tracking (prompt/completion/total tokens)
   - Cost tracking (total_cost_usd)
   - Manual review flags and override data

2. **`execution_log`**

   - Function execution tracking
   - Performance metrics (duration, memory usage)
   - Error logging and retry tracking
   - Dependency tracking for debugging

3. **`manual_review_queue`**

   - Flagged documents requiring human review
   - Low confidence results (<80%)
   - Approval workflow status
   - Reviewer comments and corrections

4. **`cost_tracking`**

   - Daily/monthly cost aggregation
   - Token usage by model (GPT-4o vs Llama vs Mistral)
   - Budget projections and alerts
   - Vendor-level cost attribution

5. **`vendor_mappings`**
   - Learned field mappings per vendor
   - Confidence scores for reuse decisions
   - Mapping versioning (track improvements over time)

---

## Implementation Phases

### ✅ Phase 0: Foundation & Infrastructure (COMPLETE)

**Status:** Infrastructure deployed, database schema created, authentication working

**Deliverables:**

- Azure resources provisioned (AI Foundry, Document Intelligence, SQL, Storage)
- Service principal access granted with RBAC permissions
- Database schema created (`vvocr` with 5 tables)
- Local development environment configured (SST v3, Azure CLI, TypeScript)
- Azure Functions deployed and tested

**Testing:**

- ✅ Azure authentication working (service principal login)
- ✅ Storage account access (upload/download blobs)
- ✅ SQL connection (INSERT/SELECT operations)
- ✅ Azure Functions HTTP trigger working
- ✅ Document Intelligence API accessible

---

### 🎯 CURRENT PRIORITY: Mini POC (2-3 Days)

**Goal:** Deliver simplified Upload → OCR → Database flow ASAP

**Tasks:**

1. ✅ Blob storage upload working
2. ✅ Document Intelligence OCR extraction
3. 🔄 Store OCR results in SQL database
4. ⏳ Test with 5 sample documents
5. ⏳ Create demo script for client walkthrough

**Target Completion:** January 17, 2026

---

### 🔄 Phase 1: Document Intelligence Integration (IN PROGRESS)

**Goal:** Process uploaded documents with Azure Document Intelligence OCR

**Current Progress:**

- ✅ Blob trigger function created (`documentProcessor.ts`)
- ✅ Document Intelligence client initialized
- ✅ OCR extraction logic implemented
- 🔄 Table parsing and structured data extraction
- 🔄 Confidence scoring and metadata storage
- 🔄 Database INSERT logic (save results to `document_processing_results`)

**Next Steps (Mini POC Focus):**

1. ✅ Complete table extraction from multi-page PDFs
2. 🔄 Store OCR results in SQL database (IN PROGRESS)
3. ⏳ Test with 5 sample vendor documents
4. ⏳ Create simple query script to demonstrate results
5. ⏳ Client demo: upload → process → query (< 5 minutes end-to-end)

**Deferred to Full POC:**

- AI mapping with LLMs (GPT-4o/Llama)
- Golden dataset testing framework
- Manual review workflow
- Vendor mapping memory

3. Test with sample vendor catalogs (PDF/Excel)
4. Implement error handling and retry logic

---

### ⏳ Phase 2: AI Mapping Engine (PENDING)

**Goal:** Use LLMs to map extracted data to standardized product schema

**Planned Implementation:**

1. **Model Selection (Azure AI Foundry)**

   - Deploy GPT-4o, Llama 3.1, and Mistral models
   - A/B test for accuracy vs cost tradeoffs
   - Choose best model per document type

2. **Field Mapping Prompts**

   - "Straight-shot prompting" approach (single LLM call per document)
   - Structured JSON output schema
   - Confidence scoring per field (0-100%)
   - Handle naming variations (SKU = "Item #" = "Product Code")

3. **Vendor Mapping Memory**
   - Store successful mappings in `vendor_mappings` table
   - Reuse learned patterns for repeat vendors
   - Track confidence scores for reuse decisions

**Expected Accuracy:** 85%+ on first pass, 95%+ after vendor-specific learning

---

### ⏳ Phase 3: Golden Dataset Testing (PENDING)

**Goal:** Automated quality gates to prevent accuracy regression

**Components:**

1. **Golden Dataset Creation**

   - Manually validate 10-20 vendor files
   - Create ground-truth JSON for each document
   - Cover diverse document types (PDF tables, Excel sheets, scanned images)

2. **Automated Test Suite**

   - Run on every code/prompt change
   - Compare AI output vs ground truth
   - Calculate accuracy, precision, recall metrics
   - Track model drift over time

3. **Quality Gates**
   - Block deployment if accuracy drops >5%
   - Alert on confidence score degradation
   - Automated rollback on test failures

**Testing Database:**

- `TestRuns`: Track each test execution
- `TestResults`: Individual file accuracy metrics
- `ModelDrift`: Detect performance degradation

---

### ⏳ Phase 4: Approval Workflow (PENDING)

**Goal:** Human-in-the-loop review for data quality assurance

**Features:**

1. **Manual Review Queue**

   - Flag documents with confidence <80%
   - Flag unexpected field values (price = $0, missing SKU)
   - Reviewer UI to view original document + AI results side-by-side

2. **Approval Actions**

   - ✅ Approve: Move to production database
   - ❌ Reject: Flag for reprocessing or manual data entry
   - ✏️ Edit: Correct specific fields and approve
   - 💬 Comment: Add notes for future reference

3. **Audit Trail**
   - Track all approvals/rejections
   - Log reviewer identity and timestamp
   - Retain original AI output (never overwrite)

---

### ⏳ Phase 5: Production Integration (PENDING)

**Goal:** End-to-end pipeline from upload to ERP-ready data

**Integration Points:**

1. **Frontend Upload UI**

   - Drag-and-drop file upload
   - Batch processing support
   - Real-time progress tracking

2. **Production Database Export**

   - Approved data copied to client's `pfdata` schema
   - Transformation to match ERP import format
   - Automated deduplication logic

3. **Cost Tracking Dashboard**
   - Real-time token usage by vendor/document
   - Budget projections (cost per 1k documents)
   - Alert thresholds (80%, 100% of budget)

---

## Technology Stack

### Infrastructure as Code

- **SST v3**: Modern IaC framework for Azure (Pulumi-based)
- **Azure CLI**: Authentication and resource management
- **TypeScript**: Type-safe infrastructure definitions

### Backend Services

- **Azure Functions (Node.js 20)**: Serverless document processing
- **Azure AI Foundry**: Multi-model AI access (GPT-4o, Llama, Mistral)
- **Azure Document Intelligence**: OCR and table extraction
- **Azure SQL Database**: Structured data storage

### Data Storage

- **Azure Blob Storage**: Document uploads and archives (bronze layer)
- **Data Lake Gen2**: Hierarchical namespace for organized file storage
- **Azure Key Vault**: Secrets and API key management

### Testing & Quality

- **Vitest**: Unit and integration testing
- **Golden Dataset Framework**: Automated accuracy testing
- **Model Drift Detection**: Performance monitoring over time

---

## Cost Structure

### Azure AI Foundry Models (Pay-Per-Use)

| Model          | Input Cost      | Output Cost     | Use Case                  |
| -------------- | --------------- | --------------- | ------------------------- |
| GPT-4o         | $2.50/1M tokens | $10/1M tokens   | High accuracy, multimodal |
| GPT-3.5-Turbo  | $0.50/1M tokens | $1.50/1M tokens | Cost-effective baseline   |
| Llama 3.1 405B | $1.00/1M tokens | $3.00/1M tokens | Open source alternative   |
| Mistral Large  | $2.00/1M tokens | $6.00/1M tokens | European data residency   |

### Document Intelligence

- **OCR**: $1.50 per 1,000 pages
- **Table Extraction**: $10 per 1,000 pages
- **Layout Analysis**: $10 per 1,000 pages

### Sample Cost Projection

- **1,000 documents/month** (avg 10 pages each)
  - Document Intelligence: $150 (10k pages × $1.50/1k)
  - GPT-4o (avg 5k tokens/document): $50 (5M tokens × $10/1M)
  - Storage: $2 (100GB × $0.02/GB)
  - **Total: ~$200/month**

### Budget Controls

- Monthly budget: $500 (dev), $2,500 (production)
- Alerts at 80% and 100% thresholds
- Automatic processing pause at budget limit

---

## Advantages Over Traditional OCR

### Traditional OCR (Azure Form Recognizer Standalone)

❌ Fixed templates required for each vendor  
❌ Breaks when vendor changes format  
❌ Manual field mapping maintenance  
❌ No learning or memory  
❌ Fails on complex layouts

### AI-Powered Approach (Document Intelligence + LLMs)

✅ **Adaptive**: Handles format changes automatically  
✅ **Learning**: Remembers vendor patterns for faster processing  
✅ **Intelligent Mapping**: Understands field semantics ("Dealer Cost" = wholesale price)  
✅ **Multi-Format**: Works on PDFs, Excel, scanned images, photos  
✅ **Confidence Scoring**: Flags uncertain results for human review  
✅ **Multi-Model**: Test multiple AI models for cost/accuracy tradeoffs

---

## Current Status & Next Steps

### ✅ Completed

- Infrastructure provisioned (Azure AI Foundry, Document Intelligence, SQL, Storage)
- Developer access configured (service principal with scoped permissions)
- Database schema created (`vvocr` with 5 tables)
- Azure Functions deployed (HTTP trigger, blob trigger)
- Document Intelligence integration started
- Local testing environment working (file upload, OCR processing)

### 🔄 In Progress

- Complete Document Intelligence table extraction logic
- Store OCR results in SQL database (`document_processing_results`)
- Error handling and retry mechanisms
- Logging and monitoring setup

### ⏳ Upcoming (Next 2 Weeks)

1. **AI Mapping Engine** (Phase 2)

   - Deploy GPT-4o model in Azure AI Foundry
   - Create field mapping prompts
   - Test with sample vendor catalogs
   - Implement vendor mapping memory

2. **Golden Dataset Testing** (Phase 3)

   - Manually validate 10 vendor files
   - Build automated test suite
   - Set up quality gates

3. **Manual Review Workflow** (Phase 4)
   - Build review queue UI
   - Implement approval/rejection logic
   - Audit trail logging

---

## Security & Compliance

### Data Isolation

- POC uses dedicated `vvocr` schema (isolated from customer data)
- Service principal has **zero access** to `pfdata`, `vvdata`, `config` schemas
- All database queries explicitly scoped to `vvocr.*`

### Secrets Management

- All API keys stored in Azure Key Vault
- Service principal credentials rotated quarterly
- No hardcoded secrets in code or config files

### Audit Trail

- All document processing logged with timestamps
- Manual review actions tracked (who approved/rejected)
- Original documents retained in bronze layer (never deleted)

### Cost Controls

- Budget alerts configured ($500/month dev limit)
- Token usage tracking per document/vendor
- Automatic processing pause at budget threshold

---

## Success Criteria

### Phase 1 Success Metrics (Document Intelligence)

- ✅ Process 100% of uploaded documents without crashes
- ✅ Extract text with >95% character accuracy
- ✅ Parse tables with >90% cell accuracy
- ✅ Store results in SQL database with <1 second latency

### Phase 2 Success Metrics (AI Mapping)

- 🎯 85%+ field mapping accuracy on first pass
- 🎯 95%+ accuracy after vendor-specific learning
- 🎯 <$0.10 cost per document (GPT-4o)
- 🎯 <5 seconds processing time per document

### Phase 3 Success Metrics (Golden Dataset)

- 🎯 Automated tests run on every code change
- 🎯 Zero deployments with >5% accuracy drop
- 🎯 Model drift detection within 24 hours

### Overall Project Success

- 🎯 Process 1,000 documents with <5% error rate
- 🎯 Manual review queue <20% of total documents
- 🎯 Cost <$0.20 per document (all-in)
- 🎯 Complete documentation and handoff package delivered

---

## Handoff Deliverables

At project completion (January 24, 2026), client will receive:

1. **Source Code**

   - Complete TypeScript codebase
   - Infrastructure as Code (SST/Pulumi)
   - Database schema and migration scripts
   - Automated test suite

2. **Deployed Azure Resources**

   - Fully configured Azure Functions
   - AI Foundry models deployed and tested
   - Database schema with sample data
   - Storage containers with test documents

3. **Documentation**

   - Developer setup guide
   - API documentation
   - Database schema reference
   - Cost optimization guide
   - Troubleshooting playbook

4. **Testing Assets**

   - Golden dataset (10-20 validated vendor files)
   - Automated test suite
   - Performance benchmarks

5. **Knowledge Transfer**
   - Live demo session
   - Architecture walkthrough
   - Maintenance and scaling guidance

---

## Contact & Support

**Developer:** Third-Party Contractor (Meir)  
**Project Timeline:** December 20, 2025 - January 24, 2026  
**Support Period:** 30 days post-delivery (included)

**Resources:**

- Azure AI Foundry Portal: https://ai.azure.com
- Document Intelligence Docs: https://learn.microsoft.com/azure/ai-services/document-intelligence/
- SST Documentation: https://sst.dev/docs
- Azure Functions Docs: https://learn.microsoft.com/azure/azure-functions/

---

_Last Updated: January 15, 2026 - Phase 1 (Document Intelligence Integration) in progress_
