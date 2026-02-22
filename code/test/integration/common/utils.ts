import { getPrismaClient } from '../../../src/data/prisma-client.js';

/**
 * Clean all test data from database using Prisma
 *
 * CRITICAL: Delete in correct order to respect foreign key constraints:
 * 1. vendor_products (child - has FK to document_processing_results)
 * 2. document_processing_results (parent)
 */
export async function cleanTestDatabase(): Promise<void> {
  const prisma = getPrismaClient();

  // Import repositories dynamically to avoid circular dependencies
  const { VendorProductRepository } =
    await import('../../../src/data/repositories/VendorProductRepository.prisma.js');
  const { DocumentRepository } =
    await import('../../../src/data/repositories/DocumentRepository.prisma.js');

  const vendorProductRepo = new VendorProductRepository(prisma);
  const documentRepo = new DocumentRepository(prisma);

  // Delete in correct order (respect foreign keys)
  // 1. Delete vendor_products first (has FK: source_document_id -> document_processing_results.result_id)
  await vendorProductRepo.deleteAll();

  // 2. Then delete documents (parent table)
  await documentRepo.deleteAll();
}
