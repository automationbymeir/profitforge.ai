import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { BlobServiceClient } from "@azure/storage-blob";
import * as crypto from "crypto";
import * as sql from "mssql";

// Inline vendor path helper
function getVendorPath(vendorName: string): string {
  return vendorName;
}

// Connection strings from environment variables
const STORAGE_ACCOUNT_NAME = process.env.STORAGE_ACCOUNT_NAME;
const STORAGE_CONTAINER_DOCUMENTS = process.env.STORAGE_CONTAINER_DOCUMENTS || "df-documents";
const SQL_CONNECTION_STRING = process.env.SQL_CONNECTION_STRING;

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

    // 2. Register in Database (UploadBatches)
    const pool = await sql.connect(SQL_CONNECTION_STRING!);
    const result = await pool
      .request()
      .input("vendorId", sql.NVarChar, vendorId)
      .input("documentName", sql.NVarChar, fileName)
      .input("documentPath", sql.NVarChar, filePath)
      .input("fileSize", sql.BigInt, fileBuffer.length).query(`
                INSERT INTO vvocr.document_processing_results 
                (document_name, document_path, document_size_bytes, document_type, processing_status)
                OUTPUT INSERTED.result_id
                VALUES (@documentName, @documentPath, @fileSize, 'vendor_catalog', 'pending')
            `);

    const resultId = result.recordset[0].result_id;

    return {
      status: 201,
      jsonBody: {
        message: "Document uploaded successfully",
        resultId,
        filePath,
      },
    };
  } catch (error: any) {
    context.error(`Error processing upload: ${error.message}`);
    return {
      status: 500,
      body: `Internal Server Error: ${error.message}`,
    };
  }
}

app.http("upload", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: uploadHandler,
});
