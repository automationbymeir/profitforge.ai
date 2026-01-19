import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { BlobServiceClient } from "@azure/storage-blob";
import * as crypto from "crypto";
import sql from "mssql";

// Inline vendor path helper
function getVendorPath(vendorName: string): string {
  return vendorName;
}

// Connection strings from environment variables
const STORAGE_ACCOUNT_NAME = process.env.STORAGE_ACCOUNT_NAME;
const STORAGE_CONTAINER_DOCUMENTS = process.env.STORAGE_CONTAINER_DOCUMENTS || "uploads";
const SQL_CONNECTION_STRING = process.env.SQL_CONNECTION_STRING;

// Allowed file types for upload (PDF only for production POC)
const ALLOWED_FILE_TYPES = ["application/pdf"];

/**
 * Upload Handler - HTTP POST endpoint for document uploads
 *
 * STEP-BY-STEP PROCESS:
 * 1. Extract file and vendorId from multipart form data
 * 2. Validate that both file and vendorId are present
 * 3. Validate file type against allowed types (PDF, images, Excel, CSV)
 * 4. Generate unique file path: {vendorId}/{uuid}-{filename}
 * 5. Upload file buffer to Azure Blob Storage ("uploads" container)
 * 6. Create database record in vvocr.document_processing_results table
 *    - Status: 'pending' (waiting for blob trigger to process)
 *    - Stores: document_name, document_path, file_size, file_type
 * 7. Return 201 Created with resultId, filePath, and vendorId
 *
 * ERROR HANDLING:
 * - 400 Bad Request: Missing file/vendorId or unsupported file type
 * - 500 Internal Server Error: Blob upload or database errors
 * - Always closes database connection pool in finally block
 *
 * TRIGGERS NEXT STEP:
 * - Blob upload triggers processDocument function via blob trigger
 */
export async function uploadHandler(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log(`Processing upload request for ${req.url}`);

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const vendorId = formData.get("vendorId") as string;

    if (!file || !vendorId) {
      return {
        status: 400,
        body: "Missing file or vendorId in request",
      };
    }

    // Validate file type
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      return {
        status: 400,
        body: `Unsupported file type: ${file.type}. Only PDF files are allowed.`,
      };
    }

    const fileName = file.name;
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const filePath = `${getVendorPath(vendorId)}/${crypto.randomUUID()}-${fileName}`;

    // 1. Upload to Blob Storage
    const blobServiceClient = BlobServiceClient.fromConnectionString(
      process.env.STORAGE_CONNECTION_STRING!
    );
    const containerClient = blobServiceClient.getContainerClient(STORAGE_CONTAINER_DOCUMENTS);
    const blockBlobClient = containerClient.getBlockBlobClient(filePath);

    await blockBlobClient.upload(fileBuffer, fileBuffer.length);

    // 2. Register in Database
    const pool = new sql.ConnectionPool(SQL_CONNECTION_STRING!);
    await pool.connect();

    try {
      const result = await pool
        .request()
        .input("vendorId", sql.NVarChar, vendorId)
        .input("documentName", sql.NVarChar, fileName)
        .input("documentPath", sql.NVarChar, filePath)
        .input("fileSize", sql.BigInt, fileBuffer.length)
        .input("fileType", sql.NVarChar, file.type).query(`
                  INSERT INTO vvocr.document_processing_results 
                  (document_name, document_path, document_size_bytes, document_type, processing_status, vendor_name)
                  OUTPUT INSERTED.result_id
                  VALUES (@documentName, @documentPath, @fileSize, @fileType, 'pending', @vendorId)
              `);

      const resultId = result.recordset[0].result_id;
      await pool.close();

      return {
        status: 201,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
        body: JSON.stringify({
          message: "Document uploaded successfully",
          resultId,
          filePath,
          vendorId,
        }),
      };
    } catch (dbError: any) {
      await pool.close();
      throw new Error(`Database error: ${dbError.message}`);
    }
  } catch (error: any) {
    context.error(`Error processing upload: ${error.message}`);
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

app.http("upload", {
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
    return uploadHandler(request, context);
  },
});

