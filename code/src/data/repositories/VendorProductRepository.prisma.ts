/**
 * VendorProductRepository - Data Access Layer for vendor_products table (Prisma)
 *
 * Encapsulates all database operations for vendor products using Prisma ORM:
 * - Bulk product insertion (automatic transaction support)
 * - Vendor-based queries
 * - Source document queries
 * - Cascade deletion operations
 *
 * @module data/repositories
 */

import { PrismaClient, vendor_products } from '@prisma/client';

/**
 * Vendor product record from database
 */
export interface VendorProductRecord {
  id: string;
  vendor_id: string;
  vendor_name: string;
  product_name: string | null;
  sku: string | null;
  price: number | null;
  unit: string | null;
  description: string | null;
  source_document_id: string;
  source_document_name: string | null;
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
 * VendorProductRepository - Manages all database operations for vendor products using Prisma
 */
export class VendorProductRepository {
  constructor(private prisma: PrismaClient) {}

  /**
   * Insert vendor products in bulk
   *
   * Prisma's createMany automatically:
   * - Handles batching internally (no manual batch logic needed)
   * - Wraps the operation in a transaction for atomicity
   * - Optimizes the SQL for bulk inserts
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

    // Prisma createMany handles batching and transactions automatically
    const result = await this.prisma.vendor_products.createMany({
      data: products.map((product) => ({
        vendor_id: product.vendor_id,
        vendor_name: product.vendor_name,
        product_name: product.product_name,
        sku: product.sku,
        price: product.price,
        unit: product.unit || null,
        description: product.description || null,
        source_document_id: product.source_document_id,
        source_document_name: product.source_document_name,
      })),
    });

    return result.count;
  }

  /**
   * Find all products for a specific vendor
   *
   * @param vendorId - Vendor identifier (normalized vendor name)
   * @returns Array of product records (ordered by sku ASC)
   */
  async findByVendor(vendorId: string): Promise<VendorProductRecord[]> {
    const products = await this.prisma.vendor_products.findMany({
      where: { vendor_id: vendorId },
      orderBy: { sku: 'asc' },
    });

    return products.map((p) => this.mapToVendorProduct(p));
  }

  /**
   * Find all products extracted from a specific document
   *
   * @param documentId - Source document UUID
   * @returns Array of product records (ordered by id ASC)
   */
  async findBySourceDocument(documentId: string): Promise<VendorProductRecord[]> {
    const products = await this.prisma.vendor_products.findMany({
      where: { source_document_id: documentId },
      orderBy: { id: 'asc' },
    });

    return products.map((p) => this.mapToVendorProduct(p));
  }

  /**
   * Delete all products for a vendor (cascade delete for vendor removal)
   *
   * @param vendorId - Vendor identifier (normalized vendor name)
   * @returns Number of rows deleted
   */
  async deleteByVendor(vendorId: string): Promise<number> {
    const result = await this.prisma.vendor_products.deleteMany({
      where: { vendor_id: vendorId },
    });

    return result.count;
  }

  /**
   * Delete all products from a specific source document
   *
   * @param documentId - Source document UUID
   * @returns Number of rows deleted
   */
  async deleteBySourceDocument(documentId: string): Promise<number> {
    const result = await this.prisma.vendor_products.deleteMany({
      where: { source_document_id: documentId },
    });

    return result.count;
  }

  /**
   * Delete all vendor products from the table
   *
   * ⚠️ WARNING: This deletes ALL records. Only use for test cleanup!
   *
   * @returns Number of rows deleted
   */
  async deleteAll(): Promise<number> {
    const result = await this.prisma.vendor_products.deleteMany();
    return result.count;
  }

  /**
   * Helper method to map Prisma result to VendorProductRecord type
   * Handles Decimal to number conversion for price
   */
  private mapToVendorProduct(product: vendor_products): VendorProductRecord {
    return {
      ...product,
      price: product.price ? Number(product.price) : null,
    };
  }
}

/**
 * Factory function for VendorProductRepository
 * Creates a repository instance with Prisma client
 */
export async function createVendorProductRepository(): Promise<VendorProductRepository> {
  const { getPrismaClient } = await import('../prisma-client.js');
  const prisma = getPrismaClient();
  return new VendorProductRepository(prisma);
}
