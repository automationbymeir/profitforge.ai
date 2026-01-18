import { AzureKeyCredential, DocumentAnalysisClient } from "@azure/ai-form-recognizer";
import { app, InvocationContext } from "@azure/functions";
import sql from "mssql";
import { OpenAI } from "openai";

// Connection strings from environment variables
const SQL_CONNECTION_STRING = process.env.SQL_CONNECTION_STRING;
const DOCUMENT_INTELLIGENCE_ENDPOINT = process.env.DOCUMENT_INTELLIGENCE_ENDPOINT;
const DOCUMENT_INTELLIGENCE_KEY = process.env.DOCUMENT_INTELLIGENCE_KEY;
const AI_PROJECT_ENDPOINT = process.env.AI_PROJECT_ENDPOINT;
const AI_PROJECT_KEY = process.env.AI_PROJECT_KEY;
const STORAGE_CONTAINER_DOCUMENTS = process.env.STORAGE_CONTAINER_DOCUMENTS || "uploads";

/**
 * Document Processor - Blob trigger function for OCR and AI product mapping
 *
 * TRIGGERED BY: New blob upload to "uploads" container
 *
 * STEP-BY-STEP PROCESS:
 * 1. INITIALIZATION
 *    - Extract blob path from trigger metadata
 *    - Validate Document Intelligence credentials (endpoint + key)
 *    - Record start time for duration tracking
 *
 * 2. OCR EXTRACTION (Azure Document Intelligence)
 *    - Initialize DocumentAnalysisClient with AzureKeyCredential
 *    - Analyze document using "prebuilt-layout" model (extracts text + tables)
 *    - Poll until OCR analysis completes
 *    - Extract: content (text), tables (structured data), pages (count)
 *
 * 3. DATABASE UPDATE - OCR RESULTS
 *    - Connect to SQL database using connection pool
 *    - Parse blob path to extract relative path (strip "uploads/" prefix)
 *    - Update document_processing_results table with:
 *      * doc_intel_extracted_text: Full OCR text content
 *      * doc_intel_structured_data: JSON with table data
 *      * doc_intel_page_count, doc_intel_table_count
 *      * processing_status: 'pending' -> 'mapping'
 *      * processing_duration_ms: OCR processing time
 *
 * 4. AI PRODUCT MAPPING (OpenAI GPT-4o)
 *    - Validate AI project credentials (endpoint + key)
 *    - Initialize OpenAI client with Azure endpoint
 *    - Create structured prompt with OCR output (first 10k chars)
 *    - Request JSON-formatted product extraction (SKU, name, price, unit, description)
 *    - Parse GPT-4o response for structured product data
 *
 * 5. DATABASE UPDATE - FINAL RESULTS
 *    - Update document_processing_results table with:
 *      * llm_mapping_result: Extracted product JSON from GPT-4o
 *      * processing_status: 'mapping' -> 'completed'
 *      * updated_at: Current timestamp
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
 * - AI_PROJECT_ENDPOINT: Azure OpenAI endpoint URL
 * - AI_PROJECT_KEY: API key for Azure OpenAI (GPT-4o deployment)
 * - STORAGE_CONTAINER_DOCUMENTS: Container name (default: "uploads")
 */
