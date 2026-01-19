import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { BlobServiceClient } from "@azure/storage-blob";
import sql from "mssql";
import { OpenAI } from "openai";

// Connection strings from environment variables
const SQL_CONNECTION_STRING = process.env.SQL_CONNECTION_STRING;
const AI_PROJECT_ENDPOINT = process.env.AI_PROJECT_ENDPOINT;
const AI_PROJECT_KEY = process.env.AI_PROJECT_KEY;
const BRONZE_LAYER_CONTAINER = "bronze-layer";

/**
 * AI Product Mapper - HTTP POST endpoint for AI-based product extraction
 *
 * TRIGGERED BY: HTTP POST with document_id
 *
 * STEP-BY-STEP PROCESS:
 * 1. INITIALIZATION
 *    - Extract document_id from request body
 *    - Validate AI project credentials
 *    - Query database for OCR results (doc_intel_structured_data)
 *
 * 2. COLUMN DETECTION (GPT-4o Phase 1)
 *    - Extract all table headers from OCR data
 *    - Send headers to GPT-4o for intelligent column mapping
 *    - Identify: SKU, name, price, unit, description columns
 *    - Handles vendor-specific naming variations
 *
 * 3. PRODUCT EXTRACTION (GPT-4o Phase 2)
 *    - Iterate through table rows using column mapping
 *    - Extract products with minimal required schema:
 *      * name (required)
 *      * SKU (required)
 *      * price (required)
 *      * unit (optional)
 *      * description (optional)
 *    - Parse prices (remove currency symbols, commas)
 *    - Filter out invalid rows (missing required fields)
 *
 * 4. BRONZE-LAYER STORAGE
 *    - Store AI mapping result in bronze-layer/ai-mapping/{document_id}-v{version}.json
 *    - Store prompt used in bronze-layer/prompts/{document_id}-mapping.txt
 *
 * 5. DATABASE UPDATE
 *    - Update document_processing_results table with:
 *      * llm_mapping_result: Product JSON array
 *      * ai_model_name: 'gpt-4o'
 *      * ai_prompt_used: Full prompt text
 *      * ai_prompt_tokens, ai_completion_tokens, ai_total_tokens
 *      * ai_model_cost_usd: Calculated cost
 *      * product_count: Number of products extracted
 *      * processing_status: 'ocr_complete' -> 'completed'
 *      * processing_completed_at: Timestamp
 *
 * COST CALCULATION:
 * - GPT-4o: $2.50/1M input tokens, $10.00/1M output tokens
 * - Cost = (prompt_tokens * 0.0025 + completion_tokens * 0.01) / 1000
 *
 * ERROR HANDLING:
 * - 400 Bad Request: Missing document_id
 * - 404 Not Found: Document not found or OCR not complete
 * - 500 Internal Server Error: AI or database errors
 * - Updates DB with 'failed' status on errors
 *
 * REPROCESSING:
 * - Can be called multiple times on same document_id
 * - Each run increments reprocessing_count
 * - Allows prompt/model iteration for accuracy improvement
 */
