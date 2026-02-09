-- =============================================
-- VVOCR SCHEMA - Document Processing POC
-- Matches client's expected schema for isolated POC work
-- Last updated: 2026-02-07 (removed calculated fields and moved large data to blob)
-- =============================================

-- Create schema if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'vvocr')
BEGIN
    EXEC('CREATE SCHEMA vvocr');
END
GO

-- =============================================
-- 1. Document Processing Results
-- Main table for storing OCR/AI processing outputs
-- Note: Large data (extracted text, structured data) stored in blob storage
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'document_processing_results' AND schema_id = SCHEMA_ID('vvocr'))
BEGIN
    CREATE TABLE vvocr.document_processing_results (
        result_id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        
        -- Document metadata
        document_name NVARCHAR(500) NOT NULL,
        document_path NVARCHAR(1000),
        document_size_bytes BIGINT,
        document_type NVARCHAR(50), -- PDF, Excel, CSV, etc.
        uploaded_at DATETIME2 DEFAULT GETUTCDATE(),
        
        -- Processing status
        processing_status NVARCHAR(50) DEFAULT 'pending', -- pending, ocr_complete, completed, failed
        processing_started_at DATETIME2 NULL,
        processing_completed_at DATETIME2 NULL,
        
        -- Document Intelligence (Azure Form Recognizer) results
        -- Note: Large OCR data (extracted_text, structured_data) stored in blob at <vendor_name>/ocr.json
        doc_intel_confidence_score DECIMAL(5,4) NULL,
        doc_intel_prompt_used NVARCHAR(MAX) NULL, -- Prompt used for schema inspection (future use)
        doc_intel_cost_usd DECIMAL(10,6) NULL,
        
        -- AI Model results (GPT-4o, Llama, Mistral, etc.)
        ai_model_used NVARCHAR(100) NULL, -- e.g., 'gpt-4o', 'llama-3-1-405b'
        ai_mapping_result NVARCHAR(MAX) NULL, -- Product mapping JSON result
        ai_prompt_used NVARCHAR(MAX) NULL, -- Exact prompt sent to LLM
        ai_confidence_score DECIMAL(5,2) NULL, -- Overall confidence score (0-100)
        ai_completeness_score DECIMAL(5,2) NULL, -- Data completeness score (0-100)
        ai_prompt_tokens INT NULL,
        ai_completion_tokens INT NULL,
        ai_model_cost_usd DECIMAL(10,6) NULL,
        
        -- Validation
        requires_manual_review BIT DEFAULT 0,
        manual_review_reason NVARCHAR(500) NULL,
        reviewed_by NVARCHAR(100) NULL,
        reviewed_at DATETIME2 NULL,
        
        -- Vendor information
        vendor_name NVARCHAR(200) NOT NULL,
        
        -- Export status
        export_status NVARCHAR(50) DEFAULT 'not_exported', -- not_exported, confirmed, exported, rejected
        exported_at DATETIME2 NULL,
        
        -- Metadata
        error_message NVARCHAR(MAX) NULL,
        created_at DATETIME2 DEFAULT GETUTCDATE(),
        updated_at DATETIME2 DEFAULT GETUTCDATE(),
        
        -- Indexes
        INDEX IX_document_processing_status (processing_status),
        INDEX IX_document_uploaded_at (uploaded_at),
        INDEX IX_document_requires_review (requires_manual_review),
        INDEX IX_document_vendor_name (vendor_name),
        INDEX IX_document_path (document_path)
    );
END
GO

-- =============================================
-- 6. Vendor Products (Production Table)
-- Confirmed/exported product catalog data
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'vendor_products' AND schema_id = SCHEMA_ID('vvocr'))
BEGIN
    CREATE TABLE vvocr.vendor_products (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        vendor_id NVARCHAR(100) NOT NULL,
        vendor_name NVARCHAR(200) NOT NULL,
        
        -- Product information (minimal required schema)
        product_name NVARCHAR(500),
        sku NVARCHAR(200),
        price DECIMAL(18,4),
        unit NVARCHAR(100),
        description NVARCHAR(MAX),
        
        -- Source tracking
        source_document_id UNIQUEIDENTIFIER NOT NULL,
        source_document_name NVARCHAR(500),
        
        -- Metadata
        created_at DATETIME2 DEFAULT GETUTCDATE(),
        updated_at DATETIME2 DEFAULT GETUTCDATE(),
        
        FOREIGN KEY (source_document_id) REFERENCES vvocr.document_processing_results(result_id),
        INDEX IX_vendor_products_vendor_id (vendor_id),
        INDEX IX_vendor_products_sku (sku),
        INDEX IX_vendor_products_source_doc (source_document_id)
    );
END
GO

PRINT 'VVOCR tables created successfully!';

