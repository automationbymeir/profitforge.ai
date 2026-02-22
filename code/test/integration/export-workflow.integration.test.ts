/**
 * Integration Test - Export/Confirm Workflow
 *
 * Tests the POST /api/confirmMapping endpoint using test database.
 * Verifies products are exported to vendor_products table.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { getPrismaClient } from '../../src/data/prisma-client.js';
import { DocumentRepository } from '../../src/data/repositories/DocumentRepository.prisma.js';
import { cleanTestDatabase } from './common/utils';

const FUNCTION_BASE_URL = 'http://localhost:7071';

describe('Integration: Export/Confirm Workflow', () => {
  const _testVendor = 'TEST_EXPORT_FLOW_01_26';

  beforeEach(async () => {
    await cleanTestDatabase();
  });

  it('should export products to vendor_products table', async () => {
    // Arrange - Create document with products
    const prisma = getPrismaClient();
    const documentRepo = new DocumentRepository(prisma);

    const products = [
      { name: 'Product 1', sku: 'A001', price: 10.0, unit: 'case', description: 'Product 1 desc' },
      { name: 'Product 2', sku: 'A002', price: 20.0, unit: 'case', description: 'Product 2 desc' },
    ];

    const documentId = await documentRepo.create({
      vendor_name: 'TEST_VENDOR',
      document_name: 'catalog.pdf',
      document_path: 'TEST_VENDOR/catalog.pdf',
      document_size_bytes: 1024,
      document_type: 'application/pdf',
      processing_status: 'ocr_complete',
      export_status: 'not_exported',
      processing_started_at: new Date(),
    });

    // Update with AI mapping results
    await documentRepo.updateAiMapping({
      result_id: documentId,
      ai_mapping_result: JSON.stringify({ products }),
      ai_model_used: 'gpt-4o',
      ai_prompt_used: null,
      ai_model_cost_usd: 0.01,
      ai_confidence_score: 0.95,
      ai_completeness_score: 0.98,
      ai_prompt_tokens: 1000,
      ai_completion_tokens: 500,
    });

    // Verify initial export status
    const beforeExport = await documentRepo.findById(documentId);
    expect(beforeExport?.export_status).toBe('not_exported');
    expect(beforeExport?.processing_status).toBe('completed');

    // Wait briefly to ensure database commit is visible across connection pools
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Act - Confirm mapping
    const response = await fetch(`${FUNCTION_BASE_URL}/api/documents/runs/${documentId}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    // Debug: Log response details if not 200
    if (response.status !== 200) {
      const errorBody = await response.text();
      console.log(`❌ Confirm mapping failed (status ${response.status}):`, errorBody);
    }

    // Assert
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.productsExported).toBe(2);

    // Verify products in vendor_products table using Prisma
    const exportedProducts = await prisma.vendor_products.findMany({
      where: { source_document_id: documentId },
      orderBy: { sku: 'asc' },
    });

    expect(exportedProducts).toHaveLength(2);
    expect(exportedProducts[0].vendor_name).toBe('TEST_VENDOR');
    expect(exportedProducts[0].sku).toBe('A001');

    // Verify export status updated to 'confirmed'
    const afterExport = await documentRepo.findById(documentId);
    expect(afterExport?.export_status).toBe('confirmed');
  });

  it('should reject confirmation with invalid UUID', async () => {
    // Act
    const response = await fetch(`${FUNCTION_BASE_URL}/api/documents/runs/not-a-uuid/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    // Assert - Currently returns 500 when SQL Server rejects invalid UUID
    expect(response.status).toBe(500);
  });

  it('should reject confirmation without documentId', async () => {
    // Act
    const response = await fetch(`${FUNCTION_BASE_URL}/api/documents/runs//confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    // Assert - Azure Functions returns 404 for invalid route
    expect(response.status).toBe(404);
  });

  it('should reject confirmation if no products to export', async () => {
    // Arrange - Document with no products
    const prisma = getPrismaClient();
    const documentRepo = new DocumentRepository(prisma);

    const documentId = await documentRepo.create({
      vendor_name: 'TEST_VENDOR',
      document_name: 'empty.pdf',
      document_path: 'TEST_VENDOR/empty.pdf',
      document_size_bytes: 1024,
      document_type: 'application/pdf',
      processing_status: 'completed',
      export_status: 'not_exported',
      processing_started_at: new Date(),
    });

    // Act
    const response = await fetch(`${FUNCTION_BASE_URL}/api/documents/runs/${documentId}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    // Assert
    expect(response.status).toBe(400);
  });

  it('should handle double confirmation gracefully', async () => {
    // Arrange
    const prisma = getPrismaClient();
    const documentRepo = new DocumentRepository(prisma);

    const products = [{ name: 'Product 1', sku: 'A001', price: 10.0, unit: 'each' }];
    const documentId = await documentRepo.create({
      vendor_name: 'TEST_VENDOR',
      document_name: 'catalog.pdf',
      document_path: 'TEST_VENDOR/catalog.pdf',
      document_size_bytes: 1024,
      document_type: 'application/pdf',
      processing_status: 'ocr_complete',
      export_status: 'not_exported',
      processing_started_at: new Date(),
    });

    // Update with AI mapping results
    await documentRepo.updateAiMapping({
      result_id: documentId,
      ai_mapping_result: JSON.stringify({ products }),
      ai_model_used: 'gpt-4o',
      ai_prompt_used: null,
      ai_model_cost_usd: 0.01,
      ai_confidence_score: 0.95,
      ai_completeness_score: 0.98,
      ai_prompt_tokens: 1000,
      ai_completion_tokens: 500,
    });

    // Act - Confirm twice
    const response1 = await fetch(`${FUNCTION_BASE_URL}/api/documents/runs/${documentId}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const response2 = await fetch(`${FUNCTION_BASE_URL}/api/documents/runs/${documentId}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    // Assert - Both should succeed (idempotent)
    expect(response1.status).toBe(200);
    expect(response2.status).toBe(200);

    // Verify only 1 set of products exported (not duplicated) using Prisma
    const exportedProducts = await prisma.vendor_products.findMany({
      where: { source_document_id: documentId },
    });

    expect(exportedProducts).toHaveLength(1);
  });
});
