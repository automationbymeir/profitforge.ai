import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { BlobServiceClient } from "@azure/storage-blob";
import {
  checkDailyUploadLimit,
  checkIpRateLimit,
  cleanupOldUsageRecords,
  getUsageStats,
  incrementDailyUploadCount,
  incrementIpUploadCount,
  initializeUsageTable,
} from "../utils/usageTracker.js";

import sql from "mssql";
import { getVendorFileName, validateVendorName } from "../utils/validations.js";

// Inline vendor path helper
function getVendorPath(vendorName: string): string {
  return vendorName;
}

// Initialize table on cold start - in client this is also executed!
initializeUsageTable().catch((err) => console.error("Failed to init usage table:", err));

// Connection strings from environment variables
const STORAGE_ACCOUNT_NAME = process.env.STORAGE_ACCOUNT_NAME;
const STORAGE_CONTAINER_DOCUMENTS = process.env.STORAGE_CONTAINER_DOCUMENTS || "uploads";
const SQL_CONNECTION_STRING = process.env.SQL_CONNECTION_STRING;

// Allowed file types for upload (PDF only for production POC)
const ALLOWED_FILE_TYPES = ["application/pdf"];

/**
 * Validate API key for demo mode protection
 * Returns true if valid or if demo mode is disabled (client mode)
 */
function validateApiKey(providedKey: string | null): { valid: boolean; error?: string } {
  if (!providedKey) {
    return {
      valid: false,
      error: "Missing API key. Include x-api-key header.",
    };
  }

  if (providedKey !== process.env.DEMO_API_KEY) {
    return {
      valid: false,
      error: "Invalid API key",
    };
  }

  return { valid: true };
}

/**
 * Validate file size against configured limit
 */
