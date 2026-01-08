-- =============================================
-- VVOCR SCHEMA - Document Processing POC
-- Matches client's expected schema for isolated POC work
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
        processing_status NVARCHAR(50) DEFAULT 'pending', -- pending, processing, completed, failed, manual_review
        processing_started_at DATETIME2,
        processing_completed_at DATETIME2,
        processing_duration_ms INT,
        
        -- Document Intelligence (Azure Form Recognizer) results
        doc_intel_extracted_text NVARCHAR(MAX),
        doc_intel_structured_data NVARCHAR(MAX), -- JSON
        doc_intel_confidence_score DECIMAL(5,4),
        doc_intel_page_count INT,
        doc_intel_table_count INT,
        
        -- AI Model results (GPT-4o, Llama, Mistral, etc.)
        ai_model_used NVARCHAR(100), -- e.g., 'gpt-4o', 'llama-3-1-405b'
        ai_model_analysis NVARCHAR(MAX), -- JSON output
        ai_confidence_score DECIMAL(5,4),
        ai_prompt_tokens INT,
        ai_completion_tokens INT,
        ai_total_tokens INT,
        
        -- Cost tracking
        doc_intel_cost_usd DECIMAL(10,6),
        ai_model_cost_usd DECIMAL(10,6),
        total_cost_usd DECIMAL(10,6),
        
        -- Validation
        requires_manual_review BIT DEFAULT 0,
        manual_review_reason NVARCHAR(500),
        reviewed_by NVARCHAR(100),
        reviewed_at DATETIME2,
        
        -- Metadata
        batch_id UNIQUEIDENTIFIER,
        error_message NVARCHAR(MAX),
        created_at DATETIME2 DEFAULT GETUTCDATE(),
        updated_at DATETIME2 DEFAULT GETUTCDATE(),
        
        -- Indexes
        INDEX IX_document_processing_status (processing_status),
        INDEX IX_document_batch_id (batch_id),
        INDEX IX_document_uploaded_at (uploaded_at),
        INDEX IX_document_requires_review (requires_manual_review)
    );
END
GO

-- =============================================
-- 2. Execution Log
-- Track batch processing runs and performance
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'execution_log' AND schema_id = SCHEMA_ID('vvocr'))
BEGIN
    CREATE TABLE vvocr.execution_log (
        execution_id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        execution_run_id UNIQUEIDENTIFIER NOT NULL, -- Groups multiple executions in same run
        
        -- Execution metadata
        execution_type NVARCHAR(50), -- 'batch_upload', 'single_document', 'reprocessing'
        execution_started_at DATETIME2 DEFAULT GETUTCDATE(),
        execution_completed_at DATETIME2,
        execution_duration_ms INT,
        execution_status NVARCHAR(50), -- 'running', 'completed', 'failed', 'partial'
        
        -- Processing statistics
        documents_submitted INT DEFAULT 0,
        documents_processed INT DEFAULT 0,
        documents_succeeded INT DEFAULT 0,
        documents_failed INT DEFAULT 0,
        documents_queued_for_review INT DEFAULT 0,
        
        -- Resource usage
        total_tokens_used INT DEFAULT 0,
        total_doc_intel_pages_processed INT DEFAULT 0,
        
        -- Cost aggregation
        total_doc_intel_cost_usd DECIMAL(10,6),
        total_ai_model_cost_usd DECIMAL(10,6),
        total_cost_usd DECIMAL(10,6),
        
        -- Performance metrics
        avg_processing_time_ms INT,
        avg_confidence_score DECIMAL(5,4),
        
        -- Environment
        ai_model_used NVARCHAR(100),
        function_app_name NVARCHAR(200),
        deployed_by NVARCHAR(100),
        
        -- Errors
        error_summary NVARCHAR(MAX),
        
        -- Metadata
        created_at DATETIME2 DEFAULT GETUTCDATE(),
        
        INDEX IX_execution_run_id (execution_run_id),
        INDEX IX_execution_started_at (execution_started_at),
        INDEX IX_execution_status (execution_status)
    );
END
GO

-- =============================================
-- 3. Manual Review Queue
-- Documents requiring human validation
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'manual_review_queue' AND schema_id = SCHEMA_ID('vvocr'))
BEGIN
    CREATE TABLE vvocr.manual_review_queue (
        review_id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        result_id UNIQUEIDENTIFIER NOT NULL,
        
        -- Review status
        validation_status NVARCHAR(50) DEFAULT 'pending', -- pending, in_review, approved, rejected
        priority NVARCHAR(20) DEFAULT 'normal', -- high, normal, low
        
        -- Reason for review
        low_confidence_reason NVARCHAR(500),
        flagged_fields NVARCHAR(MAX), -- JSON array of field names with issues
        
        -- Assignment
        assigned_to NVARCHAR(100),
        assigned_at DATETIME2,
        
        -- Review results
        reviewer_notes NVARCHAR(MAX),
        corrected_data NVARCHAR(MAX), -- JSON with corrections
        approved_by NVARCHAR(100),
        approved_at DATETIME2,
        
        -- Metadata
        queued_at DATETIME2 DEFAULT GETUTCDATE(),
        completed_at DATETIME2,
        
        FOREIGN KEY (result_id) REFERENCES vvocr.document_processing_results(result_id),
        INDEX IX_review_status (validation_status),
        INDEX IX_review_priority (priority),
        INDEX IX_review_assigned_to (assigned_to),
        INDEX IX_review_queued_at (queued_at)
    );
END
GO

