# AI Data Collection & Transformation System
## Implementation Plan

**Project:** AI-Ready Retail Product Database  
**Budget:** $4,000 - $8,000  
**Timeline:** December 15, 2025 - January 15, 2026  
**Type:** Contractor Design Brief

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Architecture Overview](#system-architecture-overview)
3. [Phase 0: Foundation Setup](#phase-0-foundation-setup-days-1-3)
4. [Phase 1: Data Ingestion Layer](#phase-1-data-ingestion-layer-days-4-10)
5. [Phase 2: AI OCR & Mapping Engine](#phase-2-ai-ocr--mapping-engine-days-11-20)
6. [Phase 3: User Interfaces](#phase-3-user-interfaces-days-15-25)
7. [Phase 4: Data Factory Orchestration](#phase-4-data-factory-orchestration-days-20-28)
8. [Phase 5: Monitoring & Quality](#phase-5-monitoring--quality-days-25-30)
9. [Implementation Timeline](#implementation-timeline)
10. [Budget Allocation](#budget-allocation)
11. [Tech Stack](#tech-stack)
12. [Success Criteria](#success-criteria)
13. [Appendix](#appendix)

---

## Executive Summary

### Project Goals

1. **Acquire** complete and accurate product lists and vendor terms from manufacturers/distributors
2. **Standardize** and transform all received documents into a consistent data structure
3. **Prepare** cleaned, structured data ready for import into internal database/AI pipeline
4. **Build** a standing product that can process vendor data on an ongoing basis (not a one-off operation)

### Key Requirements

- Semi-automated to fully automated pipeline
- AI-powered document extraction (PDFs, catalogs, spreadsheets)
- User confirmation UI for field mapping
- Vendor mapping memory (learn from first upload, reuse for future)
- Azure-based infrastructure
- Confidence scoring for AI-processed data

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

## Phase 0: Foundation Setup (Days 1-3)

### 0.1 Azure Infrastructure Provisioning

| Component | Purpose | SKU/Tier Recommendation |
|-----------|---------|------------------------|
| **Azure Data Lake Gen2** | Store all raw files (PDFs, CSVs, catalogs) + JSON outputs | Standard LRS |
| **Azure SQL Database** | Structured product data (final destination) | Standard S1 |
| **Azure Blob Storage** | Working storage for uploads and processed files | Hot tier |
| **Azure Key Vault** | Store API keys (OpenAI/Claude), connection strings | Standard |
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

## Phase 3: User Interfaces (Days 15-25)

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

### Cost Breakdown by Component

| Component | Estimated Hours | Hourly Rate | Cost Range |
|-----------|-----------------|-------------|------------|
| **Phase 0: Infrastructure** | 8-12 hrs | $50/hr | $400-600 |
| **Phase 1: API Development** | 15-20 hrs | $50/hr | $750-1,000 |
| **Phase 2: AI/OCR Pipeline** | 20-30 hrs | $50/hr | $1,000-1,500 |
| **Phase 3: User Interfaces** | 25-35 hrs | $50/hr | $1,250-1,750 |
| **Phase 4: ADF Pipelines** | 10-15 hrs | $50/hr | $500-750 |
| **Phase 5: Testing & Docs** | 10-15 hrs | $50/hr | $500-750 |
| **TOTAL** | **88-127 hrs** | | **$4,400-$6,350** |

### Azure Monthly Running Costs (Estimated)

| Service | SKU | Est. Monthly Cost |
|---------|-----|-------------------|
| Azure SQL Database | Standard S1 | $30 |
| Data Lake Gen2 | 100GB storage | $5 |
| Blob Storage | 50GB hot | $2 |
| Azure Functions | Consumption | $10-50 |
| Document Intelligence | S0 tier | $50-100 |
| Application Insights | Basic | $5 |
| **Total** | | **$100-200/month** |

### Budget Scenarios

**Lower End ($4,000-5,000):**
- Semi-automated approach
- Basic UI with essential features only
- Limited vendor template variety
- Manual review for all uploads

**Mid Range ($5,500-6,500):**
- Full automation pipeline
- Complete UI with all features
- Vendor mapping memory system
- Auto-approve high-confidence batches

**Higher End ($7,000-8,000):**
- Everything above, plus:
- Advanced error handling
- Comprehensive testing
- Extended documentation
- Training and support hours

---

## Tech Stack

### Backend

| Layer | Technology | Notes |
|-------|------------|-------|
| **Runtime** | Azure Functions (Python 3.11) | Serverless, auto-scale |
| **API** | FastAPI / Azure Functions HTTP | RESTful endpoints |
| **OCR** | Azure AI Document Intelligence | Prebuilt-layout model |
| **LLM** | Claude API (Anthropic) | Schema mapping |
| **Database** | Azure SQL Server | Structured storage |
| **File Storage** | Azure Data Lake Gen2 | JSON, raw files |
| **Orchestration** | Azure Data Factory | Pipeline automation |
| **Auth** | Azure AD B2C / JWT | Token-based auth |
| **Secrets** | Azure Key Vault | API keys, connections |
| **Monitoring** | Application Insights | Logging, metrics |

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

### Development

| Tool | Purpose |
|------|---------|
| VS Code | Development |
| Azure CLI | Deployment |
| Terraform | Infrastructure as code (optional) |
| GitHub Actions | CI/CD |
| Postman | API testing |

---

## Success Criteria

### Functional Requirements

- [ ] Users can upload CSV templates and have them validated instantly
- [ ] Users can upload PDFs/catalogs and have them processed by AI
- [ ] AI extracts products with >85% average confidence
- [ ] Users can review and correct field mappings via UI
- [ ] Mapping templates are saved and reused for repeat vendors
- [ ] Users can approve/reject products individually or in bulk
- [ ] Approved products are moved to production database
- [ ] All raw and processed files are retained in Data Lake

### Non-Functional Requirements

- [ ] Processing time: <2 minutes for files under 10MB
- [ ] System uptime: >99% availability
- [ ] API response time: <500ms for standard queries
- [ ] Support files up to 100MB
- [ ] Handle 1000+ products per batch

### Quality Metrics

- [ ] Accurate data collected from each vendor
- [ ] CSV files delivered in exact required structure
- [ ] No missing required fields (SKU, Description, Cost)
- [ ] Data accuracy >95% for AI-processed records
- [ ] Clear documentation for all components
- [ ] Smooth handoff to operations team

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
