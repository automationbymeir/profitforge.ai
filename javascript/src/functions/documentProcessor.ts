import { AzureKeyCredential, DocumentAnalysisClient } from '@azure/ai-form-recognizer';
import { app, InvocationContext } from '@azure/functions';
import { BlobServiceClient } from '@azure/storage-blob';
import { QueueServiceClient } from '@azure/storage-queue';
import sql from 'mssql';

// Connection strings from environment variables
const SQL_CONNECTION_STRING = process.env.SQL_CONNECTION_STRING;
const DOCUMENT_INTELLIGENCE_ENDPOINT = process.env.DOCUMENT_INTELLIGENCE_ENDPOINT;
const DOCUMENT_INTELLIGENCE_KEY = process.env.DOCUMENT_INTELLIGENCE_KEY;
const STORAGE_CONTAINER_DOCUMENTS = process.env.STORAGE_CONTAINER_DOCUMENTS || 'uploads';
const BRONZE_LAYER_CONTAINER = 'bronze-layer';

/**
 * Document Processor - Blob trigger function for OCR extraction ONLY
 *
 * TRIGGERED BY: New blob upload to "uploads" container
 *
 * STEP-BY-STEP PROCESS:
 * 1. INITIALIZATION
 *    - Extract blob path and URL from trigger metadata
 *    - Validate Document Intelligence credentials (endpoint + key)
 *    - Record start time for duration tracking
 *
 * 2. OCR EXTRACTION (Azure Document Intelligence)
 *    - Initialize DocumentAnalysisClient with AzureKeyCredential
 *    - Analyze document using "prebuilt-layout" model (extracts text + tables)
 *    - Poll until OCR analysis completes
 *    - Extract: content (text), tables (structured data), pages (count)
 *    - Calculate cost: pageCount * $1.50 / 1000
 *
 * 3. BRONZE-LAYER STORAGE
 *    - Store raw PDF in bronze-layer/raw/{vendor}/{timestamp}-{filename}.pdf
 *    - Store OCR output in bronze-layer/ocr/{document_id}.json
 *
 * 4. DATABASE UPDATE - OCR RESULTS
 *    - Connect to SQL database using connection pool
 *    - Parse blob path to extract relative path
 *    - Update document_processing_results table with:
 *      * doc_intel_extracted_text: Full OCR text content
 *      * doc_intel_structured_data: JSON with table data
 *      * doc_intel_page_count, doc_intel_table_count
 *      * doc_intel_cost_usd: Calculated cost
 *      * processing_started_at, processing_duration_ms
 *      * processing_status: 'pending' -> 'ocr_complete'
 *
 * NEXT STEP:
 * - Status 'ocr_complete' triggers AI mapping via separate function
 *
 * ERROR HANDLING:
 * - Catches any errors during processing
 * - Logs error message via context.error()
 * - Updates database with 'failed' status and error_message
 * - Ensures graceful failure without crashing the function
 *
 * ENVIRONMENT VARIABLES REQUIRED:
 * - SQL_CONNECTION_STRING: Azure SQL connection string
 * - DOCUMENT_INTELLIGENCE_ENDPOINT: Azure AI Document Intelligence endpoint
 * - DOCUMENT_INTELLIGENCE_KEY: API key for Document Intelligence
 * - STORAGE_CONNECTION_STRING: Azure Storage connection string
 * - STORAGE_CONTAINER_DOCUMENTS: Container name (default: "uploads")
 */