export async function processDocument(blob: Buffer, context: InvocationContext): Promise<void> {
  const blobPath = context.triggerMetadata?.blobTrigger as string;
  context.log(`Processing blob: ${blobPath}`);

  try {
    if (!DOCUMENT_INTELLIGENCE_ENDPOINT || !DOCUMENT_INTELLIGENCE_KEY) {
      throw new Error("Missing Document Intelligence configuration");
    }

    const startTime = Date.now();

    // 1. Initialize Document Analysis Client
    const client = new DocumentAnalysisClient(
      DOCUMENT_INTELLIGENCE_ENDPOINT,
      new AzureKeyCredential(DOCUMENT_INTELLIGENCE_KEY)
    );

    // 2. Start analysis (using prebuilt-layout for tables and structure)
    const poller = await client.beginAnalyzeDocument("prebuilt-layout", blob);
    const { content, tables, pages } = await poller.pollUntilDone();

    context.log(
      `Extraction complete. Pages: ${pages?.length || 0}, Tables: ${tables?.length || 0}`
    );

    // Update database with extraction results
    const pool = new sql.ConnectionPool(SQL_CONNECTION_STRING!);
    await pool.connect();

    // Extract path - blob trigger gives full path like "uploads/vendor/file.pdf"
    // We need just "vendor/file.pdf" to match what we stored during upload
    const pathParts = blobPath.split("/");
    const relativePath = pathParts.length > 1 ? pathParts.slice(1).join("/") : blobPath;

    await pool
      .request()
      .input("documentPath", sql.NVarChar, relativePath)
      .input("extractedText", sql.NVarChar, content)
      .input("structuredData", sql.NVarChar, JSON.stringify({ tables }))
      .input("pageCount", sql.Int, pages?.length || 0)
      .input("tableCount", sql.Int, tables?.length || 0)
      .input("duration", sql.Int, Date.now() - startTime).query(`
                UPDATE vvocr.document_processing_results 
                SET 
                    doc_intel_extracted_text = @extractedText,
                    doc_intel_structured_data = @structuredData,
                    doc_intel_page_count = @pageCount,
                    doc_intel_table_count = @tableCount,
                    processing_status = 'mapping', -- Move to next step (AI Mapping)
                    processing_duration_ms = @duration,
                    updated_at = GETUTCDATE()
                WHERE document_path = @documentPath
            `);

    context.log(`Database updated for ${relativePath}. Starting Product Extraction.`);

    // 3. Intelligent column detection across all tables
    if (!AI_PROJECT_ENDPOINT || !AI_PROJECT_KEY) {
      throw new Error("Missing AI project configuration");
    }

    const openai = new OpenAI({
      apiKey: AI_PROJECT_KEY,
      baseURL: `${AI_PROJECT_ENDPOINT}/openai/deployments/gpt-4o`,
      defaultQuery: { "api-version": "2024-08-01-preview" },
      defaultHeaders: { "api-key": AI_PROJECT_KEY },
    });

    // Analyze ALL table headers to find common column patterns
    const allHeaders: Array<{ tableIdx: number; colIdx: number; header: string }> = [];
    tables?.forEach((table, tableIdx) => {
      const headerCells = table.cells.filter((c: any) => c.kind === "columnHeader");
      headerCells.forEach((cell: any) => {
        allHeaders.push({
          tableIdx,
          colIdx: cell.columnIndex,
          header: cell.content,
        });
      });
    });

    context.log(`Found ${allHeaders.length} header cells across ${tables?.length || 0} tables`);
    context.log(
      `Sample headers: ${allHeaders
        .slice(0, 20)
        .map((h) => h.header)
        .join(", ")}`
    );

    const headerMappingPrompt = `You are analyzing product catalog tables. Here are ALL the column headers found:
${allHeaders.map((h) => `Table ${h.tableIdx}, Column ${h.colIdx}: "${h.header}"`).join("\n")}

These tables have a CONSISTENT structure. Identify the common column pattern:
- Which column index is SKU? (look for "SKU", "Item Code", etc.)
- Which column index is Product Name? (look for product descriptions, NOT category headers like "QUILTED HAMMOCKS")
- Which column index is Price? (look for "MSRP", "Price", "Cost", etc.)
- Which column index is Unit/Dimensions? (look for "Dimensions", "Size", "Unit", etc.)

IMPORTANT: Category headers like "QUILTED HAMMOCKS" are NOT column headers for product names. 
The actual product name is in the first data column (usually column 0 or the column with long descriptive text).

Return JSON:
{
  "vendor": "detected vendor name",
  "columnMapping": {
    "sku": column_index_number,
    "name": column_index_number,
    "price": column_index_number,
    "unit": column_index_number
  }
}

Context: ${content?.substring(0, 2000)}`;

    const mappingResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: headerMappingPrompt }],
      response_format: { type: "json_object" },
      max_tokens: 500,
      temperature: 0,
    });

    const mappingResult = JSON.parse(mappingResponse.choices[0].message.content || "{}");
    context.log(`Column mapping: ${JSON.stringify(mappingResult.columnMapping)}`);

    // 4. Extract products using column index mapping
    context.log(`Extracting products from ${tables?.length || 0} structured tables...`);

    const products: Array<{
      sku: string;
      name: string;
      price: number;
      unit: string;
    }> = [];

    const colMap = mappingResult.columnMapping || {};

    for (const table of tables || []) {
      // Extract products from content rows
      const contentCells = table.cells.filter((c: any) => c.kind === "content");
      if (contentCells.length === 0) continue;

      const rowCount = Math.max(...contentCells.map((c: any) => c.rowIndex)) + 1;

      for (let rowIdx = 1; rowIdx < rowCount; rowIdx++) {
        const rowCells = contentCells.filter((c: any) => c.rowIndex === rowIdx);

        const sku = rowCells.find((c: any) => c.columnIndex === colMap.sku)?.content?.trim();
        const name = rowCells.find((c: any) => c.columnIndex === colMap.name)?.content?.trim();
        const priceStr = rowCells.find((c: any) => c.columnIndex === colMap.price)?.content?.trim();
        const unit = rowCells.find((c: any) => c.columnIndex === colMap.unit)?.content?.trim();

        if (sku && name) {
          // Parse price - remove currency symbols, commas
          const priceMatch = priceStr?.match(/[\d,]+\.?\d*/);
          const price = priceMatch ? parseFloat(priceMatch[0].replace(/,/g, "")) : 0;

          products.push({
            sku,
            name,
            price,
            unit: unit || "",
          });
        }
      }
    }

    context.log(`✅ Extracted ${products.length} products from ${tables?.length || 0} tables`);

    const mappingResultJson = JSON.stringify({
      vendor: mappingResult.vendor || "Unknown Vendor",
      products,
    });

    context.log(
      `✅ Product extraction complete: ${products.length} products, vendor: ${mappingResult.vendor}`
    );

    // 5. Final update with extraction results
    await pool
      .request()
      .input("documentPath", sql.NVarChar, relativePath)
      .input("mappingResult", sql.NVarChar, mappingResultJson)
      .input("vendorName", sql.NVarChar, mappingResult.vendor || "Unknown").query(`
                UPDATE vvocr.document_processing_results 
                SET 
                    ai_model_analysis = @mappingResult,
                    ai_model_used = 'gpt-4o',
                    vendor_name = @vendorName,
                    processing_status = 'completed',
                    updated_at = GETUTCDATE()
                WHERE document_path = @documentPath
            `);

    context.log(`Processing successfully completed for ${relativePath}`);
  } catch (error: any) {
    context.error(`Error processing document: ${error.message}`);
    context.error(`Error stack: ${error.stack}`); // Added detailed error logging

    // Update database with failure status
    try {
      const pool = new sql.ConnectionPool(SQL_CONNECTION_STRING!);
      await pool.connect();
      const relativePath = blobPath.split("/").slice(1).join("/");
      await pool
        .request()
        .input("documentPath", sql.NVarChar, relativePath)
        .input("error", sql.NVarChar, error.message).query(`
                    UPDATE vvocr.document_processing_results 
                    SET 
                        processing_status = 'failed',
                        error_message = @error,
                        updated_at = GETUTCDATE()
                    WHERE document_path = @documentPath
                `);
    } catch (dbError) {
      context.error(`Failed to update error status in DB: ${dbError}`);
    }
  }
}

app.storageBlob("processDocument", {
  path: `${STORAGE_CONTAINER_DOCUMENTS}/{name}`,
  connection: "STORAGE_CONNECTION_STRING",
  handler: processDocument,
});