function validateFileSize(fileSize: number): boolean {
  const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || "0");

  const maxBytes = MAX_FILE_SIZE_MB * 1024 * 1024;

  return fileSize > maxBytes ? false : true;
}

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
  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  if (process.env.IS_DEMO_MODE === "true") {
    // 🛡️ SECURITY CHECK 1: Validate API Key (demo mode only)
    const apiKeyCheck = validateApiKey(req.headers.get("x-api-key"));
    if (!apiKeyCheck.valid) {
      context.warn(`API key validation failed: ${apiKeyCheck.error}`);
      return {
        status: 401,
        jsonBody: {
          error: apiKeyCheck.error,
          message: "This demo requires an API key. Contact the owner for access.",
        },
      };
    }

    // 🛡️ SECURITY CHECK 2: IP-based rate limit (per hour, demo mode only)
    const ipRateCheck = await checkIpRateLimit(clientIp);
    if (!ipRateCheck.allowed) {
      context.warn(
        `IP rate limit exceeded for ${clientIp}: ${ipRateCheck.current}/${ipRateCheck.limit}`
      );
      return {
        status: 429,
        jsonBody: {
          error: "Rate limit exceeded",
          current: ipRateCheck.current,
          limit: ipRateCheck.limit,
          resetTime: ipRateCheck.resetTime,
          message: `Too many uploads from your IP. Limit: ${ipRateCheck.limit} per hour. Resets at ${ipRateCheck.resetTime}.`,
        },
      };
    }

    // 🛡️ SECURITY CHECK 3: Daily upload limit (before parsing large files)
    const limitCheck = await checkDailyUploadLimit();
    if (!limitCheck.allowed) {
      context.log(`Daily limit reached: ${limitCheck.current}/${limitCheck.limit}`);
      return {
        status: 429,
        jsonBody: {
          error: "Daily upload limit reached",
          current: limitCheck.current,
          limit: limitCheck.limit,
          resetTime: "midnight UTC",
          message:
            "This is a demo environment with daily limits. Try again tomorrow or contact for production access.",
        },
      };
    }
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const vendorName = formData.get("vendorName") as string;

    if (!file || !vendorName) {
      return {
        status: 400,
        jsonBody: {
          error: "Missing file or vendor name in request",
        },
      };
    }
    // VALIDATION: Vendor name format
    const vendorValidation = validateVendorName(vendorName);
    if (!vendorValidation.valid) {
      return {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          error: "Invalid vendor name format",
          message: vendorValidation.error,
        }),
      };
    }
    // Validate file type
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      return {
        status: 400,
        jsonBody: {
          error: `Unsupported file type: ${file.type}. Only PDF files are allowed.`,
        },
      };
    }

    // 🛡️ SECURITY CHECK 3: File size limit (demo mode only)
    if (process.env.IS_DEMO_MODE === "true" && validateFileSize(file.size) === false) {
      return {
        status: 413,
        jsonBody: {
          error: "File size exceeds limit",
          message: `This is a demo environment with file size limits of up to ${process.env.MAX_FILE_SIZE_MB}MB.`,
        },
      };
    }

    // Get standardized file name (e.g., BETTER_LIVING-11-25.pdf)
    const standardFileName = getVendorFileName(vendorName);
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const filePath = `${getVendorPath(vendorName)}/${standardFileName}`;

    // CHECK FOR DUPLICATE: One-to-one mapping enforcement
    let pool = new sql.ConnectionPool(SQL_CONNECTION_STRING!);
    await pool.connect();

    const existingCheck = await pool.request().input("vendorName", sql.NVarChar, vendorName).query(`
        SELECT result_id, document_name, processing_status
        FROM vvocr.document_processing_results
        WHERE vendor_name = @vendorName
      `);

    if (existingCheck.recordset.length > 0) {
      await pool.close();
      const existing = existingCheck.recordset[0];
      return {
        status: 409, // Conflict
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        jsonBody: {
          error: "Vendor already exists",
          message: `A document already exists for vendor ${vendorName}. Please delete the existing document first using DELETE /api/deleteVendor?vendorName=${vendorName}`,
          existingDocument: {
            resultId: existing.result_id,
            documentName: existing.document_name,
            status: existing.processing_status,
          },
        },
      };
    }

    await pool.close();

    // 1. Upload to Blob Storage
    const blobServiceClient = BlobServiceClient.fromConnectionString(
      process.env.STORAGE_CONNECTION_STRING!
    );
    const containerClient = blobServiceClient.getContainerClient(STORAGE_CONTAINER_DOCUMENTS);
    const blockBlobClient = containerClient.getBlockBlobClient(filePath);

    await blockBlobClient.upload(fileBuffer, fileBuffer.length);

    // 2. Register in Database
    pool = new sql.ConnectionPool(SQL_CONNECTION_STRING!);
    await pool.connect();

    try {
      const result = await pool
        .request()
        .input("vendorName", sql.NVarChar, vendorName)
        .input("documentName", sql.NVarChar, standardFileName)
        .input("documentPath", sql.NVarChar, filePath)
        .input("fileSize", sql.BigInt, fileBuffer.length)
        .input("fileType", sql.NVarChar, file.type).query(`
                  INSERT INTO vvocr.document_processing_results 
                  (document_name, document_path, document_size_bytes, document_type, processing_status, vendor_name)
                  OUTPUT INSERTED.result_id
                  VALUES (@documentName, @documentPath, @fileSize, @fileType, 'pending', @vendorName)
              `);

      const resultId = result.recordset[0].result_id;
      await pool.close();

      // Increment usage counters (both daily and IP-based)
      await incrementDailyUploadCount();
      await incrementIpUploadCount(clientIp);

      return {
        status: 201,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, x-api-key",
        },
        jsonBody: {
          message: "Document uploaded successfully",
          resultId,
          documentName: standardFileName,
          vendorName: vendorName,
          filePath,
          status: "pending",
        },
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
      jsonBody: { error: error.message },
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
    const vendorName = req.query.get("vendorName");

    if (!vendorName) {
      return {
        status: 400,
        body: "Missing vendorName query parameter",
      };
    }

    // 1. Get all documents for vendor from database
    const pool = new sql.ConnectionPool(SQL_CONNECTION_STRING!);
    await pool.connect();

    try {
      const result = await pool.request().input("vendorName", sql.NVarChar, vendorName).query(`
          SELECT result_id, document_path 
          FROM vvocr.document_processing_results 
          WHERE vendor_name = @vendorName
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
            message: `No documents found for vendor: ${vendorName}`,
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
      const deleteResult = await pool.request().input("vendorName", sql.NVarChar, vendorName)
        .query(`
          DELETE FROM vvocr.document_processing_results 
          WHERE vendor_name = @vendorName
        `);

      await pool.close();

      return {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          message: `Vendor ${vendorName} deleted successfully`,
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

    // Find the root parent (creates a tree structure where all versions point to the original)
    // If this document has a parent, that's the root. Otherwise, this document is the root.
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
        newResultId: newDocumentId,
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
 * 2. Retrieve ai_mapping_result from document_processing_results
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
            ai_mapping_result,
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

      // Check if already exported (idempotency)
      if (document.export_status === "confirmed") {
        await pool.close();
        context.log(`ℹ️ Document ${documentId} already confirmed, skipping re-export`);

        const mappingData = JSON.parse(document.ai_mapping_result || "{}");
        const productsCount = (mappingData.products || []).length;

        return {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
          body: JSON.stringify({
            message: "Products already exported (idempotent operation)",
            documentId,
            vendor: document.vendor_name,
            productsExported: productsCount,
          }),
        };
      }

      if (!document.ai_mapping_result) {
        await pool.close();
        return {
          status: 400,
          body: JSON.stringify({ error: "No mapping result available to export" }),
        };
      }

      const mappingData = JSON.parse(document.ai_mapping_result);
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

/**
 * Get Version History Handler - HTTP GET endpoint for document versions
 *
 * PROCESS:
 * 1. Extract documentId from query parameters
 * 2. Determine root parent ID (original document)
 * 3. Query all versions in the reprocessing chain
 * 4. Return array of all versions with metadata
 *
 * USE CASE:
 * - View history of AI mapping attempts
 * - Compare confidence scores across versions
 * - Select previous version for export
 */
export async function getVersionHistoryHandler(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log(`Get version history request received`);

  try {
    const documentId = req.query.get("documentId");

    if (!documentId) {
      return {
        status: 400,
        body: JSON.stringify({ error: "Missing documentId query parameter" }),
      };
    }

    const pool = new sql.ConnectionPool(SQL_CONNECTION_STRING!);
    await pool.connect();

    try {
      // First, get the document to find its root parent
      const rootResult = await pool.request().input("documentId", sql.UniqueIdentifier, documentId)
        .query(`
          SELECT 
            result_id,
            parent_document_id,
            reprocessing_count
          FROM vvocr.document_processing_results
          WHERE result_id = @documentId
        `);

      if (rootResult.recordset.length === 0) {
        await pool.close();
        return {
          status: 404,
          body: JSON.stringify({ error: "Document not found" }),
        };
      }

      const doc = rootResult.recordset[0];
      const rootParentId = doc.parent_document_id || doc.result_id;

      // Get all versions in the chain
      const versionsResult = await pool
        .request()
        .input("rootParentId", sql.UniqueIdentifier, rootParentId).query(`
          SELECT 
            result_id,
            document_name,
            vendor_name,
            processing_status,
            export_status,
            reprocessing_count,
            parent_document_id,
            product_count,
            ai_confidence_score,
            ai_completeness_score,
            ai_model_cost_usd,
            doc_intel_cost_usd,
            created_at,
            processing_completed_at,
            exported_at
          FROM vvocr.document_processing_results
          WHERE result_id = @rootParentId OR parent_document_id = @rootParentId
          ORDER BY reprocessing_count ASC
        `);

      await pool.close();

      return {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          rootDocumentId: rootParentId,
          currentDocumentId: documentId,
          totalVersions: versionsResult.recordset.length,
          versions: versionsResult.recordset,
        }),
      };
    } catch (error: any) {
      await pool.close();
      throw error;
    }
  } catch (error: any) {
    context.error(`Error getting version history: ${error.message}`);
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

app.http("getVersionHistory", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  handler: async (request: HttpRequest, context: InvocationContext) => {
    if (request.method === "OPTIONS") {
      return {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      };
    }
    return getVersionHistoryHandler(request, context);
  },
});

/**
 * Delete Specific Run Handler - HTTP DELETE endpoint for single version
 *
 * PROCESS:
 * 1. Extract documentId from query parameters
 * 2. Verify it's not the root document (prevent orphaning)
 * 3. Delete the specific run from database
 * 4. Bronze-layer blobs are retained for audit
 *
 * RESTRICTIONS:
 * - Cannot delete root/original document (use deleteDocument instead)
 * - Only deletes the specific reprocessing run
 */
export async function deleteRunHandler(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log(`Delete run request received`);

  try {
    const documentId = req.query.get("documentId");

    if (!documentId) {
      return {
        status: 400,
        body: JSON.stringify({ error: "Missing documentId query parameter" }),
      };
    }

    const pool = new sql.ConnectionPool(SQL_CONNECTION_STRING!);
    await pool.connect();

    try {
      // Check if this is a reprocessed version (has parent_document_id)
      const checkResult = await pool.request().input("documentId", sql.UniqueIdentifier, documentId)
        .query(`
          SELECT 
            result_id,
            parent_document_id,
            reprocessing_count,
            document_name
          FROM vvocr.document_processing_results
          WHERE result_id = @documentId
        `);

      if (checkResult.recordset.length === 0) {
        await pool.close();
        return {
          status: 404,
          body: JSON.stringify({ error: "Document not found" }),
        };
      }

      const doc = checkResult.recordset[0];

      if (!doc.parent_document_id) {
        await pool.close();
        return {
          status: 400,
          body: JSON.stringify({
            error:
              "Cannot delete root document. Use DELETE /api/deleteDocument to delete the entire document with all versions.",
          }),
        };
      }

      // Delete the specific run
      await pool.request().input("documentId", sql.UniqueIdentifier, documentId).query(`
          DELETE FROM vvocr.document_processing_results
          WHERE result_id = @documentId
        `);

      await pool.close();

      context.log(`✅ Deleted run version ${doc.reprocessing_count} for ${doc.document_name}`);

      return {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          message: `Run version ${doc.reprocessing_count} deleted successfully`,
          documentId,
          version: doc.reprocessing_count,
        }),
      };
    } catch (error: any) {
      await pool.close();
      throw error;
    }
  } catch (error: any) {
    context.error(`Error deleting run: ${error.message}`);
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

app.http("deleteRun", {
  methods: ["DELETE", "OPTIONS"],
  authLevel: "anonymous",
  handler: async (request: HttpRequest, context: InvocationContext) => {
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
    return deleteRunHandler(request, context);
  },
});

/**
 * Delete Document Handler - HTTP DELETE endpoint to remove document and ALL versions
 *
 * PROCESS:
 * 1. Extract documentId from query parameters
 * 2. Determine root parent ID
 * 3. Delete blob from storage (original PDF)
 * 4. Delete ALL database records (root + all reprocessing versions)
 * 5. Return summary
 *
 * USE CASE:
 * - Complete removal of document and processing history
 * - Deletes all versions in the reprocessing chain
 */
export async function deleteDocumentHandler(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log(`Delete document request received`);

  try {
    const documentId = req.query.get("documentId");

    if (!documentId) {
      return {
        status: 400,
        body: JSON.stringify({ error: "Missing documentId query parameter" }),
      };
    }

    const pool = new sql.ConnectionPool(SQL_CONNECTION_STRING!);
    await pool.connect();

    try {
      // Get document info and determine root parent
      const docResult = await pool.request().input("documentId", sql.UniqueIdentifier, documentId)
        .query(`
          SELECT 
            result_id,
            parent_document_id,
            document_path,
            document_name
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

      const doc = docResult.recordset[0];
      const rootParentId = doc.parent_document_id || doc.result_id;

      // Delete blob from storage (original PDF)
      const blobServiceClient = BlobServiceClient.fromConnectionString(
        process.env.STORAGE_CONNECTION_STRING!
      );
      const containerClient = blobServiceClient.getContainerClient(STORAGE_CONTAINER_DOCUMENTS);

      try {
        const blockBlobClient = containerClient.getBlockBlobClient(doc.document_path);
        await blockBlobClient.delete();
        context.log(`✅ Deleted blob: ${doc.document_path}`);
      } catch (blobError: any) {
        context.warn(`Failed to delete blob ${doc.document_path}: ${blobError.message}`);
      }

      // Delete ALL database records (root + all versions)
      const deleteResult = await pool
        .request()
        .input("rootParentId", sql.UniqueIdentifier, rootParentId).query(`
          DELETE FROM vvocr.document_processing_results
          WHERE result_id = @rootParentId OR parent_document_id = @rootParentId
        `);

      await pool.close();

      context.log(
        `✅ Deleted document ${doc.document_name} with ${deleteResult.rowsAffected[0]} total versions`
      );

      return {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          message: "Document and all versions deleted successfully",
          documentName: doc.document_name,
          versionsDeleted: deleteResult.rowsAffected[0],
        }),
      };
    } catch (error: any) {
      await pool.close();
      throw error;
    }
  } catch (error: any) {
    context.error(`Error deleting document: ${error.message}`);
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

app.http("deleteDocument", {
  methods: ["DELETE", "OPTIONS"],
  authLevel: "anonymous",
  handler: async (request: HttpRequest, context: InvocationContext) => {
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
    return deleteDocumentHandler(request, context);
  },
});

/**
 * Demo endpoint for usage tracking cleanup and stats
 *
 * GET /api/demo/usage - Get usage statistics
 * POST /api/demo/cleanup?daysToKeep=30 - Trigger cleanup
 *
 */
async function demoUsageHandler(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    if (req.method === "GET") {
      // Get usage stats
      const stats = await getUsageStats();
      return {
        status: 200,
        jsonBody: {
          stats,
          message: "Usage statistics retrieved",
        },
      };
    } else if (req.method === "POST") {
      // Trigger cleanup
      const daysToKeep = parseInt(req.query.get("daysToKeep") || "30");

      context.log(`🧹 Cleanup triggered: keeping ${daysToKeep} days`);

      const statsBefore = await getUsageStats();
      const cleanupResult = await cleanupOldUsageRecords(daysToKeep);
      const statsAfter = await getUsageStats();

      return {
        status: 200,
        jsonBody: {
          message: "Cleanup completed successfully",
          daysRetained: daysToKeep,
          deleted: cleanupResult,
          before: statsBefore,
          after: statsAfter,
        },
      };
    }

    return {
      status: 405,
      jsonBody: { error: "Method not allowed" },
    };
  } catch (error: any) {
    context.error("Demo operation failed:", error);
    return {
      status: 500,
      jsonBody: {
        error: "Demo operation failed",
        details: error.message,
      },
    };
  }
}

app.http("demoUsage", {
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "demo/usage",
  handler: async (request: HttpRequest, context: InvocationContext) => {
    if (request.method === "OPTIONS") {
      return {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      };
    }
    return demoUsageHandler(request, context);
  },
});