export async function processDocument(blob: Buffer, context: InvocationContext): Promise<void> {
  const blobPath = context.triggerMetadata?.blobTrigger as string;
  context.log(`Processing blob: ${blobPath}`);

  const startTime = Date.now();
  let pool: sql.ConnectionPool | null = null;

  try {
    if (!DOCUMENT_INTELLIGENCE_ENDPOINT || !DOCUMENT_INTELLIGENCE_KEY) {
      throw new Error('Missing Document Intelligence configuration');
    }

    // 1. Initialize Document Analysis Client
    const client = new DocumentAnalysisClient(
      DOCUMENT_INTELLIGENCE_ENDPOINT,
      new AzureKeyCredential(DOCUMENT_INTELLIGENCE_KEY)
    );

    // 2. Start analysis (using prebuilt-layout for tables and structure)
    const poller = await client.beginAnalyzeDocument('prebuilt-layout', blob);
    const { content, tables, pages } = await poller.pollUntilDone();

    const pageCount = pages?.length || 0;
    const tableCount = tables?.length || 0;

    context.log(`OCR complete. Pages: ${pageCount}, Tables: ${tableCount}`);

    // Calculate cost: $1.50 per 1,000 pages
    const docIntelCost = (pageCount / 1000) * 1.5;

    // Extract path - blob trigger gives full path like "uploads/vendor/file.pdf"
    const pathParts = blobPath.split('/');
    const relativePath = pathParts.length > 1 ? pathParts.slice(1).join('/') : blobPath;
    const vendorName = pathParts.length > 1 ? pathParts[1] : 'unknown';

    // 3. Store OCR results in bronze-layer
    const blobServiceClient = BlobServiceClient.fromConnectionString(
      process.env.STORAGE_CONNECTION_STRING!
    );
    const bronzeContainer = blobServiceClient.getContainerClient(BRONZE_LAYER_CONTAINER);

    // Get document_id from database first
    pool = new sql.ConnectionPool(SQL_CONNECTION_STRING!);
    await pool.connect();

    const docResult = await pool.request().input('documentPath', sql.NVarChar, relativePath).query(`
        SELECT result_id FROM vvocr.document_processing_results 
        WHERE document_path = @documentPath
      `);

    if (docResult.recordset.length === 0) {
      throw new Error(`Document not found in database: ${relativePath}`);
    }

    const documentId = docResult.recordset[0].result_id;

    // Store raw PDF in bronze-layer
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = pathParts[pathParts.length - 1];
    const rawBlobPath = `raw/${vendorName}/${timestamp}-${fileName}`;
    const rawBlobClient = bronzeContainer.getBlockBlobClient(rawBlobPath);
    await rawBlobClient.upload(blob, blob.length);

    // Store OCR output in bronze-layer
    const ocrResult = {
      documentId,
      timestamp: new Date().toISOString(),
      content,
      tables,
      pageCount,
      tableCount,
      cost: docIntelCost,
    };
    const ocrBlobPath = `ocr/${documentId}.json`;
    const ocrBlobClient = bronzeContainer.getBlockBlobClient(ocrBlobPath);
    await ocrBlobClient.upload(
      Buffer.from(JSON.stringify(ocrResult, null, 2)),
      Buffer.from(JSON.stringify(ocrResult, null, 2)).length
    );

    context.log(`Bronze-layer storage complete: ${rawBlobPath}, ${ocrBlobPath}`);

    // 4. Update database with OCR results
    const processingDuration = Date.now() - startTime;

    await pool
      .request()
      .input('documentPath', sql.NVarChar, relativePath)
      .input('extractedText', sql.NVarChar, content)
      .input('structuredData', sql.NVarChar, JSON.stringify({ tables }))
      .input('pageCount', sql.Int, pageCount)
      .input('tableCount', sql.Int, tableCount)
      .input('docIntelCost', sql.Decimal(10, 6), docIntelCost)
      .input('duration', sql.Int, processingDuration)
      .input('startedAt', sql.DateTime2, new Date(startTime)).query(`
        UPDATE vvocr.document_processing_results 
        SET 
            doc_intel_extracted_text = @extractedText,
            doc_intel_structured_data = @structuredData,
            doc_intel_page_count = @pageCount,
            doc_intel_table_count = @tableCount,
            doc_intel_cost_usd = @docIntelCost,
            processing_status = 'ocr_complete',
            processing_started_at = @startedAt,
            processing_duration_ms = @duration,
            updated_at = GETUTCDATE()
        WHERE document_path = @documentPath
      `);

    context.log(`✅ OCR processing complete for ${relativePath}. Status: ocr_complete`);
    await pool.close();

    // 5. Queue AI Product Mapper for asynchronous processing
    try {
      context.log(`📤 Queuing AI product mapping for document ${documentId}...`);

      const queueServiceClient = QueueServiceClient.fromConnectionString(
        process.env.STORAGE_CONNECTION_STRING!
      );
      const queueClient = queueServiceClient.getQueueClient('ai-mapping-queue');
      await queueClient.createIfNotExists();

      await queueClient.sendMessage(Buffer.from(JSON.stringify({ documentId })).toString('base64'));

      context.log(`✅ AI mapping queued successfully for document ${documentId}`);
    } catch (queueError: unknown) {
      // Don't fail OCR if queuing fails - log and continue
      const errorMessage = queueError instanceof Error ? queueError.message : String(queueError);
      context.warn(`⚠️ Failed to queue AI mapping: ${errorMessage}`);
      context.warn(
        `   Document ${documentId} is in 'ocr_complete' state and can be reprocessed manually via API.`
      );
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : '';
    context.error(`Error processing document: ${errorMessage}`);
    context.error(`Error stack: ${errorStack}`);

    // Update database with failure status
    try {
      if (!pool) {
        pool = new sql.ConnectionPool(SQL_CONNECTION_STRING!);
        await pool.connect();
      }
      const relativePath = blobPath.split('/').slice(1).join('/');
      await pool
        .request()
        .input('documentPath', sql.NVarChar, relativePath)
        .input('error', sql.NVarChar, errorMessage).query(`
          UPDATE vvocr.document_processing_results 
          SET 
              processing_status = 'failed',
              error_message = @error,
              updated_at = GETUTCDATE()
          WHERE document_path = @documentPath
        `);
      await pool.close();
    } catch (dbError) {
      context.error(`Failed to update error status in DB: ${dbError}`);
    }
  }
}

app.storageBlob('processDocument', {
  path: `${STORAGE_CONTAINER_DOCUMENTS}/{name}`,
  connection: 'STORAGE_CONNECTION_STRING',
  handler: processDocument,
});