export async function aiProductMapperHandler(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log(`AI Product Mapping request received`);

  let pool: sql.ConnectionPool | null = null;

  try {
    const body = (await req.json()) as any;
    const documentId = body.documentId;

    if (!documentId) {
      return {
        status: 400,
        body: JSON.stringify({ error: "Missing documentId in request body" }),
      };
    }

    if (!AI_PROJECT_ENDPOINT || !AI_PROJECT_KEY) {
      throw new Error("Missing AI project configuration");
    }

    // 1. Retrieve OCR results from database
    pool = new sql.ConnectionPool(SQL_CONNECTION_STRING!);
    await pool.connect();

    const result = await pool.request().input("documentId", sql.UniqueIdentifier, documentId)
      .query(`
        SELECT 
          result_id,
          document_name,
          vendor_name,
          doc_intel_structured_data,
          doc_intel_extracted_text,
          processing_status,
          reprocessing_count
        FROM vvocr.document_processing_results 
        WHERE result_id = @documentId
      `);

    if (result.recordset.length === 0) {
      await pool.close();
      return {
        status: 404,
        body: JSON.stringify({ error: "Document not found" }),
      };
    }

    const document = result.recordset[0];

    if (
      document.processing_status !== "ocr_complete" &&
      document.processing_status !== "completed"
    ) {
      await pool.close();
      return {
        status: 400,
        body: JSON.stringify({
          error: `Document status is '${document.processing_status}'. Must be 'ocr_complete' to run AI mapping.`,
        }),
      };
    }

    const ocrData = JSON.parse(document.doc_intel_structured_data);
    const tables = ocrData.tables || [];
    const fullText = document.doc_intel_extracted_text || "";

    context.log(`Processing document: ${document.document_name}, Tables: ${tables.length}`);

    // 2. Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: AI_PROJECT_KEY,
      baseURL: `${AI_PROJECT_ENDPOINT}/openai/deployments/gpt-4o`,
      defaultQuery: { "api-version": "2024-08-01-preview" },
      defaultHeaders: { "api-key": AI_PROJECT_KEY },
    });

    // 3. Analyze ALL table headers to find common column patterns
    const allHeaders: Array<{ tableIdx: number; colIdx: number; header: string }> = [];
    tables.forEach((table: any, tableIdx: number) => {
      const headerCells = table.cells.filter((c: any) => c.kind === "columnHeader");
      headerCells.forEach((cell: any) => {
        allHeaders.push({
          tableIdx,
          colIdx: cell.columnIndex,
          header: cell.content,
        });
      });
    });

    context.log(`Found ${allHeaders.length} header cells across ${tables.length} tables`);

    // Build column mapping prompt (minimal required schema)
    const headerMappingPrompt = `You are analyzing product catalog tables. Extract products with the following MINIMAL REQUIRED SCHEMA:
- name (product name/description) - REQUIRED
- SKU (item code/product code) - REQUIRED  
- price (MSRP/cost) - REQUIRED
- unit (dimensions/size/packaging) - OPTIONAL
- description (additional details) - OPTIONAL

Here are ALL the column headers found:
${allHeaders.map((h) => `Table ${h.tableIdx}, Column ${h.colIdx}: "${h.header}"`).join("\n")}

These tables have a CONSISTENT structure. Identify the column pattern:
- Which column index is SKU? (look for "SKU", "Item Code", "Item #", etc.)
- Which column index is Product Name? (look for product descriptions, NOT category headers)
- Which column index is Price? (look for "MSRP", "Price", "Cost", "List Price", etc.)
- Which column index is Unit/Dimensions? (look for "Dimensions", "Size", "Unit", "Pack", etc.)
- Which column index is Description? (look for additional product details)

IMPORTANT: 
- Category headers (e.g., "QUILTED HAMMOCKS") are NOT column headers for product names
- The actual product name is in the first data column with descriptive text
- Ignore header-only rows or separator rows

Return JSON:
{
  "vendor": "detected vendor name",
  "columnMapping": {
    "sku": column_index_number or null,
    "name": column_index_number,
    "price": column_index_number or null,
    "unit": column_index_number or null,
    "description": column_index_number or null
  }
}

Context: ${fullText.substring(0, 2000)}`;

    const startTime = Date.now();

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
    const products: Array<{
      name: string;
      sku: string;
      price: number;
      unit?: string;
      description?: string;
    }> = [];

    const colMap = mappingResult.columnMapping || {};

    for (const table of tables) {
      const contentCells = table.cells.filter((c: any) => c.kind === "content");
      if (contentCells.length === 0) continue;

      const rowCount = Math.max(...contentCells.map((c: any) => c.rowIndex)) + 1;

      for (let rowIdx = 1; rowIdx < rowCount; rowIdx++) {
        const rowCells = contentCells.filter((c: any) => c.rowIndex === rowIdx);

        const sku = rowCells.find((c: any) => c.columnIndex === colMap.sku)?.content?.trim();
        const name = rowCells.find((c: any) => c.columnIndex === colMap.name)?.content?.trim();
        const priceStr = rowCells.find((c: any) => c.columnIndex === colMap.price)?.content?.trim();
        const unit = rowCells.find((c: any) => c.columnIndex === colMap.unit)?.content?.trim();
        const description = rowCells
          .find((c: any) => c.columnIndex === colMap.description)
          ?.content?.trim();

        // Validate required fields
        if (sku && name) {
          // Parse price - remove currency symbols, commas
          const priceMatch = priceStr?.match(/[\d,]+\.?\d*/);
          const price = priceMatch ? parseFloat(priceMatch[0].replace(/,/g, "")) : 0;

          const product: any = {
            name,
            sku,
            price,
          };

          if (unit) product.unit = unit;
          if (description) product.description = description;

          products.push(product);
        }
      }
    }

    context.log(`✅ Extracted ${products.length} products from ${tables.length} tables`);

    // 5. Calculate costs
    const promptTokens = mappingResponse.usage?.prompt_tokens || 0;
    const completionTokens = mappingResponse.usage?.completion_tokens || 0;
    const totalTokens = promptTokens + completionTokens;

    // GPT-4o pricing: $2.50/1M input, $10.00/1M output
    const aiCost = (promptTokens * 0.0025 + completionTokens * 0.01) / 1000;

    const processingDuration = Date.now() - startTime;

    // 6. Store in bronze-layer
    const blobServiceClient = BlobServiceClient.fromConnectionString(
      process.env.STORAGE_CONNECTION_STRING!
    );
    const bronzeContainer = blobServiceClient.getContainerClient(BRONZE_LAYER_CONTAINER);

    // Use the reprocessing_count from the record (already set correctly by reprocessMapping)
    const version = document.reprocessing_count || 0;

    // Store AI mapping result
    const mappingResultJson = {
      documentId,
      timestamp: new Date().toISOString(),
      vendor: mappingResult.vendor || document.vendor_name || "Unknown",
      products,
      productCount: products.length,
      columnMapping: mappingResult.columnMapping,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens,
        cost: aiCost,
      },
    };

    const mappingBlobPath = `ai-mapping/${documentId}-v${version}.json`;
    const mappingBlobClient = bronzeContainer.getBlockBlobClient(mappingBlobPath);
    await mappingBlobClient.upload(
      Buffer.from(JSON.stringify(mappingResultJson, null, 2)),
      Buffer.from(JSON.stringify(mappingResultJson, null, 2)).length
    );

    // Store prompt
    const promptBlobPath = `prompts/${documentId}-mapping-v${version}.txt`;
    const promptBlobClient = bronzeContainer.getBlockBlobClient(promptBlobPath);
    await promptBlobClient.upload(
      Buffer.from(headerMappingPrompt),
      Buffer.from(headerMappingPrompt).length
    );

    context.log(`Bronze-layer storage complete: ${mappingBlobPath}, ${promptBlobPath}`);

    // 7. Update database with AI mapping results
    await pool
      .request()
      .input("documentId", sql.UniqueIdentifier, documentId)
      .input("mappingResult", sql.NVarChar, JSON.stringify(mappingResultJson))
      .input("promptUsed", sql.NVarChar, headerMappingPrompt)
      .input("promptTokens", sql.Int, promptTokens)
      .input("completionTokens", sql.Int, completionTokens)
      .input("totalTokens", sql.Int, totalTokens)
      .input("aiCost", sql.Decimal(10, 6), aiCost)
      .input("productCount", sql.Int, products.length)
      .input("vendorName", sql.NVarChar, mappingResult.vendor || document.vendor_name).query(`
        UPDATE vvocr.document_processing_results 
        SET 
            llm_mapping_result = @mappingResult,
            ai_model_used = 'gpt-4o',
            ai_prompt_used = @promptUsed,
            ai_prompt_tokens = @promptTokens,
            ai_completion_tokens = @completionTokens,
            ai_total_tokens = @totalTokens,
            ai_model_cost_usd = @aiCost,
            product_count = @productCount,
            vendor_name = @vendorName,
            processing_status = 'completed',
            processing_completed_at = GETUTCDATE(),
            updated_at = GETUTCDATE()
        WHERE result_id = @documentId
      `);

    await pool.close();

    context.log(`✅ AI Product Mapping complete for ${document.document_name}`);

    return {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        message: "AI product mapping completed successfully",
        documentId,
        vendor: mappingResult.vendor || document.vendor_name,
        productCount: products.length,
        processingDuration,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens,
        },
        cost: aiCost,
      }),
    };
  } catch (error: any) {
    context.error(`Error in AI product mapping: ${error.message}`);
    context.error(`Error stack: ${error.stack}`);

    // Update database with failure status
    if (pool) {
      try {
        const body = (await req.json()) as any;
        await pool
          .request()
          .input("documentId", sql.UniqueIdentifier, body.documentId)
          .input("error", sql.NVarChar, error.message).query(`
            UPDATE vvocr.document_processing_results 
            SET 
                processing_status = 'failed',
                error_message = @error,
                updated_at = GETUTCDATE()
            WHERE result_id = @documentId
          `);
        await pool.close();
      } catch (dbError) {
        context.error(`Failed to update error status: ${dbError}`);
      }
    }

    return {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ error: error.message }),
    };
  }
}

app.http("aiProductMapper", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  handler: async (request: HttpRequest, context: InvocationContext) => {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      };
    }
    return aiProductMapperHandler(request, context);
  },
});