/**
 * Delete Vendor Handler - HTTP DELETE endpoint for vendor cleanup
 *
 * PROCESS:
 * 1. Extract vendorId from query parameters
 * 2. Query database for all documents belonging to vendor
 * 3. Delete all blob files from Azure Storage
 * 4. Delete all database records for vendor
 * 5. Return summary of deleted items
 *
 * ERROR HANDLING:
 * - 400 Bad Request: Missing vendorId
 * - 404 Not Found: No documents found for vendor
 * - 500 Internal Server Error: Blob or database errors
 */
export async function deleteVendorHandler(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log(`Processing delete request for ${req.url}`);

  try {
    const vendorId = req.query.get("vendorId");

    if (!vendorId) {
      return {
        status: 400,
        body: "Missing vendorId query parameter",
      };
    }

    // 1. Get all documents for vendor from database
    const pool = new sql.ConnectionPool(SQL_CONNECTION_STRING!);
    await pool.connect();

    try {
      const result = await pool.request().input("vendorId", sql.NVarChar, vendorId).query(`
          SELECT result_id, document_path 
          FROM vvocr.document_processing_results 
          WHERE vendor_name = @vendorId
        `);

      const documents = result.recordset;

      if (documents.length === 0) {
        await pool.close();
        return {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
          body: JSON.stringify({
            message: `No documents found for vendor: ${vendorId}`,
          }),
        };
      }

      // 2. Delete blobs from storage
      const blobServiceClient = BlobServiceClient.fromConnectionString(
        process.env.STORAGE_CONNECTION_STRING!
      );
      const containerClient = blobServiceClient.getContainerClient(STORAGE_CONTAINER_DOCUMENTS);

      let blobsDeleted = 0;
      for (const doc of documents) {
        try {
          const blockBlobClient = containerClient.getBlockBlobClient(doc.document_path);
          await blockBlobClient.delete();
          blobsDeleted++;
        } catch (blobError: any) {
          context.warn(`Failed to delete blob ${doc.document_path}: ${blobError.message}`);
        }
      }

      // 3. Delete database records
      const deleteResult = await pool.request().input("vendorId", sql.NVarChar, vendorId).query(`
          DELETE FROM vvocr.document_processing_results 
          WHERE vendor_name = @vendorId
        `);

      await pool.close();

      return {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          message: `Vendor ${vendorId} deleted successfully`,
          documentsDeleted: deleteResult.rowsAffected[0],
          blobsDeleted,
        }),
      };
    } catch (error: any) {
      await pool.close();
      throw error;
    }
  } catch (error: any) {
    context.error(`Error deleting vendor: ${error.message}`);
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

app.http("deleteVendor", {
  methods: ["DELETE", "OPTIONS"],
  authLevel: "anonymous",
  handler: async (request: HttpRequest, context: InvocationContext) => {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      };
    }
    return deleteVendorHandler(request, context);
  },
});

/**
 * Reprocess Mapping Handler - HTTP POST endpoint to rerun AI mapping
 *
 * IMMUTABLE RECORD STRATEGY:
 * 1. Extract document_id from request body
 * 2. Query existing record to get OCR data and reprocessing_count
 * 3. Create NEW record with:
 *    - Fresh result_id (new UUID)
 *    - parent_document_id = original document_id
 *    - Copied OCR data (doc_intel_* fields)
 *    - reprocessing_count = parent's count + 1
 *    - status = 'ocr_complete' (ready for AI mapping)
 * 4. Queue AI mapping for the NEW record
 * 5. Return new document_id
 *
 * BRONZE-LAYER BENEFITS:
 * - Original record never modified (immutable)
 * - Full audit trail of all attempts
 * - Each version has its own costs, prompts, results
 * - Easy A/B testing and rollback
 * - Clear versioning via reprocessing_count
 */
