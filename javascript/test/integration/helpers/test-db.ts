/**
 * Test Database Utilities
 *
 * Helpers for managing the test database (Docker SQL Server 2022).
 * EXACT match of production database - same schema, same field names.
 */

import sql from "mssql";

// Connection config for test database (SQL Server 2022 in Docker)
export const TEST_DB_CONFIG: sql.config = {
  server: "localhost",
  port: 1433,
  database: "master",
  user: "sa",
  password: "TestPassword123!",
  options: {
    encrypt: false, // Local Docker doesn't need encryption
    trustServerCertificate: true,
    enableArithAbort: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

let pool: sql.ConnectionPool | null = null;

/**
 * Get or create database connection pool
 */
export async function getTestDbPool(): Promise<sql.ConnectionPool> {
  if (pool && pool.connected) {
    return pool;
  }

  pool = new sql.ConnectionPool(TEST_DB_CONFIG);
  await pool.connect();
  return pool;
}

/**
 * Close database connection pool
 */
export async function closeTestDbPool(): Promise<void> {
  if (pool) {
    await pool.close();
    pool = null;
  }
}

/**
 * Clean all test data from database
 */
export async function cleanTestDatabase(): Promise<void> {
  const db = await getTestDbPool();

  // Delete in correct order (respect foreign keys)
  await db.request().query("DELETE FROM vvocr.vendor_products");
  await db.request().query("DELETE FROM vvocr.document_processing_results");
}

/**
 * Seed test data for a vendor (not commonly used - vendor_products usually populated after export)
 */
export async function seedVendorData(vendorName: string, products: any[]): Promise<void> {
  const db = await getTestDbPool();

  for (const product of products) {
    await db
      .request()
      .input("vendorId", sql.NVarChar, vendorName)
      .input("vendorName", sql.NVarChar, vendorName)
      .input("sku", sql.NVarChar, product.code || product.sku)
      .input("productName", sql.NVarChar, product.description || product.name)
      .input("price", sql.Decimal(18, 4), product.price)
      .input("unit", sql.NVarChar, product.unit || product.uom)
      .input("sourceDocumentId", sql.UniqueIdentifier, product.sourceDocumentId).query(`
        INSERT INTO vvocr.vendor_products 
        (vendor_id, vendor_name, sku, product_name, price, unit, source_document_id)
        VALUES (@vendorId, @vendorName, @sku, @productName, @price, @unit, @sourceDocumentId)
      `);
  }
}

/**
 * Get all documents for a vendor
 */
export async function getDocumentsByVendor(vendorName: string): Promise<any[]> {
  const db = await getTestDbPool();

  const result = await db
    .request()
    .input("vendorName", sql.NVarChar, vendorName)
    .query(
      "SELECT * FROM vvocr.document_processing_results WHERE vendor_name = @vendorName ORDER BY created_at DESC"
    );

  return result.recordset;
}

/**
 * Get document by result ID
 */
export async function getDocumentByResultId(resultId: string): Promise<any | null> {
  const db = await getTestDbPool();

  const result = await db
    .request()
    .input("resultId", sql.UniqueIdentifier, resultId)
    .query("SELECT * FROM vvocr.document_processing_results WHERE result_id = @resultId");

  return result.recordset[0] || null;
}

/**
 * Insert a test document result (uses production field names)
 */
export async function insertTestDocument(data: {
  vendorName: string;
  documentName: string;
  documentPath?: string;
  blobName?: string;
  processingStatus?: string;
  productCount?: number;
  aiMappingResult?: any;
  reprocessingCount?: number;
  parentDocumentId?: string;
}): Promise<string> {
  const db = await getTestDbPool();

  const result = await db
    .request()
    .input("vendorName", sql.NVarChar, data.vendorName)
    .input("documentName", sql.NVarChar, data.documentName)
    .input("documentPath", sql.NVarChar, data.documentPath || data.blobName || null)
    .input("processingStatus", sql.NVarChar, data.processingStatus || "pending")
    .input("productCount", sql.Int, data.productCount || 0)
    .input(
      "aiMappingResult",
      sql.NVarChar,
      data.aiMappingResult ? JSON.stringify(data.aiMappingResult) : null
    )
    .input("reprocessingCount", sql.Int, data.reprocessingCount || 0)
    .input("parentDocumentId", sql.UniqueIdentifier, data.parentDocumentId || null).query(`
      INSERT INTO vvocr.document_processing_results 
      (vendor_name, document_name, document_path, processing_status, product_count, ai_mapping_result, reprocessing_count, parent_document_id)
      OUTPUT INSERTED.result_id
      VALUES (@vendorName, @documentName, @documentPath, @processingStatus, @productCount, @aiMappingResult, @reprocessingCount, @parentDocumentId)
    `);

  return result.recordset[0].result_id;
}

/**
 * Wait for document to reach a specific status
 * Polls database every 500ms up to maxWaitMs
 */
export async function waitForDocumentStatus(
  resultId: string,
  expectedStatus: string,
  maxWaitMs: number = 30000
): Promise<any> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const doc = await getDocumentByResultId(resultId);

    if (doc && doc.processing_status === expectedStatus) {
      return doc;
    }

    // Wait 500ms before next poll
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(
    `Timeout waiting for document ${resultId} to reach status ${expectedStatus} (waited ${maxWaitMs}ms)`
  );
}
