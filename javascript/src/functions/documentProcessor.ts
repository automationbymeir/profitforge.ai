import { AzureKeyCredential, DocumentAnalysisClient } from "@azure/ai-form-recognizer";
import { app, InvocationContext } from "@azure/functions";
import * as sql from "mssql";
import { OpenAI } from "openai";

// Connection strings from environment variables
const SQL_CONNECTION_STRING = process.env.SQL_CONNECTION_STRING;
const DOCUMENT_INTELLIGENCE_ENDPOINT = process.env.DOCUMENT_INTELLIGENCE_ENDPOINT;
const DOCUMENT_INTELLIGENCE_KEY = process.env.DOCUMENT_INTELLIGENCE_KEY;
const AI_PROJECT_ENDPOINT = process.env.AI_PROJECT_ENDPOINT;
const AI_PROJECT_KEY = process.env.AI_PROJECT_KEY;
const STORAGE_CONTAINER_DOCUMENTS = process.env.STORAGE_CONTAINER_DOCUMENTS || "df-documents";

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
    const pool = await sql.connect(SQL_CONNECTION_STRING!);

    const relativePath = blobPath.split("/").slice(1).join("/");

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

    context.log(`Database updated for ${relativePath}. Starting LLM Mapping.`);

    // 3. LLM Mapping logic
    if (!AI_PROJECT_ENDPOINT || !AI_PROJECT_KEY) {
      throw new Error("Missing AI project configuration");
    }

    const openai = new OpenAI({
      apiKey: AI_PROJECT_KEY,
      baseURL: `${AI_PROJECT_ENDPOINT}/openai/deployments/gpt-4o`,
      defaultQuery: { "api-version": "2024-02-15-preview" },
      defaultHeaders: { "api-key": AI_PROJECT_KEY },
    });

    const prompt = `
        You are a data extraction expert. I am providing you with the OCR output of a vendor catalog page.
        Extract all products, their prices, and any relevant metadata into a structured JSON format.

        SCHEMA:
        {
          "vendor": "string",
          "products": [
            {
              "sku": "string",
              "name": "string",
              "price": "number",
              "unit": "string",
              "description": "string"
            }
          ]
        }

        OCR OUTPUT:
        ${content?.substring(0, 10000)}

        Return only the JSON object.
        `;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const mappingResult = completion.choices[0].message.content;
    context.log(`LLM Mapping complete for ${relativePath}`);

    // 4. Final update with LLM results
    await pool
      .request()
      .input("documentPath", sql.NVarChar, relativePath)
      .input("mappingResult", sql.NVarChar, mappingResult).query(`
                UPDATE vvocr.document_processing_results 
                SET 
                    llm_mapping_result = @mappingResult,
                    processing_status = 'completed',
                    updated_at = GETUTCDATE()
                WHERE document_path = @documentPath
            `);

    context.log(`Processing successfully completed for ${relativePath}`);
  } catch (error: any) {
    context.error(`Error processing document: ${error.message}`);

    // Update database with failure status
    try {
      const pool = await sql.connect(SQL_CONNECTION_STRING!);
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