-- =============================================
-- 4. Cost Tracking
-- Detailed cost breakdown for budget monitoring
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'cost_tracking' AND schema_id = SCHEMA_ID('vvocr'))
BEGIN
    CREATE TABLE vvocr.cost_tracking (
        cost_id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        
        -- Time period
        tracking_date DATE NOT NULL,
        tracking_hour INT, -- Hour of day (0-23) for granular tracking
        
        -- Service breakdown
        service_name NVARCHAR(100), -- 'Document Intelligence', 'GPT-4o', 'Llama-3.1', etc.
        resource_name NVARCHAR(200), -- Specific deployment name
        
        -- Usage metrics
        units_consumed INT, -- Pages for Doc Intel, Tokens for AI models
        unit_type NVARCHAR(50), -- 'pages', 'tokens', 'requests'
        
        -- Cost
        unit_cost_usd DECIMAL(10,6),
        total_cost_usd DECIMAL(10,6),
        
        -- Context
        execution_run_id UNIQUEIDENTIFIER,
        result_id UNIQUEIDENTIFIER,
        
        -- Metadata
        recorded_at DATETIME2 DEFAULT GETUTCDATE(),
        
        INDEX IX_cost_tracking_date (tracking_date),
        INDEX IX_cost_service_name (service_name),
        INDEX IX_cost_execution_run (execution_run_id)
    );
END
GO

-- =============================================
-- 5. Vendor Catalog Mappings (Optional - for future use)
-- Store learned mappings per vendor for reuse
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'vendor_catalog_mappings' AND schema_id = SCHEMA_ID('vvocr'))
BEGIN
    CREATE TABLE vvocr.vendor_catalog_mappings (
        mapping_id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        
        -- Vendor identification
        vendor_name NVARCHAR(200) NOT NULL,
        vendor_id NVARCHAR(100),
        
        -- Catalog metadata
        catalog_type NVARCHAR(100), -- 'price_list', 'product_catalog', 'inventory'
        document_format NVARCHAR(50), -- 'PDF_table', 'Excel', 'CSV'
        
        -- Field mappings (JSON)
        field_mappings NVARCHAR(MAX), -- JSON: {"source_field": "target_field"}
        extraction_rules NVARCHAR(MAX), -- JSON: rules for parsing
        
        -- Confidence and usage
        confidence_score DECIMAL(5,4),
        times_used INT DEFAULT 0,
        success_rate DECIMAL(5,4),
        
        -- Versioning
        mapping_version INT DEFAULT 1,
        is_active BIT DEFAULT 1,
        
        -- Metadata
        created_by NVARCHAR(100),
        created_at DATETIME2 DEFAULT GETUTCDATE(),
        last_used_at DATETIME2,
        updated_at DATETIME2,
        
        INDEX IX_vendor_name (vendor_name),
        INDEX IX_vendor_active (is_active)
    );
END
GO

-- =============================================
-- Create views for common queries
-- =============================================

-- View: Recent processing results with costs
IF OBJECT_ID('vvocr.v_recent_processing_summary', 'V') IS NOT NULL
    DROP VIEW vvocr.v_recent_processing_summary;
GO

CREATE VIEW vvocr.v_recent_processing_summary AS
SELECT 
    r.result_id,
    r.document_name,
    r.processing_status,
    r.ai_model_used,
    r.doc_intel_confidence_score,
    r.ai_confidence_score,
    r.total_cost_usd,
    r.processing_duration_ms,
    r.requires_manual_review,
    r.uploaded_at,
    r.processing_completed_at,
    q.validation_status as review_status
FROM vvocr.document_processing_results r
LEFT JOIN vvocr.manual_review_queue q ON r.result_id = q.result_id
WHERE r.uploaded_at >= DATEADD(day, -7, GETUTCDATE());
GO

-- View: Daily cost summary
IF OBJECT_ID('vvocr.v_daily_cost_summary', 'V') IS NOT NULL
    DROP VIEW vvocr.v_daily_cost_summary;
GO

CREATE VIEW vvocr.v_daily_cost_summary AS
SELECT 
    tracking_date,
    service_name,
    SUM(units_consumed) as total_units,
    SUM(total_cost_usd) as total_cost_usd,
    COUNT(*) as transaction_count
FROM vvocr.cost_tracking
GROUP BY tracking_date, service_name;
GO

-- View: Processing performance metrics
IF OBJECT_ID('vvocr.v_processing_performance', 'V') IS NOT NULL
    DROP VIEW vvocr.v_processing_performance;
GO

CREATE VIEW vvocr.v_processing_performance AS
SELECT 
    e.execution_run_id,
    e.execution_type,
    e.ai_model_used,
    e.documents_processed,
    e.documents_succeeded,
    e.documents_failed,
    e.total_cost_usd,
    e.avg_processing_time_ms,
    e.avg_confidence_score,
    e.execution_started_at,
    e.execution_duration_ms
FROM vvocr.execution_log e
WHERE e.execution_completed_at IS NOT NULL;
GO

PRINT 'VVOCR schema created successfully!';
PRINT 'Tables created:';
PRINT '  - vvocr.document_processing_results';
PRINT '  - vvocr.execution_log';
PRINT '  - vvocr.manual_review_queue';
PRINT '  - vvocr.cost_tracking';
PRINT '  - vvocr.vendor_catalog_mappings';
PRINT 'Views created:';
PRINT '  - vvocr.v_recent_processing_summary';
PRINT '  - vvocr.v_daily_cost_summary';
PRINT '  - vvocr.v_processing_performance';
