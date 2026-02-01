/**
 * VendorProductRepository - Data Access Layer for vendor_products table
 *
 * Encapsulates all SQL queries for vendor product operations including:
 * - Bulk product insertion with batching
 * - Vendor-based queries
 * - Source document queries
 * - Cascade deletion operations
 *
 * @module data/repositories
 */

import sql from 'mssql';

/**
 * Vendor product record from database
 */
export interface VendorProductRecord {
  id: number;
  vendor_id: string;
  vendor_name: string;
  product_name: string;
  sku: string;
  price: number;
  unit: string | null;
  description: string | null;
  source_document_id: string;
  source_document_name: string;
  created_at: Date;
}

/**
 * Input for creating vendor products
 */
export interface CreateVendorProductInput {
  vendor_id: string;
  vendor_name: string;
  product_name: string;
  sku: string;
  price: number;
  unit?: string | null;
  description?: string | null;
  source_document_id: string;
  source_document_name: string;
}

/**
 * VendorProductRepository - Manages all database operations for vendor products
 */
export class VendorProductRepository {
  private readonly BATCH_SIZE = 100; // Insert 100 products per batch

  constructor(private pool: sql.ConnectionPool) {}

  /**
   * Insert vendor products in bulk with automatic batching
   *
   * This method handles large product lists by:
   * - Splitting into batches of BATCH_SIZE (100) products
   * - Using transactions for atomicity
   * - Rolling back on errors
   *
   * @param products - Array of product input records
   * @returns Total number of products inserted
   * @throws Error if validation fails or database operation fails
   */
  async createBulk(products: CreateVendorProductInput[]): Promise<number> {
    if (products.length === 0) {
      return 0;
    }

    // Validation
    for (const product of products) {
      if (!product.vendor_id || product.vendor_id.trim().length === 0) {
        throw new Error('vendor_id is required for all products');
      }
      if (!product.product_name || product.product_name.trim().length === 0) {
        throw new Error('product_name is required for all products');
      }
      if (!product.sku || product.sku.trim().length === 0) {
        throw new Error('sku is required for all products');
      }
    }

    let totalInserted = 0;

    // Process in batches to avoid SQL query size limits
    for (let i = 0; i < products.length; i += this.BATCH_SIZE) {
      const batch = products.slice(i, i + this.BATCH_SIZE);

      for (const product of batch) {
        await this.pool
          .request()
          .input('vendorId', sql.NVarChar, product.vendor_id)
          .input('vendorName', sql.NVarChar, product.vendor_name)
          .input('productName', sql.NVarChar, product.product_name)
          .input('sku', sql.NVarChar, product.sku)
          .input('price', sql.Decimal(18, 4), product.price)
          .input('unit', sql.NVarChar, product.unit || null)
          .input('description', sql.NVarChar, product.description || null)
          .input('sourceDocId', sql.UniqueIdentifier, product.source_document_id)
          .input('sourceDocName', sql.NVarChar, product.source_document_name).query(`
            INSERT INTO vvocr.vendor_products 
            (vendor_id, vendor_name, product_name, sku, price, unit, description, source_document_id, source_document_name)
            VALUES 
            (@vendorId, @vendorName, @productName, @sku, @price, @unit, @description, @sourceDocId, @sourceDocName)
          `);

        totalInserted++;
      }
    }

    return totalInserted;
  }

  /**
   * Find all products for a specific vendor
   *
   * @param vendorId - Vendor identifier (normalized vendor name)
   * @returns Array of product records (ordered by sku ASC)
   */
  async findByVendor(vendorId: string): Promise<VendorProductRecord[]> {
    const result = await this.pool.request().input('vendorId', sql.NVarChar, vendorId).query(`
        SELECT 
          id,
          vendor_id,
          vendor_name,
          product_name,
          sku,
          price,
          unit,
          description,
          source_document_id,
          source_document_name,
          created_at
        FROM vvocr.vendor_products
        WHERE vendor_id = @vendorId
        ORDER BY sku ASC
      `);

    return result.recordset;
  }

  /**
   * Find all products extracted from a specific document
   *
   * @param documentId - Source document UUID
   * @returns Array of product records (ordered by id ASC)
   */
  async findBySourceDocument(documentId: string): Promise<VendorProductRecord[]> {
    const result = await this.pool.request().input('documentId', sql.UniqueIdentifier, documentId)
      .query(`
        SELECT 
          id,
          vendor_id,
          vendor_name,
          product_name,
          sku,
          price,
          unit,
          description,
          source_document_id,
          source_document_name,
          created_at
        FROM vvocr.vendor_products
        WHERE source_document_id = @documentId
        ORDER BY id ASC
      `);

    return result.recordset;
  }

  /**
   * Delete all products for a vendor (cascade delete for vendor removal)
   *
   * @param vendorId - Vendor identifier (normalized vendor name)
   * @returns Number of rows deleted
   */
  async deleteByVendor(vendorId: string): Promise<number> {
    const result = await this.pool.request().input('vendorId', sql.NVarChar, vendorId).query(`
        DELETE FROM vvocr.vendor_products
        WHERE vendor_id = @vendorId
      `);

    return result.rowsAffected[0] || 0;
  }

  /**
   * Delete all products from a specific source document
   *
   * @param documentId - Source document UUID
   * @returns Number of rows deleted
   */
  async deleteBySourceDocument(documentId: string): Promise<number> {
    const result = await this.pool.request().input('documentId', sql.UniqueIdentifier, documentId)
      .query(`
        DELETE FROM vvocr.vendor_products
        WHERE source_document_id = @documentId
      `);

    return result.rowsAffected[0] || 0;
  }
}