export async function reprocessMappingHandler(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log(`Reprocess mapping request received`);

  try {
    const body = (await req.json()) as any;
    const documentId = body.documentId;

    if (!documentId) {
      return {
        status: 400,
        body: JSON.stringify({ error: "Missing documentId in request body" }),
      };
    }

    const pool = new sql.ConnectionPool(SQL_CONNECTION_STRING!);
    await pool.connect();

    // Get existing record to copy OCR data and determine version
    const existingResult = await pool
      .request()
      .input("documentId", sql.UniqueIdentifier, documentId).query(`
        SELECT 
          document_name,
          document_path,
          document_size_bytes,
          document_type,
          vendor_name,
          doc_intel_extracted_text,
          doc_intel_structured_data,
          doc_intel_confidence_score,
          doc_intel_page_count,
          doc_intel_table_count,
          doc_intel_cost_usd,
          doc_intel_prompt_used,
          reprocessing_count,
          parent_document_id
        FROM vvocr.document_processing_results
        WHERE result_id = @documentId
      `);

    if (existingResult.recordset.length === 0) {
      await pool.close();
      return {
        status: 404,
        body: JSON.stringify({ error: "Document not found" }),
      };
    }

    const existing = existingResult.recordset[0];

    // Determine the root parent (walk up the chain if this is already a reprocessed version)
    const rootParentId = existing.parent_document_id || documentId;
    const newVersion = (existing.reprocessing_count || 0) + 1;

    // Create new immutable record
    const newRecordResult = await pool
      .request()
      .input("documentName", sql.NVarChar, existing.document_name)
      .input("documentPath", sql.NVarChar, existing.document_path)
      .input("documentSize", sql.BigInt, existing.document_size_bytes)
      .input("documentType", sql.NVarChar, existing.document_type)
      .input("vendorName", sql.NVarChar, existing.vendor_name)
      .input("extractedText", sql.NVarChar, existing.doc_intel_extracted_text)
      .input("structuredData", sql.NVarChar, existing.doc_intel_structured_data)
      .input("confidenceScore", sql.Decimal(5, 4), existing.doc_intel_confidence_score)
      .input("pageCount", sql.Int, existing.doc_intel_page_count)
      .input("tableCount", sql.Int, existing.doc_intel_table_count)
      .input("docIntelCost", sql.Decimal(10, 6), existing.doc_intel_cost_usd)
      .input("docIntelPrompt", sql.NVarChar, existing.doc_intel_prompt_used)
      .input("parentDocumentId", sql.UniqueIdentifier, rootParentId)
      .input("reprocessingCount", sql.Int, newVersion).query(`
        INSERT INTO vvocr.document_processing_results (
          document_name,
          document_path,
          document_size_bytes,
          document_type,
          vendor_name,
          doc_intel_extracted_text,
          doc_intel_structured_data,
          doc_intel_confidence_score,
          doc_intel_page_count,
          doc_intel_table_count,
          doc_intel_cost_usd,
          doc_intel_prompt_used,
          parent_document_id,
          reprocessing_count,
          processing_status,
          export_status
        )
        OUTPUT INSERTED.result_id
        VALUES (
          @documentName,
          @documentPath,
          @documentSize,
          @documentType,
          @vendorName,
          @extractedText,
          @structuredData,
          @confidenceScore,
          @pageCount,
          @tableCount,
          @docIntelCost,
          @docIntelPrompt,
          @parentDocumentId,
          @reprocessingCount,
          'ocr_complete',
          'pending'
        )
      `);

    const newDocumentId = newRecordResult.recordset[0].result_id;

    await pool.close();

    context.log(
      `✅ Created new version record: ${newDocumentId} (v${newVersion} of ${rootParentId})`
    );

    return {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        message: `New version created for remapping (v${newVersion})`,
        originalDocumentId: documentId,
        newDocumentId: newDocumentId,
        version: newVersion,
        parentDocumentId: rootParentId,
        nextStep: "AI mapping will be queued automatically",
      }),
    };
  } catch (error: any) {
    context.error(`Error reprocessing mapping: ${error.message}`);
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

app.http("reprocessMapping", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  handler: async (request: HttpRequest, context: InvocationContext) => {
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
    return reprocessMappingHandler(request, context);
  },
});

