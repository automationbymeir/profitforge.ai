# AI Data Collection & Transformation System

## Implementation Plan

**Project:** AI-Ready Retail Product Database  
**Budget:** $7,500  
**Timeline:** December 20, 2025 - January 24, 2026 (5 weeks)  
**Type:** Containerized Application Development  
**Updated:** December 20, 2025 (Post-Client Feedback)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Architecture Overview](#system-architecture-overview)
3. [Phase 0: Foundation & Golden Dataset](#phase-0-foundation--golden-dataset-days-1-5)
4. [Phase 1: Data Ingestion Layer](#phase-1-data-ingestion-layer-days-6-10)
5. [Phase 2: AI OCR & Mapping Engine](#phase-2-ai-ocr--mapping-engine-days-11-18)
6. [Phase 3: Testing & Validation Framework](#phase-3-testing--validation-framework-days-15-22)
7. [Phase 4: Approval Workflow & Token Tracking](#phase-4-approval-workflow--token-tracking-days-19-25)
8. [Phase 5: Integration & Production Hardening](#phase-5-integration--production-hardening-days-23-30)
9. [Phase 6: Documentation & Handoff](#phase-6-documentation--handoff-days-28-35)
10. [Implementation Timeline](#implementation-timeline)
11. [Budget Allocation](#budget-allocation)
12. [Tech Stack](#tech-stack)
13. [Deployment Strategy](#deployment-strategy)
14. [Success Criteria](#success-criteria)

---

## Executive Summary

### Project Goals

1. **Acquire** complete and accurate product lists and vendor terms from manufacturers/distributors
2. **Standardize** and transform all received documents into a consistent data structure
3. **Prepare** cleaned, structured data ready for import into internal database/AI pipeline
4. **Build** a production-ready, containerized system that processes vendor data on an ongoing basis
5. **Ensure quality** through automated testing against golden dataset benchmarks

### Key Requirements (Updated Based on Client Feedback)

- **Containerized deployment** - Docker containers for easy deployment via client's Terraform
- **AI-powered document extraction** - Azure Document Intelligence + Claude/GPT-4
- **Golden dataset testing** - Automated quality gates against validated benchmark data
- **Human-in-the-loop approval** - All results staged for review, no auto-approval initially
- **Vendor mapping memory** - Learn from first upload, reuse for future uploads
- **Token usage tracking** - Complete cost monitoring and budget projections
- **Straight-shot prompting** - Simple, debuggable LLM approach (not agentic frameworks)
- **Bronze-layer retention** - All raw and processed files retained permanently

### Expected Data Volume

- **Vendors:** Hundreds to few thousand over time
- **Products per vendor:** 10 to 10,000+ SKUs
- **Files per vendor:** 1-3 (catalog, price list, or combination)
- **Initial sample:** 341 files ranging from <1MB to 100MB+

---

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SYSTEM ARCHITECTURE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────────────────────┐ │
│  │   FRONTEND   │     │  API GATEWAY │     │      PROCESSING LAYER        │ │
│  │              │     │              │     │                              │ │
│  │ • Admin UI   │────▶│ • Auth (JWT) │────▶│ • Azure Functions            │ │
│  │ • CSV Upload │     │ • Routing    │     │ • AI Document Intelligence   │ │
│  │ • Mapping UI │     │ • Validation │     │ • LLM (Claude/OpenAI)        │ │
│  │ • Review UI  │     │              │     │ • Data Factory Pipelines     │ │
│  └──────────────┘     └──────────────┘     └──────────────────────────────┘ │
│                                                       │                      │
│                                                       ▼                      │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                          DATA LAYER                                    │  │
│  │                                                                        │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │  │
│  │  │ Data Lake   │  │ Azure SQL   │  │    Blob     │  │  Key Vault  │   │  │
│  │  │ Gen2        │  │ Database    │  │   Storage   │  │             │   │  │
│  │  │             │  │             │  │             │  │             │   │  │
│  │  │ • Raw JSON  │  │ • Products  │  │ • Uploads   │  │ • API Keys  │   │  │
│  │  │ • Mapped    │  │ • Staging   │  │ • Reports   │  │ • Secrets   │   │  │
│  │  │ • Archive   │  │ • Vendors   │  │ • Exports   │  │             │   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘   │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 0: Foundation & Golden Dataset (Days 1-5)

### 0.1 Development Environment Setup

**Isolated Azure Environment Approach:**

We will develop directly in a dedicated Azure resource group provided by the client:

| Component | Integration Method | Notes |
|-----------|-------------------|-------|
| **Dedicated Resource Group** | Client creates, we get service principal access | Isolated environment for this project |
| **Azure Functions** | Deploy directly to Azure | Use client's existing Functions plan |
| **Client's Azure SQL Server** | Connection string via Key Vault | Add new database/schema to existing server |
| **Client's Azure Blob Storage** | Connection string + managed identity | Write to client's storage account |
| **Azure Document Intelligence** | API key from client | Client provides when ready (Week 3) |
| **Claude/GPT-4 API** | API key from client | Client provides when ready (Week 3) |
| **Azure Monitor Logs** | Log Analytics workspace endpoint | Client provides for centralized logging |
| **Infrastructure as Code** | SST v3 (convertible to Terraform later) | Client can Terraform-ify after handoff |

**Access Requirements:**

- Service principal with Contributor role on dedicated resource group
- Read access to existing SQL Server and Storage accounts
- Connection strings stored in Key Vault

### 0.2 Golden Dataset Creation

**Purpose:** Establish accuracy benchmarks and automated quality gates.

**Process:**

1. Client provides 10-20 representative vendor files:
   - Various formats (PDF, CSV, Excel, multi-page catalogs)
   - Different layouts and complexities
   - Range of product counts (10 to 1000+ items)
   - Different vendor naming conventions

2. Manual validation of each file (with client team):
   - Extract products manually
   - Create validated JSON outputs
   - Document edge cases and tricky mappings
   - Define expected confidence scores

3. Store golden dataset:

   ```
   golden-dataset/
   ├── files/
   │   ├── vendor1_catalog.pdf
   │   ├── vendor2_pricelist.xlsx
   │   └── vendor3_combined.pdf
   ├── expected/
   │   ├── vendor1_catalog_expected.json
   │   ├── vendor2_pricelist_expected.json
   │   └── vendor3_combined_expected.json
   └── metadata/
       └── dataset_info.json
   ```

4. Define success criteria:
   - Field extraction accuracy: >95%
   - Confidence score calibration
   - Processing time benchmarks
| **Application Insights** | Monitoring and logging | Basic |
| **Azure API Management** | API Gateway (optional, can use Functions directly) | Consumption |
| **Azure Functions** | Serverless compute for processing | Consumption plan |

### 0.2 Resource Group Structure

```
rg-vendor-data-prod
├── dl-vendordata-prod          (Data Lake Gen2)
├── sql-vendordata-prod         (SQL Server)
├── sqldb-products-prod         (SQL Database)
├── st-vendoruploads-prod       (Blob Storage)
├── kv-vendordata-prod          (Key Vault)
├── ai-docintell-prod           (Document Intelligence)
├── func-vendorprocessing-prod  (Azure Functions)
├── appi-vendordata-prod        (Application Insights)
└── adf-vendorpipelines-prod    (Data Factory)
```

### 0.3 Database Schema Definition

```sql
-- =============================================
-- VENDOR DATA SCHEMA
-- =============================================

-- Vendors Table
CREATE TABLE Vendors (
    VendorID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    VendorName NVARCHAR(200) NOT NULL,
    VendorCode NVARCHAR(50) UNIQUE,
    ContactEmail NVARCHAR(200),
    ContactPhone NVARCHAR(50),
    ResellerID NVARCHAR(100),
    FreightTerms NVARCHAR(500),
    MinOrderThreshold DECIMAL(10,2),
    FreeFreightThreshold DECIMAL(10,2),
    DefaultMOQ INT,
    DefaultLeadTimeDays INT,
    MappingTemplateJSON NVARCHAR(MAX),  -- Stored mapping for repeat uploads
    CreatedAt DATETIME2 DEFAULT GETUTCDATE(),
    UpdatedAt DATETIME2,
    Status NVARCHAR(50) DEFAULT 'Active'
);

-- Products Staging Table (AI-processed data awaiting approval)
CREATE TABLE Products_Staging (
    StagingID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    VendorID UNIQUEIDENTIFIER FOREIGN KEY REFERENCES Vendors(VendorID),
    BatchID UNIQUEIDENTIFIER,           -- Groups products from same upload
    SKU NVARCHAR(100),
    Description NVARCHAR(500),
    Cost DECIMAL(10,2),
    MAP DECIMAL(10,2),
    MSRP DECIMAL(10,2),
    Category NVARCHAR(200),
    SubCategory NVARCHAR(200),
    MOQ INT,
    LeadTimeDays INT,
    FreightTerms NVARCHAR(200),
    UPC NVARCHAR(50),
    Weight DECIMAL(10,4),
    PackSize NVARCHAR(100),
    AdditionalAttributes NVARCHAR(MAX), -- JSON for extra fields
    ConfidenceScore DECIMAL(3,2),       -- AI confidence (0.00-1.00)
    SourceFileName NVARCHAR(500),
    RawJSONPath NVARCHAR(500),          -- Path in Data Lake
    MappedJSONPath NVARCHAR(500),       -- Path in Data Lake
    ProcessedAt DATETIME2 DEFAULT GETUTCDATE(),
    ReviewedBy NVARCHAR(200),
    ReviewedAt DATETIME2,
    Status NVARCHAR(50) DEFAULT 'Pending' -- Pending, Approved, Rejected
);

-- Products Table (Approved production data)
CREATE TABLE Products (
    ProductID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    VendorID UNIQUEIDENTIFIER FOREIGN KEY REFERENCES Vendors(VendorID),
    SKU NVARCHAR(100) NOT NULL,
    Description NVARCHAR(500),
    Cost DECIMAL(10,2),
    MAP DECIMAL(10,2),
    MSRP DECIMAL(10,2),
    Category NVARCHAR(200),
    SubCategory NVARCHAR(200),
    MOQ INT,
    LeadTimeDays INT,
    FreightTerms NVARCHAR(200),
    UPC NVARCHAR(50),
    Weight DECIMAL(10,4),
    PackSize NVARCHAR(100),
    AdditionalAttributes NVARCHAR(MAX),
    SourceStagingID UNIQUEIDENTIFIER,
    CreatedAt DATETIME2 DEFAULT GETUTCDATE(),
    UpdatedAt DATETIME2,
    IsActive BIT DEFAULT 1,
    CONSTRAINT UQ_Vendor_SKU UNIQUE (VendorID, SKU)
);

-- Upload Batches Table (Tracking each upload session)
CREATE TABLE UploadBatches (
    BatchID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    VendorID UNIQUEIDENTIFIER FOREIGN KEY REFERENCES Vendors(VendorID),
    FileName NVARCHAR(500),
    FileType NVARCHAR(50),              -- PDF, CSV, XLSX
    FileSizeBytes BIGINT,
    UploadMethod NVARCHAR(50),          -- Template, AIProcessed
    RawFilePath NVARCHAR(500),
    TotalRecords INT,
    ProcessedRecords INT,
    ApprovedRecords INT,
    RejectedRecords INT,
    AverageConfidence DECIMAL(3,2),
    UploadedBy NVARCHAR(200),
    UploadedAt DATETIME2 DEFAULT GETUTCDATE(),
    ProcessingStartedAt DATETIME2,
    ProcessingCompletedAt DATETIME2,
    Status NVARCHAR(50) DEFAULT 'Uploaded' -- Uploaded, Processing, Completed, Failed
);

-- Vendor Outreach Log
CREATE TABLE VendorOutreach (
    OutreachID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    VendorID UNIQUEIDENTIFIER FOREIGN KEY REFERENCES Vendors(VendorID),
    OutreachType NVARCHAR(50),          -- Email, Phone, Follow-up
    ContactedAt DATETIME2,
    ContactedBy NVARCHAR(200),
    ResponseReceived BIT DEFAULT 0,
    ResponseDate DATETIME2,
    Notes NVARCHAR(MAX),
    NextFollowUpDate DATE,
    Status NVARCHAR(50)                 -- Pending, Responded, NoResponse, Escalated
);

-- Indexes for performance
CREATE INDEX IX_Products_VendorID ON Products(VendorID);
CREATE INDEX IX_Products_SKU ON Products(SKU);
CREATE INDEX IX_Products_Category ON Products(Category);
CREATE INDEX IX_Staging_BatchID ON Products_Staging(BatchID);
CREATE INDEX IX_Staging_Status ON Products_Staging(Status);
CREATE INDEX IX_Batches_VendorID ON UploadBatches(VendorID);
```

### 0.4 Data Lake Folder Structure

```
dl-vendordata-prod/
├── raw/
│   └── {vendor_id}/
│       └── {date}/
│           ├── {original_filename}
│           └── {filename}_extraction.json
├── mapped/
│   └── {vendor_id}/
│       └── {date}/
│           └── {filename}_mapped.json
├── approved/
│   └── {vendor_id}/
│       └── {date}/
│           └── {filename}_final.json
├── templates/
│   └── {vendor_id}/
│       └── mapping_template.json
├── archive/
│   └── {year}/
│       └── {month}/
│           └── {vendor_id}/
└── reference/
    ├── schema_definition.json
    └── sample_mappings/
```

---

## Phase 1: Data Ingestion Layer (Days 4-10)

### 1.1 API Endpoints Specification

```yaml
openapi: 3.0.0
info:
  title: Vendor Data Processing API
  version: 1.0.0

paths:
  /api/vendors:
    get:
      summary: List all vendors
      responses:
        200:
          description: List of vendors
    post:
      summary: Create new vendor
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/VendorCreate'

  /api/vendors/{vendorId}:
    get:
      summary: Get vendor details
    put:
      summary: Update vendor
    delete:
      summary: Deactivate vendor

  /api/upload/csv-template:
    post:
      summary: Upload pre-formatted CSV using template
      requestBody:
        content:
          multipart/form-data:
            schema:
              type: object
              properties:
                file:
                  type: string
                  format: binary
                vendorId:
                  type: string
                  format: uuid

  /api/upload/document:
    post:
      summary: Upload document for AI processing (PDF, XLSX, etc.)
      requestBody:
        content:
          multipart/form-data:
            schema:
              type: object
              properties:
                file:
                  type: string
                  format: binary
                vendorId:
                  type: string
                  format: uuid

  /api/batches/{batchId}:
    get:
      summary: Get batch processing status

  /api/batches/{batchId}/mapping:
    get:
      summary: Get AI-suggested field mapping for review
    put:
      summary: Confirm/update field mapping

  /api/batches/{batchId}/products:
    get:
      summary: Get staged products for batch

  /api/batches/{batchId}/approve:
    post:
      summary: Approve all products in batch
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                productIds:
                  type: array
                  items:
                    type: string
                    format: uuid

  /api/batches/{batchId}/reject:
    post:
      summary: Reject products in batch

  /api/products/staging:
    get:
      summary: Get all products awaiting approval
      parameters:
        - name: vendorId
          in: query
          schema:
            type: string
        - name: status
          in: query
          schema:
            type: string
            enum: [Pending, Approved, Rejected]

  /api/products/{productId}/approve:
    post:
      summary: Approve single product

  /api/products/{productId}/reject:
    post:
      summary: Reject single product
```

### 1.2 Two Processing Paths

#### Path A: Manual CSV Template (Direct Upload)

```
┌─────────────────────────────────────────────────────────────────┐
│                    PATH A: CSV TEMPLATE FLOW                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [User uploads CSV using template]                               │
│              │                                                   │
│              ▼                                                   │
│  [API receives file]                                             │
│              │                                                   │
│              ▼                                                   │
│  [Validate structure & data types]──────▶ [Return errors]       │
│              │                                    ▲              │
│              │ Valid                              │ Invalid      │
│              ▼                                    │              │
│  [Parse CSV to JSON]                              │              │
│              │                                    │              │
│              ▼                                    │              │
│  [Validate required fields]─────────────────────►│              │
│              │                                                   │
│              │ Valid                                             │
│              ▼                                                   │
│  [Insert to Products_Staging]                                    │
│              │                                                   │
│              ▼                                                   │
│  [Set Status = 'Pending', Confidence = 1.0]                     │
│              │                                                   │
│              ▼                                                   │
│  [Ready for approval (or auto-approve)]                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### Path B: AI/OCR Processing (Complex Documents)

```
┌─────────────────────────────────────────────────────────────────┐
│                 PATH B: AI DOCUMENT PROCESSING                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [User uploads PDF/Catalog/XLSX]                                 │
│              │                                                   │
│              ▼                                                   │
│  [Store raw file in Data Lake: raw/{vendor}/{date}/]            │
│              │                                                   │
│              ▼                                                   │
│  [Create UploadBatch record, Status = 'Processing']             │
│              │                                                   │
│              ▼                                                   │
│  [Trigger Azure Function: DocumentProcessor]                     │
│              │                                                   │
│              ▼                                                   │
│  ┌───────────────────────────────────────────┐                  │
│  │  STEP 1: OCR Extraction                   │                  │
│  │  • Azure Document Intelligence            │                  │
│  │  • Extract tables, text, structure        │                  │
│  │  • Output: raw_extraction.json            │                  │
│  └───────────────────────────────────────────┘                  │
│              │                                                   │
│              ▼                                                   │
│  [Save raw JSON to Data Lake]                                    │
│              │                                                   │
│              ▼                                                   │
│  [Check: Does vendor have mapping template?]                     │
│              │                                                   │
│      ┌───────┴───────┐                                          │
│      │ YES           │ NO                                        │
│      ▼               ▼                                          │
│  [Apply cached   [LLM Schema                                     │
│   mapping]        Mapping]                                       │
│      │               │                                          │
│      └───────┬───────┘                                          │
│              │                                                   │
│              ▼                                                   │
│  ┌───────────────────────────────────────────┐                  │
│  │  STEP 2: Schema Mapping                   │                  │
│  │  • Map extracted fields to target schema  │                  │
│  │  • Calculate confidence scores            │                  │
│  │  • Output: mapped_data.json               │                  │
│  └───────────────────────────────────────────┘                  │
│              │                                                   │
│              ▼                                                   │
│  [Save mapped JSON to Data Lake]                                 │
│              │                                                   │
│              ▼                                                   │
│  [Insert records to Products_Staging]                            │
│              │                                                   │
│              ▼                                                   │
│  [Update batch status, notify user]                              │
│              │                                                   │
│              ▼                                                   │
│  [User reviews mapping via UI]                                   │
│              │                                                   │
│              ▼                                                   │
│  [User confirms → Save mapping template for vendor]              │
│              │                                                   │
│              ▼                                                   │
│  [User approves products → Move to Products table]               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 CSV Template Specification

Provide users with a template CSV they can fill out:

```csv
SKU,Description,Cost,MAP,MSRP,Category,SubCategory,MOQ,LeadTimeDays,FreightTerms,UPC,Weight,PackSize
ABC123,"Widget Pro 3000",24.99,39.99,49.99,Tools,Power Tools,6,14,FOB Origin,012345678901,2.5,1 EA
DEF456,"Super Gadget XL",12.50,19.99,24.99,Electronics,Accessories,12,7,Prepaid,012345678902,0.75,2 PK
```

### 1.4 Validation Rules

```python
VALIDATION_SCHEMA = {
    "SKU": {
        "required": True,
        "type": "string",
        "max_length": 100,
        "pattern": r"^[A-Za-z0-9\-_]+$",
        "error_message": "SKU must contain only letters, numbers, hyphens, and underscores"
    },
    "Description": {
        "required": True,
        "type": "string",
        "max_length": 500,
        "min_length": 3
    },
    "Cost": {
        "required": True,
        "type": "decimal",
        "min": 0.01,
        "max": 999999.99,
        "precision": 2
    },
    "MAP": {
        "required": False,
        "type": "decimal",
        "min": 0,
        "max": 999999.99,
        "precision": 2,
        "validation": "must be >= Cost if provided"
    },
    "MSRP": {
        "required": False,
        "type": "decimal",
        "min": 0,
        "max": 999999.99,
        "precision": 2,
        "validation": "must be >= MAP if both provided"
    },
    "Category": {
        "required": False,
        "type": "string",
        "max_length": 200
    },
    "MOQ": {
        "required": False,
        "type": "integer",
        "min": 1,
        "max": 100000,
        "default": 1
    },
    "LeadTimeDays": {
        "required": False,
        "type": "integer",
        "min": 0,
        "max": 365
    },
    "UPC": {
        "required": False,
        "type": "string",
        "pattern": r"^\d{12,14}$",
        "error_message": "UPC must be 12-14 digits"
    },
    "Weight": {
        "required": False,
        "type": "decimal",
        "min": 0,
        "precision": 4
    }
}
```

---

## Phase 2: AI OCR & Mapping Engine (Days 11-20)

### 2.1 Azure Function: Document Processor

```python
# function_app.py
import azure.functions as func
import json
import logging
from azure.ai.formrecognizer import DocumentAnalysisClient
from azure.identity import DefaultAzureCredential
from azure.storage.filedatalake import DataLakeServiceClient
import anthropic  # or openai

app = func.FunctionApp()

@app.blob_trigger(arg_name="myblob", path="uploads/{vendor_id}/{filename}",
                  connection="DataLakeConnection")
def process_vendor_document(myblob: func.InputStream):
    """
    Triggered when a new file is uploaded to the uploads container.
    Processes the document through OCR and AI mapping.
    """
    logging.info(f"Processing file: {myblob.name}")
    
    # Extract vendor_id and filename from path
    path_parts = myblob.name.split('/')
    vendor_id = path_parts[1]
    filename = path_parts[2]
    
    try:
        # Step 1: OCR Extraction
        raw_extraction = extract_document_content(myblob)
        
        # Step 2: Save raw extraction to Data Lake
        raw_json_path = save_to_datalake(
            f"raw/{vendor_id}/{get_date()}/{filename}_extraction.json",
            raw_extraction
        )
        
        # Step 3: Check for existing vendor mapping template
        mapping_template = get_vendor_mapping_template(vendor_id)
        
        # Step 4: Map to schema (using template or AI)
        if mapping_template:
            mapped_data = apply_mapping_template(raw_extraction, mapping_template)
            confidence = 0.95  # High confidence for known mappings
        else:
            mapped_data, confidence = ai_map_to_schema(raw_extraction)
        
        # Step 5: Save mapped data to Data Lake
        mapped_json_path = save_to_datalake(
            f"mapped/{vendor_id}/{get_date()}/{filename}_mapped.json",
            {
                "data": mapped_data,
                "confidence": confidence,
                "source_file": filename,
                "processed_at": get_timestamp()
            }
        )
        
        # Step 6: Insert to staging table
        insert_to_staging(
            vendor_id=vendor_id,
            products=mapped_data,
            confidence=confidence,
            raw_path=raw_json_path,
            mapped_path=mapped_json_path,
            source_file=filename
        )
        
        # Step 7: Update batch status
        update_batch_status(vendor_id, filename, "Completed", len(mapped_data))
        
        logging.info(f"Successfully processed {filename}: {len(mapped_data)} products")
        
    except Exception as e:
        logging.error(f"Error processing {filename}: {str(e)}")
        update_batch_status(vendor_id, filename, "Failed", error=str(e))
        raise


def extract_document_content(blob_content) -> dict:
    """
    Use Azure Document Intelligence to extract content from documents.
    Handles PDFs, images, Excel files.
    """
    credential = DefaultAzureCredential()
    client = DocumentAnalysisClient(
        endpoint=os.environ["DOCUMENT_INTELLIGENCE_ENDPOINT"],
        credential=credential
    )
    
    # Use prebuilt-layout for general documents or prebuilt-invoice for price lists
    poller = client.begin_analyze_document(
        "prebuilt-layout",  # or "prebuilt-document" for more structure
        document=blob_content.read()
    )
    result = poller.result()
    
    extracted_data = {
        "tables": [],
        "key_value_pairs": [],
        "paragraphs": []
    }
    
    # Extract tables
    for table in result.tables:
        table_data = {
            "row_count": table.row_count,
            "column_count": table.column_count,
            "cells": []
        }
        for cell in table.cells:
            table_data["cells"].append({
                "row": cell.row_index,
                "column": cell.column_index,
                "content": cell.content,
                "is_header": cell.kind == "columnHeader"
            })
        extracted_data["tables"].append(table_data)
    
    # Extract key-value pairs
    for kv_pair in result.key_value_pairs:
        if kv_pair.key and kv_pair.value:
            extracted_data["key_value_pairs"].append({
                "key": kv_pair.key.content,
                "value": kv_pair.value.content
            })
    
    return extracted_data


def ai_map_to_schema(raw_extraction: dict) -> tuple[list, float]:
    """
    Use LLM to map extracted data to target schema.
    Returns (mapped_products, average_confidence)
    """
    client = anthropic.Anthropic()  # or OpenAI client
    
    prompt = f"""You are a data transformation expert. Analyze this extracted vendor document data 
and map it to our product schema.

TARGET SCHEMA (required fields marked with *):
- SKU* (string): Product identifier/item number
- Description* (string): Product name or description
- Cost* (decimal): Wholesale/dealer cost price
- MAP (decimal): Minimum advertised price
- MSRP (decimal): Retail/list price
- Category (string): Product category
- SubCategory (string): Product subcategory
- MOQ (integer): Minimum order quantity
- LeadTimeDays (integer): Shipping lead time in days
- FreightTerms (string): Shipping/freight terms
- UPC (string): 12-14 digit barcode
- Weight (decimal): Product weight
- PackSize (string): Pack/unit size

EXTRACTED DATA:
{json.dumps(raw_extraction, indent=2)}

INSTRUCTIONS:
1. Identify which columns/fields in the source map to our schema
2. Extract all product records
3. For each field mapping, provide a confidence score (0.0-1.0)
4. Handle variations in naming (e.g., "Item #" = SKU, "Dealer Cost" = Cost)
5. Clean data formats (remove $ from prices, standardize decimals)

OUTPUT FORMAT (JSON):
{{
    "field_mappings": {{
        "SKU": {{"source_column": "Item #", "confidence": 0.95}},
        "Description": {{"source_column": "Product Name", "confidence": 0.92}},
        ...
    }},
    "products": [
        {{"SKU": "ABC123", "Description": "Widget", "Cost": 24.99, ...}},
        ...
    ],
    "unmapped_source_fields": ["field1", "field2"],
    "notes": "Any observations about data quality or issues"
}}
"""
    
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}]
    )
    
    result = json.loads(response.content[0].text)
    
    # Calculate average confidence
    confidences = [m["confidence"] for m in result["field_mappings"].values()]
    avg_confidence = sum(confidences) / len(confidences) if confidences else 0.5
    
    return result["products"], avg_confidence


def get_vendor_mapping_template(vendor_id: str) -> dict | None:
    """
    Retrieve cached mapping template for a vendor (if exists).
    """
    template_path = f"templates/{vendor_id}/mapping_template.json"
    try:
        content = read_from_datalake(template_path)
        return json.loads(content)
    except:
        return None


def apply_mapping_template(raw_extraction: dict, template: dict) -> list:
    """
    Apply a saved mapping template to new data from the same vendor.
    """
    products = []
    field_mappings = template["field_mappings"]
    
    # Find the main data table
    for table in raw_extraction.get("tables", []):
        # Build header mapping
        headers = {}
        for cell in table["cells"]:
            if cell.get("is_header"):
                headers[cell["column"]] = cell["content"]
        
        # Extract rows
        rows_data = {}
        for cell in table["cells"]:
            if not cell.get("is_header"):
                row = cell["row"]
                col = cell["column"]
                if row not in rows_data:
                    rows_data[row] = {}
                rows_data[row][headers.get(col, f"col_{col}")] = cell["content"]
        
        # Map to schema
        for row_data in rows_data.values():
            product = {}
            for target_field, mapping in field_mappings.items():
                source_col = mapping["source_column"]
                if source_col in row_data:
                    value = row_data[source_col]
                    # Apply any transformations
                    if mapping.get("transform") == "decimal":
                        value = clean_decimal(value)
                    elif mapping.get("transform") == "uppercase":
                        value = value.upper().strip()
                    product[target_field] = value
            
            if product.get("SKU"):  # Only add if has SKU
                products.append(product)
    
    return products
```

### 2.2 Mapping Template Structure

When a user confirms a mapping, save it for future use:

```json
{
    "vendor_id": "ace-hardware-001",
    "vendor_name": "ACE Hardware",
    "version": 1,
    "created_at": "2025-12-20T10:30:00Z",
    "created_by": "admin@company.com",
    "last_used": "2025-12-28T14:22:00Z",
    "use_count": 5,
    "field_mappings": {
        "SKU": {
            "source_columns": ["Item #", "Part Number", "SKU"],
            "transform": "uppercase",
            "confidence": 0.98
        },
        "Description": {
            "source_columns": ["Product Name", "Item Description", "Description"],
            "transform": null,
            "confidence": 0.95
        },
        "Cost": {
            "source_columns": ["Dealer Cost", "Net Price", "Wholesale"],
            "transform": "decimal",
            "confidence": 0.97
        },
        "MAP": {
            "source_columns": ["MAP", "Min Advertised", "Minimum Price"],
            "transform": "decimal",
            "confidence": 0.92
        },
        "MSRP": {
            "source_columns": ["List Price", "MSRP", "Retail", "SRP"],
            "transform": "decimal",
            "confidence": 0.94
        },
        "Category": {
            "source_columns": ["Category", "Product Category", "Cat"],
            "transform": null,
            "confidence": 0.88
        },
        "MOQ": {
            "source_columns": ["Min Qty", "MOQ", "Minimum Order"],
            "transform": "integer",
            "confidence": 0.90
        },
        "UPC": {
            "source_columns": ["UPC", "UPC-A", "Barcode", "GTIN"],
            "transform": "digits_only",
            "confidence": 0.99
        }
    },
    "default_values": {
        "MOQ": 1,
        "LeadTimeDays": 14
    },
    "notes": "ACE uses 'Dealer Cost' for wholesale pricing. Category codes need manual review."
}
```

### 2.3 Confidence Score Thresholds

```python
CONFIDENCE_THRESHOLDS = {
    "auto_approve": 0.95,      # Auto-approve without review
    "standard_review": 0.85,   # Normal review process
    "detailed_review": 0.70,   # Flag for detailed review
    "reject": 0.50             # Below this, reject and request manual entry
}

def determine_review_level(confidence: float) -> str:
    if confidence >= CONFIDENCE_THRESHOLDS["auto_approve"]:
        return "auto_approve"
    elif confidence >= CONFIDENCE_THRESHOLDS["standard_review"]:
        return "standard_review"
    elif confidence >= CONFIDENCE_THRESHOLDS["detailed_review"]:
        return "detailed_review"
    else:
        return "reject"
```

---

## Phase 3: Testing & Validation Framework (Days 15-22)

### 3.1 Golden Dataset Test Suite

**Automated Testing Infrastructure:**

```typescript
// Test runner that validates all code changes against golden dataset
interface GoldenDatasetTest {
    testId: string;
    fileName: string;
    expectedOutput: ProductRecord[];
    minimumConfidence: number;
    maxProcessingTimeMs: number;
}

async function runGoldenDatasetTests(modelVersion: string, promptVersion: string) {
    const testRun = await createTestRun(modelVersion, promptVersion);
    
    for (const test of goldenDatasetTests) {
        const result = await processDocument(test.fileName);
        
        // Calculate accuracy metrics
        const accuracy = calculateAccuracy(result.products, test.expectedOutput);
        const avgConfidence = calculateAverageConfidence(result.products);
        const processingTime = result.processingTimeMs;
        
        // Store results
        await storeTestResult({
            testRunId: testRun.id,
            testId: test.testId,
            accuracy: accuracy,
            avgConfidence: avgConfidence,
            processingTime: processingTime,
            passed: accuracy >= 0.95 && avgConfidence >= test.minimumConfidence
        });
        
        // Check for drift
        await checkForDrift(test.testId, avgConfidence);
    }
    
    return testRun;
}
```

### 3.2 Test Tracking Database Tables

```sql
-- Test Runs Table
CREATE TABLE TestRuns (
    TestRunID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    ModelVersion NVARCHAR(100),             -- e.g., "claude-3.5-sonnet-20241022"
    PromptVersion NVARCHAR(50),             -- e.g., "v1.3"
    RunTriggeredBy NVARCHAR(200),           -- User or CI/CD system
    RunStartedAt DATETIME2 DEFAULT GETUTCDATE(),
    RunCompletedAt DATETIME2,
    TotalTests INT,
    TestsPassed INT,
    TestsFailed INT,
    AverageAccuracy DECIMAL(5,2),
    AverageConfidence DECIMAL(3,2),
    Status NVARCHAR(50) DEFAULT 'Running'   -- Running, Completed, Failed
);

-- Test Results Table (Individual test outcomes)
CREATE TABLE TestResults (
    ResultID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    TestRunID UNIQUEIDENTIFIER FOREIGN KEY REFERENCES TestRuns(TestRunID),
    GoldenDatasetFileID NVARCHAR(100),      -- Reference to golden dataset file
    FileName NVARCHAR(500),
    FieldAccuracy DECIMAL(5,2),             -- Percentage of fields correctly extracted
    RecordAccuracy DECIMAL(5,2),            -- Percentage of products correctly identified
    AverageConfidence DECIMAL(3,2),
    ProcessingTimeMs INT,
    ExpectedProductCount INT,
    ActualProductCount INT,
    MissingFields NVARCHAR(MAX),            -- JSON array of missed fields
    IncorrectMappings NVARCHAR(MAX),        -- JSON details of wrong mappings
    TestPassed BIT,
    TestedAt DATETIME2 DEFAULT GETUTCDATE()
);

-- Model Drift Tracking
CREATE TABLE ModelDrift (
    DriftID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    GoldenDatasetFileID NVARCHAR(100),
    BaselineConfidence DECIMAL(3,2),        -- Initial confidence when test created
    CurrentConfidence DECIMAL(3,2),         -- Latest test run confidence
    ConfidenceDelta DECIMAL(4,2),           -- Difference from baseline
    BaselineAccuracy DECIMAL(5,2),
    CurrentAccuracy DECIMAL(5,2),
    AccuracyDelta DECIMAL(4,2),
    DriftDetectedAt DATETIME2,
    Severity NVARCHAR(50),                  -- Low, Medium, High, Critical
    Notes NVARCHAR(MAX)
);

-- Token Usage Tracking
CREATE TABLE TokenUsage (
    UsageID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    BatchID UNIQUEIDENTIFIER,
    FileName NVARCHAR(500),
    ModelUsed NVARCHAR(100),
    PromptTokens INT,
    CompletionTokens INT,
    TotalTokens INT,
    EstimatedCostUSD DECIMAL(10,6),
    ProcessedAt DATETIME2 DEFAULT GETUTCDATE()
);

-- Cost Aggregation View
CREATE VIEW vw_TokenCostSummary AS
SELECT 
    CAST(ProcessedAt AS DATE) as ProcessingDate,
    ModelUsed,
    COUNT(*) as TotalFiles,
    SUM(TotalTokens) as TotalTokens,
    SUM(EstimatedCostUSD) as TotalCostUSD
FROM TokenUsage
GROUP BY CAST(ProcessedAt AS DATE), ModelUsed;

-- Create indexes
CREATE INDEX IX_TestResults_TestRunID ON TestResults(TestRunID);
CREATE INDEX IX_TestResults_TestPassed ON TestResults(TestPassed);
CREATE INDEX IX_ModelDrift_Severity ON ModelDrift(Severity);
CREATE INDEX IX_TokenUsage_BatchID ON TokenUsage(BatchID);
CREATE INDEX IX_TokenUsage_ProcessedAt ON TokenUsage(ProcessedAt);
```

### 3.3 CI/CD Quality Gates

**GitHub Actions Workflow Example:**

```yaml
name: Golden Dataset Validation

on:
  pull_request:
    paths:
      - 'src/processing/**'
      - 'src/prompts/**'
      
jobs:
  validate-against-golden-dataset:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Run Golden Dataset Tests
        run: |
          npm run test:golden-dataset
          
      - name: Check Quality Gates
        run: |
          # Fail if average accuracy < 95%
          # Fail if average confidence drops > 5% from baseline
          # Fail if any test completely fails
          npm run check:quality-gates
          
      - name: Generate Test Report
        if: always()
        run: |
          npm run report:test-results
          
      - name: Comment on PR
        uses: actions/github-script@v6
        with:
          script: |
            const report = require('./test-results.json');
            const comment = `
            ## Golden Dataset Test Results
            - **Tests Passed:** ${report.passed}/${report.total}
            - **Average Accuracy:** ${report.avgAccuracy}%
            - **Average Confidence:** ${report.avgConfidence}
            - **Status:** ${report.status}
            `;
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: comment
            });
```

### 3.4 Drift Detection Algorithm

```python
def check_for_drift(golden_file_id: str, current_confidence: float):
    """
    Detect if model performance has degraded compared to baseline
    """
    baseline = get_baseline_metrics(golden_file_id)
    
    confidence_delta = current_confidence - baseline.confidence
    
    # Calculate drift severity
    if abs(confidence_delta) < 0.02:
        severity = "None"
    elif abs(confidence_delta) < 0.05:
        severity = "Low"
    elif abs(confidence_delta) < 0.10:
        severity = "Medium"
    elif abs(confidence_delta) < 0.15:
        severity = "High"
    else:
        severity = "Critical"
    
    if severity in ["High", "Critical"]:
        # Log drift event
        log_drift_event(golden_file_id, baseline.confidence, 
                       current_confidence, severity)
        
        # Alert team
        send_alert(f"Model drift detected: {severity} for {golden_file_id}")
        
        # Block deployment in CI/CD
        if severity == "Critical":
            raise Exception("Critical model drift detected - blocking deployment")
    
    return severity
```

---

## Phase 4: Approval Workflow & Token Tracking (Days 19-25)

### 4.1 Simplified Approval System

**Design Principle:** Start simple, add complexity later.

**Phase 4A: API-Based Approval (MVP)**

```typescript
// Simple approval API endpoints
app.post('/api/staging/approve-batch', async (req, res) => {
    const { batchId, approvedBy } = req.body;
    
    // Move all products from staging to production
    const result = await approveProductBatch(batchId, approvedBy);
    
    res.json({
        success: true,
        recordsMoved: result.count,
        batchId: batchId
    });
});

app.post('/api/staging/reject-batch', async (req, res) => {
    const { batchId, reason, rejectedBy } = req.body;
    
    // Mark batch as rejected
    await rejectProductBatch(batchId, reason, rejectedBy);
    
    res.json({
        success: true,
        message: 'Batch rejected and flagged for review'
    });
});

app.post('/api/staging/approve-product/:productId', async (req, res) => {
    const { productId } = req.params;
    const { approvedBy } = req.body;
    
    // Move single product to production
    await approveProduct(productId, approvedBy);
    
    res.json({ success: true });
});
```

**Phase 4B: Command-Line Tool (Optional)**

```bash
# Approve entire batch
./vendor-tool approve --batch-id abc-123 --user admin@company.com

# Reject batch
./vendor-tool reject --batch-id abc-123 --reason "incorrect pricing" --user admin@company.com

# List pending batches
./vendor-tool list-pending

# Preview batch before approval
./vendor-tool preview --batch-id abc-123

# Approve with filters
./vendor-tool approve --batch-id abc-123 --min-confidence 0.90
```

**Phase 4C: SQL-Based Review (Simplest)**

```sql
-- Review pending products
SELECT 
    StagingID,
    VendorName = v.VendorName,
    SKU,
    Description,
    Cost,
    ConfidenceScore,
    SourceFileName
FROM Products_Staging ps
JOIN Vendors v ON ps.VendorID = v.VendorID
WHERE ps.Status = 'Pending'
AND ps.BatchID = 'abc-123-def'
ORDER BY ConfidenceScore DESC;

-- Approve entire batch
UPDATE Products_Staging
SET Status = 'Approved', 
    ReviewedBy = 'admin@company.com',
    ReviewedAt = GETUTCDATE()
WHERE BatchID = 'abc-123-def'
AND Status = 'Pending';

-- Move approved to production (stored procedure)
EXEC sp_MoveApprovedToProduction @BatchID = 'abc-123-def';
```

### 4.2 Token Usage Tracking

**Real-time Cost Monitoring:**

```typescript
interface TokenUsageLog {
    usageId: string;
    batchId: string;
    fileName: string;
    modelUsed: string;           // "claude-3.5-sonnet", "gpt-4-turbo"
    operationType: string;       // "ocr", "mapping", "validation"
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costPerToken: number;
    estimatedCostUSD: number;
    processingTimeMs: number;
    timestamp: Date;
}

async function trackTokenUsage(
    operation: string,
    model: string,
    response: AIResponse,
    context: ProcessingContext
) {
    const pricing = getModelPricing(model);
    
    const usage: TokenUsageLog = {
        usageId: generateId(),
        batchId: context.batchId,
        fileName: context.fileName,
        modelUsed: model,
        operationType: operation,
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
        costPerToken: pricing.perToken,
        estimatedCostUSD: calculateCost(response.usage, pricing),
        processingTimeMs: context.processingTime,
        timestamp: new Date()
    };
    
    // Store in database
    await db.tokenUsage.insert(usage);
    
    // Log to Application Insights
    appInsights.trackMetric({
        name: 'TokenUsage',
        value: usage.totalTokens,
        properties: {
            model: model,
            operation: operation,
            cost: usage.estimatedCostUSD
        }
    });
    
    // Check if approaching budget limit
    await checkBudgetThreshold(context.batchId);
}

// Model pricing (as of December 2024)
const MODEL_PRICING = {
    "claude-3.5-sonnet": {
        input: 0.003 / 1000,   // $3 per million tokens
        output: 0.015 / 1000   // $15 per million tokens
    },
    "gpt-4-turbo": {
        input: 0.01 / 1000,    // $10 per million tokens
        output: 0.03 / 1000    // $30 per million tokens
    }
};
```

**Cost Analysis Dashboard Queries:**

```sql
-- Daily token usage summary
SELECT 
    CAST(ProcessedAt AS DATE) as Date,
    ModelUsed,
    COUNT(*) as TotalFiles,
    SUM(TotalTokens) as TotalTokens,
    SUM(EstimatedCostUSD) as DailyCost
FROM TokenUsage
WHERE ProcessedAt >= DATEADD(day, -30, GETUTCDATE())
GROUP BY CAST(ProcessedAt AS DATE), ModelUsed
ORDER BY Date DESC;

-- Cost per vendor
SELECT 
    v.VendorName,
    COUNT(DISTINCT tu.BatchID) as TotalBatches,
    SUM(tu.TotalTokens) as TotalTokens,
    SUM(tu.EstimatedCostUSD) as TotalCost,
    AVG(tu.EstimatedCostUSD) as AvgCostPerFile
FROM TokenUsage tu
JOIN UploadBatches ub ON tu.BatchID = ub.BatchID
JOIN Vendors v ON ub.VendorID = v.VendorID
GROUP BY v.VendorName
ORDER BY TotalCost DESC;

-- Monthly projection
SELECT 
    DATEPART(month, GETUTCDATE()) as CurrentMonth,
    SUM(EstimatedCostUSD) as MonthToDateCost,
    SUM(EstimatedCostUSD) / DATEPART(day, GETUTCDATE()) * DAY(EOMONTH(GETUTCDATE())) as ProjectedMonthlyCost
FROM TokenUsage
WHERE DATEPART(month, ProcessedAt) = DATEPART(month, GETUTCDATE())
AND DATEPART(year, ProcessedAt) = DATEPART(year, GETUTCDATE());
```

### 4.3 Budget Alert System

```typescript
async function checkBudgetThreshold(batchId: string) {
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    
    const monthlySpend = await db.tokenUsage
        .where('processingMonth', currentMonth)
        .where('processingYear', currentYear)
        .sum('estimatedCostUSD');
    
    const MONTHLY_BUDGET = 500; // $500 monthly budget
    const ALERT_THRESHOLD = 0.8; // Alert at 80%
    
    if (monthlySpend >= MONTHLY_BUDGET * ALERT_THRESHOLD) {
        await sendAlert({
            severity: monthlySpend >= MONTHLY_BUDGET ? 'Critical' : 'Warning',
            message: `Token budget at ${(monthlySpend / MONTHLY_BUDGET * 100).toFixed(0)}%`,
            currentSpend: monthlySpend,
            budget: MONTHLY_BUDGET,
            daysRemaining: getDaysRemainingInMonth()
        });
    }
}
```

---

## Phase 5: User Interfaces (Days 15-25)

### 3.1 UI Components Overview

| Component | Purpose | Priority |
|-----------|---------|----------|
| **Vendor Management** | Add/edit vendors, view history | High |
| **CSV Template Upload** | Upload pre-formatted CSVs | High |
| **Document Upload** | Upload PDFs/catalogs for AI processing | High |
| **Field Mapping Review** | Review/confirm AI field mappings | Critical |
| **Product Staging Review** | Browse/approve/reject staged products | Critical |
| **Batch Status Dashboard** | Monitor processing status | Medium |
| **Outreach Tracker** | Manage vendor communications | Low |

### 3.2 Field Mapping Review UI (Critical)

This is the most important UI component - where users confirm AI suggestions.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  FIELD MAPPING REVIEW                                               [X Close]│
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Vendor: ACE Hardware                    File: ace_pricelist_2025Q4.pdf     │
│  Uploaded: Dec 20, 2025 10:30 AM         Records Found: 1,247               │
│  Overall Confidence: 87%                 Status: ⏳ Awaiting Review          │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  FIELD MAPPINGS                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  Source Column          →    Target Field           Confidence   Action     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ "Item #"             →    [SKU            ▼]      ✅ 98%     [Edit]  │   │
│  │ "Product Name"       →    [Description    ▼]      ✅ 96%     [Edit]  │   │
│  │ "Dealer Cost"        →    [Cost           ▼]      ✅ 94%     [Edit]  │   │
│  │ "List Price"         →    [MSRP           ▼]      ✅ 92%     [Edit]  │   │
│  │ "Min Qty"            →    [MOQ            ▼]      ⚠️ 78%     [Edit]  │   │
│  │ "Category Code"      →    [Category       ▼]      ⚠️ 72%     [Edit]  │   │
│  │ "UPC-A"              →    [UPC            ▼]      ✅ 99%     [Edit]  │   │
│  │ "Pack Size"          →    [PackSize       ▼]      ✅ 88%     [Edit]  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ⚠️ UNMAPPED SOURCE FIELDS (3)                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ "Weight (lbs)"       →    [-- Select --   ▼]               [Map]    │   │
│  │ "Color"              →    [-- Select --   ▼]               [Map]    │   │
│  │ "Brand"              →    [-- Select --   ▼]               [Map]    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  DATA PREVIEW (First 5 rows)                                   [Show All ▶] │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ SKU      │ Description        │ Cost   │ MSRP   │ MOQ │ Category   │   │
│  ├──────────┼────────────────────┼────────┼────────┼─────┼────────────│   │
│  │ ACE-1001 │ Hammer Claw 16oz   │ $12.50 │ $24.99 │ 6   │ Hand Tools │   │
│  │ ACE-1002 │ Screwdriver Set    │ $18.75 │ $34.99 │ 6   │ Hand Tools │   │
│  │ ACE-1003 │ Tape Measure 25ft  │ $8.25  │ $15.99 │ 12  │ Measuring  │   │
│  │ ACE-1004 │ Level 24"          │ $15.00 │ $29.99 │ 6   │ Measuring  │   │
│  │ ACE-1005 │ Utility Knife      │ $6.50  │ $12.99 │ 12  │ Cutting    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ☑️ Save this mapping as template for future ACE Hardware uploads           │
│                                                                              │
│  [Cancel]          [Save & Review Products]          [Confirm & Auto-Approve]│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Product Staging Review UI

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  STAGED PRODUCTS - Pending Approval                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Filters:  Vendor [All Vendors     ▼]  Status [Pending ▼]  Confidence [All ▼]│
│            Date Range [Last 7 Days ▼]  Search [________________] [🔍]       │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Showing 1,247 products from 3 batches                    [Select All ☐]    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │☐│ SKU      │ Description      │ Cost   │ MSRP   │ Vendor  │Conf│ Act│   │
│  ├─┼──────────┼──────────────────┼────────┼────────┼─────────┼────┼────│   │
│  │☐│ ACE-1001 │ Hammer Claw 16oz │ $12.50 │ $24.99 │ ACE HW  │ 94%│ ⋮  │   │
│  │☐│ ACE-1002 │ Screwdriver Set  │ $18.75 │ $34.99 │ ACE HW  │ 94%│ ⋮  │   │
│  │☑│ ACE-1003 │ Tape Measure 25ft│ ⚠️$0.00│ $15.99 │ ACE HW  │ 67%│ ⋮  │   │
│  │☐│ DEW-5001 │ Drill 20V        │ $89.00 │$149.99 │ DeWalt  │ 98%│ ⋮  │   │
│  │☐│ DEW-5002 │ Battery Pack     │ $45.00 │ $79.99 │ DeWalt  │ 98%│ ⋮  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ⚠️ 3 products flagged for review (low confidence or data issues)           │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Bulk Actions:  [Approve Selected (1,244)]  [Reject Selected]  [Export CSV] │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.4 React Component Structure

```
src/
├── components/
│   ├── common/
│   │   ├── DataTable.tsx
│   │   ├── FileUploader.tsx
│   │   ├── ConfidenceBadge.tsx
│   │   └── StatusChip.tsx
│   │
│   ├── vendors/
│   │   ├── VendorList.tsx
│   │   ├── VendorDetail.tsx
│   │   ├── VendorForm.tsx
│   │   └── VendorOutreachLog.tsx
│   │
│   ├── upload/
│   │   ├── CSVTemplateUpload.tsx
│   │   ├── DocumentUpload.tsx
│   │   └── UploadProgress.tsx
│   │
│   ├── mapping/
│   │   ├── FieldMappingReview.tsx      # Critical component
│   │   ├── MappingRow.tsx
│   │   ├── FieldSelector.tsx
│   │   └── DataPreviewTable.tsx
│   │
│   ├── staging/
│   │   ├── StagingReview.tsx           # Critical component
│   │   ├── ProductRow.tsx
│   │   ├── ProductEditModal.tsx
│   │   └── BulkActions.tsx
│   │
│   └── dashboard/
│       ├── BatchStatusDashboard.tsx
│       ├── ProcessingMetrics.tsx
│       └── RecentActivity.tsx
│
├── pages/
│   ├── VendorsPage.tsx
│   ├── UploadPage.tsx
│   ├── MappingReviewPage.tsx
│   ├── StagingReviewPage.tsx
│   └── DashboardPage.tsx
│
├── hooks/
│   ├── useVendors.ts
│   ├── useBatches.ts
│   ├── useProducts.ts
│   └── useMapping.ts
│
├── services/
│   ├── api.ts
│   ├── vendorService.ts
│   ├── uploadService.ts
│   └── productService.ts
│
└── types/
    ├── vendor.ts
    ├── product.ts
    ├── mapping.ts
    └── batch.ts
```

---

## Phase 4: Data Factory Orchestration (Days 20-28)

### 4.1 ADF Pipeline: Main Ingestion Flow

```json
{
    "name": "PL_VendorDataIngestion",
    "properties": {
        "activities": [
            {
                "name": "CopyRawToDataLake",
                "type": "Copy",
                "inputs": [{"referenceName": "DS_BlobUpload"}],
                "outputs": [{"referenceName": "DS_DataLakeRaw"}],
                "typeProperties": {
                    "source": {"type": "BlobSource"},
                    "sink": {"type": "AzureDataLakeStoreGen2Sink"}
                }
            },
            {
                "name": "TriggerAIProcessing",
                "type": "AzureFunctionActivity",
                "dependsOn": [{"activity": "CopyRawToDataLake"}],
                "typeProperties": {
                    "functionName": "DocumentProcessor",
                    "method": "POST",
                    "body": {
                        "vendorId": "@pipeline().parameters.vendorId",
                        "fileName": "@pipeline().parameters.fileName",
                        "filePath": "@activity('CopyRawToDataLake').output.dataWritten"
                    }
                }
            },
            {
                "name": "WaitForApproval",
                "type": "Until",
                "dependsOn": [{"activity": "TriggerAIProcessing"}],
                "typeProperties": {
                    "expression": {
                        "value": "@equals(activity('CheckBatchStatus').output.status, 'Approved')"
                    },
                    "timeout": "7.00:00:00",
                    "activities": [
                        {
                            "name": "CheckBatchStatus",
                            "type": "Lookup",
                            "typeProperties": {
                                "source": {
                                    "type": "AzureSqlSource",
                                    "sqlReaderQuery": "SELECT Status FROM UploadBatches WHERE BatchID = '@{pipeline().parameters.batchId}'"
                                }
                            }
                        },
                        {
                            "name": "Wait15Minutes",
                            "type": "Wait",
                            "typeProperties": {"waitTimeInSeconds": 900}
                        }
                    ]
                }
            },
            {
                "name": "MoveToProduction",
                "type": "SqlServerStoredProcedure",
                "dependsOn": [{"activity": "WaitForApproval"}],
                "typeProperties": {
                    "storedProcedureName": "sp_ApproveAndMoveProducts",
                    "storedProcedureParameters": {
                        "BatchID": {"value": "@pipeline().parameters.batchId"}
                    }
                }
            },
            {
                "name": "ArchiveFiles",
                "type": "Copy",
                "dependsOn": [{"activity": "MoveToProduction"}],
                "typeProperties": {
                    "source": {"type": "AzureDataLakeStoreGen2Source"},
                    "sink": {"type": "AzureDataLakeStoreGen2Sink"}
                }
            }
        ],
        "parameters": {
            "vendorId": {"type": "String"},
            "fileName": {"type": "String"},
            "batchId": {"type": "String"}
        }
    }
}
```

### 4.2 Stored Procedure: Approve and Move Products

```sql
CREATE PROCEDURE sp_ApproveAndMoveProducts
    @BatchID UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    
    BEGIN TRANSACTION;
    
    BEGIN TRY
        -- Move approved products from Staging to Production
        INSERT INTO Products (
            ProductID, VendorID, SKU, Description, Cost, MAP, MSRP,
            Category, SubCategory, MOQ, LeadTimeDays, FreightTerms,
            UPC, Weight, PackSize, AdditionalAttributes, SourceStagingID,
            CreatedAt
        )
        SELECT 
            NEWID(), VendorID, SKU, Description, Cost, MAP, MSRP,
            Category, SubCategory, MOQ, LeadTimeDays, FreightTerms,
            UPC, Weight, PackSize, AdditionalAttributes, StagingID,
            GETUTCDATE()
        FROM Products_Staging
        WHERE BatchID = @BatchID
          AND Status = 'Approved';
        
        -- Update batch statistics
        UPDATE UploadBatches
        SET ApprovedRecords = (
                SELECT COUNT(*) FROM Products_Staging 
                WHERE BatchID = @BatchID AND Status = 'Approved'
            ),
            RejectedRecords = (
                SELECT COUNT(*) FROM Products_Staging 
                WHERE BatchID = @BatchID AND Status = 'Rejected'
            ),
            Status = 'Completed'
        WHERE BatchID = @BatchID;
        
        -- Mark staging records as processed
        UPDATE Products_Staging
        SET Status = 'Processed'
        WHERE BatchID = @BatchID AND Status = 'Approved';
        
        COMMIT TRANSACTION;
        
        SELECT 'Success' AS Result, @@ROWCOUNT AS RecordsProcessed;
        
    END TRY
    BEGIN CATCH
        ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
```

### 4.3 Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DATA FLOW OVERVIEW                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  USER UPLOAD                                                                 │
│      │                                                                       │
│      ▼                                                                       │
│  ┌─────────┐     ┌─────────────────┐     ┌──────────────────────────────┐   │
│  │ Blob    │────▶│ Data Lake Gen2  │────▶│ Azure Function               │   │
│  │ Storage │     │ /raw/{vendor}/  │     │ (Document Processor)         │   │
│  └─────────┘     └─────────────────┘     └──────────────────────────────┘   │
│                                                   │                          │
│                                    ┌──────────────┴──────────────┐          │
│                                    │                             │          │
│                                    ▼                             ▼          │
│                          ┌─────────────────┐          ┌─────────────────┐   │
│                          │ Document        │          │ LLM (Claude/    │   │
│                          │ Intelligence    │          │ OpenAI)         │   │
│                          │ (OCR)           │          │ (Schema Mapping)│   │
│                          └────────┬────────┘          └────────┬────────┘   │
│                                   │                             │           │
│                                   ▼                             ▼           │
│                          ┌─────────────────┐          ┌─────────────────┐   │
│                          │ Data Lake Gen2  │          │ Data Lake Gen2  │   │
│                          │ /raw/.._ext.json│          │ /mapped/..json  │   │
│                          └─────────────────┘          └────────┬────────┘   │
│                                                                 │           │
│                                                                 ▼           │
│                                                        ┌─────────────────┐  │
│                                                        │ SQL Server      │  │
│                                                        │ Products_Staging│  │
│                                                        └────────┬────────┘  │
│                                                                 │           │
│                                                                 ▼           │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     USER APPROVAL (UI)                               │   │
│  │   • Review field mappings                                            │   │
│  │   • Preview products                                                 │   │
│  │   • Approve / Reject                                                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                 │           │
│                               ┌──────────────┬──────────────────┤           │
│                               │              │                  │           │
│                               ▼              ▼                  ▼           │
│                     ┌──────────────┐  ┌────────────┐  ┌─────────────────┐   │
│                     │ SQL Server   │  │ Data Lake  │  │ Data Lake Gen2  │   │
│                     │ Products     │  │ /templates/│  │ /approved/      │   │
│                     │ (Production) │  │ (Mapping)  │  │ /archive/       │   │
│                     └──────────────┘  └────────────┘  └─────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 5: Monitoring & Quality (Days 25-30)

### 5.1 Application Insights Queries

```kusto
// Processing success rate by vendor
customEvents
| where name == "DocumentProcessed"
| summarize 
    TotalProcessed = count(),
    Successful = countif(customDimensions.status == "Success"),
    Failed = countif(customDimensions.status == "Failed")
    by tostring(customDimensions.vendorId)
| extend SuccessRate = round(100.0 * Successful / TotalProcessed, 2)
| order by TotalProcessed desc

// Average confidence scores over time
customMetrics
| where name == "AIConfidenceScore"
| summarize AvgConfidence = avg(value) by bin(timestamp, 1d)
| render timechart

// Processing time distribution
customMetrics
| where name == "ProcessingTimeMs"
| summarize 
    P50 = percentile(value, 50),
    P90 = percentile(value, 90),
    P99 = percentile(value, 99)
    by bin(timestamp, 1h)
| render timechart
```

### 5.2 Alerting Rules

| Alert | Condition | Severity | Action |
|-------|-----------|----------|--------|
| Processing Failures | >5 failures in 1 hour | High | Email team, create ticket |
| Low Confidence | Avg confidence <70% for batch | Medium | Flag for manual review |
| Queue Backup | >100 pending files | Medium | Scale up Functions |
| API Errors | Error rate >5% | High | Page on-call |
| Storage Quota | >80% capacity | Low | Alert to add storage |

### 5.3 Dashboard Metrics

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  VENDOR DATA PROCESSING DASHBOARD                         Last 24 Hours     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Files       │  │  Products    │  │  Avg         │  │  Approval    │     │
│  │  Processed   │  │  Staged      │  │  Confidence  │  │  Rate        │     │
│  │              │  │              │  │              │  │              │     │
│  │    47        │  │   12,847     │  │    89%       │  │    94%       │     │
│  │  ↑ 12%       │  │  ↑ 2,340     │  │  ↑ 3%       │  │  ↓ 2%        │     │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                                              │
│  PROCESSING STATUS                      CONFIDENCE DISTRIBUTION             │
│  ┌─────────────────────────────┐       ┌─────────────────────────────┐      │
│  │ ████████████████░░░ 82%     │       │ >95%  ████████████  67%     │      │
│  │ Completed                    │       │ 85-95 ████████     22%     │      │
│  │                              │       │ 70-85 ████          8%     │      │
│  │ ████░░░░░░░░░░░░░░ 15%     │       │ <70%  ██            3%     │      │
│  │ Pending Review               │       └─────────────────────────────┘      │
│  │                              │                                            │
│  │ █░░░░░░░░░░░░░░░░░  3%     │       TOP VENDORS (Products Added)         │
│  │ Failed                       │       ┌─────────────────────────────┐      │
│  └─────────────────────────────┘       │ 1. ACE Hardware     4,521   │      │
│                                         │ 2. DeWalt           3,892   │      │
│  RECENT ACTIVITY                        │ 3. Stanley          2,104   │      │
│  ─────────────────                      │ 4. Milwaukee        1,847   │      │
│  10:45 AM  ACE-pricelist.pdf ✓         │ 5. Craftsman          483   │      │
│  10:32 AM  dewalt-catalog.pdf ✓        └─────────────────────────────┘      │
│  10:15 AM  stanley-q4.xlsx ⏳                                                │
│  09:58 AM  milwaukee.pdf ✓                                                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Timeline

| Week | Dates | Focus Areas | Key Deliverables |
|------|-------|-------------|------------------|
| **Week 1** | Dec 15-21 | Foundation & Infrastructure | Azure resources provisioned, database schema finalized, API endpoints defined, authentication configured |
| **Week 2** | Dec 22-28 | AI Pipeline Development | Document Intelligence integration, LLM mapping functional, JSON outputs validated, template storage working |
| **Week 3** | Dec 29 - Jan 4 | User Interface Development | Upload UI complete, field mapping review UI functional, staging review UI complete, basic dashboard |
| **Week 4** | Jan 5-11 | Integration & Testing | ADF pipelines configured, end-to-end flow tested, sample vendor files processed successfully |
| **Week 5** | Jan 12-15 | Polish & Handoff | Bug fixes, documentation complete, user training, production deployment |

### Detailed Week 1 Tasks

- [ ] Create Azure resource group and provision services
- [ ] Configure networking and security (VNets, Key Vault access)
- [ ] Set up Azure AD authentication
- [ ] Create SQL database and execute schema scripts
- [ ] Configure Data Lake folder structure
- [ ] Set up Application Insights
- [ ] Create API Management or Function App base
- [ ] Document architecture decisions

### Detailed Week 2 Tasks

- [ ] Integrate Azure Document Intelligence
- [ ] Build document extraction function
- [ ] Implement LLM mapping with Claude/OpenAI
- [ ] Create mapping template storage system
- [ ] Build confidence scoring logic
- [ ] Test with 10+ sample vendor files
- [ ] Optimize prompt engineering
- [ ] Handle edge cases (multi-page, multi-table)

### Detailed Week 3 Tasks

- [ ] Build React application shell
- [ ] Implement file upload components
- [ ] Create field mapping review interface
- [ ] Build product staging review table
- [ ] Implement bulk approval actions
- [ ] Add filtering and search
- [ ] Create vendor management screens
- [ ] Basic responsive design

### Detailed Week 4 Tasks

- [ ] Configure ADF pipelines
- [ ] Test full ingestion flow
- [ ] Process 50+ sample files end-to-end
- [ ] Load testing with large files
- [ ] Fix integration issues
- [ ] Implement error handling
- [ ] Set up monitoring alerts
- [ ] Performance optimization

### Detailed Week 5 Tasks

- [ ] Fix remaining bugs
- [ ] Complete user documentation
- [ ] Create admin guide
- [ ] Record training videos
- [ ] Deploy to production
- [ ] Smoke test production environment
- [ ] Handoff to operations team
- [ ] Post-implementation review

---

## Budget Allocation

### Cost Breakdown by Component (Updated Post-Feedback)

| Component | Estimated Hours | Hourly Rate | Cost |
|-----------|-----------------|-------------|------|
| **Phase 0: Golden Dataset Creation** | 10 hrs | $50/hr | $500 |
| **Phase 1: Data Ingestion Layer** | 18 hrs | $50/hr | $900 |
| **Phase 2: AI/OCR Pipeline** | 25 hrs | $50/hr | $1,250 |
| **Phase 3: Testing Framework** | 20 hrs | $50/hr | $1,000 |
| **Phase 4: Approval APIs & Token Tracking** | 18 hrs | $50/hr | $900 |
| **Phase 5: Integration & Hardening** | 20 hrs | $50/hr | $1,000 |
| **Phase 6: Documentation & Handoff** | 12 hrs | $50/hr | $600 |
| **Contingency** | 10 hrs | $50/hr | $500 |
| **Azure Setup & Integration** | 7 hrs | $50/hr | $350 |
| **TOTAL** | **140 hrs** | | **$7,000** |

**Note:** $500 reserved for contingency to handle unexpected complexity during golden dataset validation or integration issues.

### What Changed from Original Proposal

**Added:**

- Golden dataset creation and validation framework (+$800)
- Automated test suite with CI/CD gates (+$600)
- Test tracking database tables (+$200)
- Token usage tracking and cost monitoring (+$400)
- Azure integration and deployment (+$350)

**Removed:**

- Complex approval UI with visual components (-$800)
- SST infrastructure provisioning work (-$500)
- Data Factory orchestration complexity (-$250)

**Net Impact:** Scope adjusted to focus on production robustness rather than UI polish. Budget remains at $7,500 with $500 contingency.

### Azure Monthly Running Costs (Estimated)

**Client's Existing Infrastructure (No Additional Cost):**

- Azure SQL Server (already exists)
- Azure Functions Plan (already exists)
- Azure Monitor/Log Analytics (already exists)

**New Services Required:**

| Service | SKU | Est. Monthly Cost |
|---------|-----|-------------------|
| Azure Document Intelligence | S0 tier | $50-100 |
| Blob Storage (additional usage) | Hot tier | $5-10 |
| **Additional Monthly Cost** | | **$55-110/month** |

**LLM API Costs (Variable):**

- Claude 3.5 Sonnet: ~$0.10-0.50 per document (depending on size)
- Estimated monthly: $100-500 depending on volume

**Total Estimated Ongoing:** $155-610/month depending on processing volume

---

## Tech Stack

### Backend

| Layer | Technology | Notes |
|-------|------------|-------|
| **Runtime** | Node.js 20 + TypeScript | Azure Functions |
| **API** | Azure Functions HTTP Triggers | Serverless compute |
| **OCR** | Azure AI Document Intelligence | Prebuilt-layout model |
| **LLM** | Claude 3.5 Sonnet (or GPT-4 Turbo) | Straight-shot prompting |
| **Database** | Azure SQL Server (client's existing) | Add new database/schema |
| **File Storage** | Azure Blob Storage (client's existing) | Bronze-layer retention |
| **Infrastructure** | SST v3 (client converts to Terraform) | Infrastructure as Code |
| **Auth** | JWT / Azure AD | Token-based auth |
| **Secrets** | Azure Key Vault | API keys, connections |
| **Monitoring** | Application Insights | Logging, metrics, alerts |

**Key Architectural Decisions:**

- **Straight-shot LLM prompting** (not agentic frameworks) for simplicity and predictability
- **Direct Azure development** in isolated resource group for production-like environment
- **Client's existing infrastructure** for SQL and storage

### Frontend

| Layer | Technology | Notes |
|-------|------------|-------|
| **Framework** | React 18 | SPA architecture |
| **Language** | TypeScript | Type safety |
| **Styling** | Tailwind CSS | Utility-first |
| **State** | React Query + Zustand | Server/client state |
| **Tables** | TanStack Table | Sorting, filtering |
| **Forms** | React Hook Form | Form handling |
| **UI Components** | Radix UI | Accessible primitives |

**Note:** Initial release focuses on API endpoints with simple approval mechanism. Full UI can be Phase 2 based on client preference.

### Development

| Tool | Purpose |
|------|---------|
| VS Code | Development |
| Docker Desktop | Container development |
| Azure CLI | Testing connections |
| GitHub Actions | CI/CD & golden dataset tests |
| Postman | API testing |
| Jest | Unit testing |

---

## Deployment Strategy

### Project Structure

```
profitforge-vendor-processing/
├── sst.config.ts
├── .env.example
├── infra/
│   ├── functions.ts
│   ├── database.ts
│   ├── storage.ts
│   └── keyVault.ts
├── packages/
│   ├── functions/
│   │   └── src/
│   ├── core/
│   │   └── src/
│   └── frontend/
│       └── src/
└── terraform/ (for client's future conversion)
```

### Azure Resources Deployed

| Resource | Purpose | Location |
|----------|---------|----------|
| **Azure Functions** | API & processing endpoints | Client's existing plan |
| **SQL Database** | VendorData schema | Client's existing SQL Server |
| **Blob Storage** | Raw/processed files | Client's existing storage account |

### Environment Variables Required

```bash
# Azure SQL Database
SQL_SERVER=your-server.database.windows.net
SQL_DATABASE=VendorData
SQL_USERNAME=app-user
SQL_PASSWORD=<from-keyvault>

# Azure Blob Storage
AZURE_STORAGE_CONNECTION_STRING=<connection-string>
AZURE_STORAGE_CONTAINER=vendor-uploads

# Azure Cognitive Services
AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT=https://your-region.api.cognitive.microsoft.com/
AZURE_DOCUMENT_INTELLIGENCE_KEY=<api-key>

# LLM API
ANTHROPIC_API_KEY=<api-key>
# OR
OPENAI_API_KEY=<api-key>

# Application Insights
APPINSIGHTS_CONNECTION_STRING=<connection-string>

# App Configuration
NODE_ENV=production
LOG_LEVEL=info
```

### Deployment Process

**Local Development:**

```bash
# Clone repository
git clone <repo-url>
cd profitforge-vendor-processing

# Copy environment template
cp .env.example .env
# Edit .env with development credentials

# Start all containers
docker-compose up -d

# View logs
docker-compose logs -f

# Run tests
docker-compose run api npm test
```

**Production Deployment (Client's Terraform):**

```hcl
# Example Terraform configuration client would use
resource "azurerm_container_group" "vendor_processing" {
  name                = "vendor-processing"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  os_type             = "Linux"
  
  container {
    name   = "api"
    image  = "profitforge/vendor-api:latest"
    cpu    = "1"
    memory = "2"
    
    ports {
      port     = 3000
      protocol = "TCP"
    }
    
    environment_variables = {
      NODE_ENV = "production"
    }
    
    secure_environment_variables = {
      SQL_PASSWORD = azurerm_key_vault_secret.sql_password.value
      ANTHROPIC_API_KEY = azurerm_key_vault_secret.anthropic_key.value
    }
  }
  
  container {
    name   = "processor"
    image  = "profitforge/vendor-processor:latest"
    cpu    = "2"
    memory = "4"
  }
}
```

### CI/CD Pipeline

```yaml
# .github/workflows/deploy.yml
name: Build and Test

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run unit tests
        run: npm test
      
      - name: Run golden dataset tests
        run: npm run test:golden-dataset
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      
      - name: Check quality gates
        run: npm run check:quality-gates
  
  build:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v3
      
      - name: Build Docker images
        run: |
          docker-compose build
      
      - name: Push to registry
        run: |
          docker push profitforge/vendor-api:latest
          docker push profitforge/vendor-processor:latest
          docker push profitforge/vendor-frontend:latest
```

### Handoff Deliverables

**What Client Receives:**

1. **Working Azure Resources:**
   - Deployed Azure Functions with all endpoints
   - Database schema installed and tested
   - Blob storage configured with folder structure
   - Application Insights configured

2. **Source Code Repository:**
   - Complete TypeScript codebase
   - SST infrastructure definitions
   - Golden dataset test suite
   - Environment variable templates

3. **Database Scripts:**
   - Schema creation SQL
   - Stored procedures
   - Initial data seeding
   - Migration scripts for future updates

4. **Documentation:**
   - Architecture diagrams
   - API documentation (OpenAPI/Swagger)
   - Deployment and operations guide
   - Troubleshooting guide

5. **Terraform Conversion Guide:**
   - Mapping of SST resources to Terraform equivalents
   - Example Terraform configurations
   - Migration checklist

**Already Completed:**

1. ✅ Azure Functions deployed and operational
2. ✅ Database schema created
3. ✅ Integration with existing SQL Server and Storage
4. ✅ Application Insights logging configured
5. ✅ All API endpoints tested and documented

---

## Success Criteria

### Functional Requirements (Updated)

- [x] Users can upload CSV templates and have them validated instantly
- [x] Users can upload PDFs/catalogs and have them processed by AI
- [x] AI extracts products with >85% average confidence
- [x] All results staged for manual approval (no auto-approval initially)
- [x] Mapping templates are saved and reused for repeat vendors
- [x] Simple approval API endpoints (batch and individual approval)
- [x] Approved products moved to production database
- [x] All raw and processed files retained in blob storage (bronze-layer)
- [x] Token usage tracked and logged for cost monitoring
- [x] Golden dataset test suite with automated quality gates

### Non-Functional Requirements

- [x] Processing time: <2 minutes for files under 10MB
- [x] System uptime: >99% availability (via container orchestration)
- [x] API response time: <500ms for standard queries
- [x] Support files up to 100MB
- [x] Handle 1,000+ products per batch
- [x] Containerized deployment for easy integration with client's Terraform
- [x] Comprehensive logging to Azure Monitor

### Quality Metrics

- [x] Accurate data collected from each vendor
- [x] Data accuracy >95% validated against golden dataset
- [x] No missing required fields (SKU, Description, Cost)
- [x] Test suite prevents deployment if quality drops
- [x] Model drift detection and alerting
- [x] Complete audit trail of all processing
- [x] Clear documentation for all components
- [x] Smooth handoff with container images and deployment guides

---

## Appendix

### A. CSV Template

```csv
SKU,Description,Cost,MAP,MSRP,Category,SubCategory,MOQ,LeadTimeDays,FreightTerms,UPC,Weight,PackSize
```

Download template: [vendor_product_template.csv]

### B. API Error Codes

| Code | Message | Resolution |
|------|---------|------------|
| 400 | Invalid file format | Upload CSV, PDF, XLSX, or XLS |
| 400 | Missing required fields | Ensure SKU, Description, Cost present |
| 401 | Unauthorized | Check API key or login |
| 404 | Vendor not found | Create vendor first |
| 413 | File too large | Max 100MB per file |
| 422 | Validation failed | Check error details |
| 500 | Processing error | Retry or contact support |

### C. Confidence Score Guide

| Score | Meaning | Action |
|-------|---------|--------|
| 95-100% | High confidence | Auto-approve available |
| 85-94% | Good confidence | Standard review |
| 70-84% | Medium confidence | Detailed review recommended |
| 50-69% | Low confidence | Manual verification required |
| <50% | Very low | Reject, use CSV template |

### D. Glossary

| Term | Definition |
|------|------------|
| **SKU** | Stock Keeping Unit - unique product identifier |
| **MAP** | Minimum Advertised Price |
| **MSRP** | Manufacturer's Suggested Retail Price |
| **MOQ** | Minimum Order Quantity |
| **Staging** | Temporary holding area before approval |
| **Mapping Template** | Saved field mappings for repeat vendors |
| **Confidence Score** | AI's certainty about data extraction (0-100%) |
| **Batch** | Group of products from single file upload |

### E. Contact & Support

- **Project Owner:** [Name]
- **Technical Lead:** [Name]
- **Emergency Contact:** [Phone/Email]

---

*Document Version: 1.0*  
*Last Updated: December 2025*  
*Author: AI Implementation Team*
