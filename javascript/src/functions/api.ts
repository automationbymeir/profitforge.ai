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

// Allowed file types for upload
const ALLOWED_FILE_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/tiff",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // .xls
  "text/csv",
];

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
        body: `Unsupported file type: ${file.type}. Allowed types: PDF, images (JPEG, PNG, TIFF), Excel, CSV`,
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
                  (document_name, document_path, document_size_bytes, document_type, processing_status)
                  OUTPUT INSERTED.result_id
                  VALUES (@documentName, @documentPath, @fileSize, @fileType, 'pending')
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