/**
 * Confirm Mapping Handler - HTTP POST endpoint to export products to production
 *
 * PROCESS:
 * 1. Extract document_id from request body
 * 2. Retrieve llm_mapping_result from document_processing_results
 * 3. Insert products into vvocr.vendor_products (production table)
 * 4. Update export_status to 'confirmed'
 * 5. Return confirmation with product count
 *
 * USE CASE:
 * - Manual approval after reviewing AI-extracted products
 * - Exports validated data to production catalog
 * - Enables bronze-to-silver data promotion workflow
 */
export async function confirmMappingHandler(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log(`Confirm mapping request received`);

  try {
    const body = (await req.json()) as any;
    const documentId = body.documentId;

    if (!documentId) {
      return {
        status: 400,
        body: JSON.stringify({ error: "Missing documentId in request body" }),
      };
    }

    const pool = new sql.ConnectionPool(SQL_CONNECTION_STRING!);
    await pool.connect();

    try {
      // 1. Retrieve document and mapping result
      const docResult = await pool.request().input("documentId", sql.UniqueIdentifier, documentId)
        .query(`
          SELECT 
            result_id,
            document_name,
            vendor_name,
            llm_mapping_result,
            processing_status,
            export_status
          FROM vvocr.document_processing_results 
          WHERE result_id = @documentId
        `);

      if (docResult.recordset.length === 0) {
        await pool.close();
        return {
          status: 404,
          body: JSON.stringify({ error: "Document not found" }),
        };
      }

      const document = docResult.recordset[0];

      if (document.processing_status !== "completed") {
        await pool.close();
        return {
          status: 400,
          body: JSON.stringify({
            error: `Document status is '${document.processing_status}'. Must be 'completed' to confirm.`,
          }),
        };
      }

      if (!document.llm_mapping_result) {
        await pool.close();
        return {
          status: 400,
          body: JSON.stringify({ error: "No mapping result available to export" }),
        };
      }

      const mappingData = JSON.parse(document.llm_mapping_result);
      const products = mappingData.products || [];

      if (products.length === 0) {
        await pool.close();
        return {
          status: 400,
          body: JSON.stringify({ error: "No products found in mapping result" }),
        };
      }

      // 2. Insert products into production table
      let insertedCount = 0;
      for (const product of products) {
        await pool
          .request()
          .input("vendorId", sql.NVarChar, document.vendor_name)
          .input("vendorName", sql.NVarChar, document.vendor_name)
          .input("productName", sql.NVarChar, product.name)
          .input("sku", sql.NVarChar, product.sku)
          .input("price", sql.Decimal(18, 4), product.price)
          .input("unit", sql.NVarChar, product.unit || null)
          .input("description", sql.NVarChar, product.description || null)
          .input("sourceDocId", sql.UniqueIdentifier, documentId)
          .input("sourceDocName", sql.NVarChar, document.document_name).query(`
            INSERT INTO vvocr.vendor_products 
            (vendor_id, vendor_name, product_name, sku, price, unit, description, source_document_id, source_document_name)
            VALUES 
            (@vendorId, @vendorName, @productName, @sku, @price, @unit, @description, @sourceDocId, @sourceDocName)
          `);
        insertedCount++;
      }

      // 3. Update export status
      await pool.request().input("documentId", sql.UniqueIdentifier, documentId).query(`
          UPDATE vvocr.document_processing_results 
          SET 
              export_status = 'confirmed',
              exported_at = GETUTCDATE(),
              updated_at = GETUTCDATE()
          WHERE result_id = @documentId
        `);

      await pool.close();

      context.log(
        `✅ Exported ${insertedCount} products to production for ${document.document_name}`
      );

      return {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          message: "Products exported to production successfully",
          documentId,
          vendor: document.vendor_name,
          productsExported: insertedCount,
        }),
      };
    } catch (error: any) {
      await pool.close();
      throw error;
    }
  } catch (error: any) {
    context.error(`Error confirming mapping: ${error.message}`);
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

app.http("confirmMapping", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  handler: async (request: HttpRequest, context: InvocationContext) => {
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
    return confirmMappingHandler(request, context);
  },
});
