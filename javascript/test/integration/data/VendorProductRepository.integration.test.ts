/**
 * VendorProductRepository Integration Tests
 *
 * Tests VendorProductRepository with real Docker SQL Server database.
 * Validates bulk inserts with batching (500+ products), query operations, and cascade deletes.
 */

import type sql from 'mssql';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { CreateDocumentInput } from '../../../src/data/repositories/DocumentRepository.js';
import { DocumentRepository } from '../../../src/data/repositories/DocumentRepository.js';
import type { CreateVendorProductInput } from '../../../src/data/repositories/VendorProductRepository.js';
import { VendorProductRepository } from '../../../src/data/repositories/VendorProductRepository.js';
import { cleanTestDatabase, getTestDbPool } from '../helpers/test-db.js';

describe('VendorProductRepository Integration Tests', () => {
  let pool: sql.ConnectionPool;
  let repository: VendorProductRepository;
  let documentRepository: DocumentRepository;

  beforeEach(async () => {
    pool = await getTestDbPool();
    repository = new VendorProductRepository(pool);
    documentRepository = new DocumentRepository(pool);
    await cleanTestDatabase();
  });

  afterEach(async () => {
    await cleanTestDatabase();
  });

  describe('createBulk() with batching', () => {
    test('should insert 2 products successfully', async () => {
      // Arrange - Create source document
      const docInput: CreateDocumentInput = {
        vendor_name: 'TestVendor',
        document_name: 'pricelist.pdf',
        document_path: 'testvendor/pricelist.pdf',
        document_size_bytes: 1024,
        document_type: 'application/pdf',
        processing_status: 'completed',
      };
      const docId = await documentRepository.create(docInput);

      const products: CreateVendorProductInput[] = [
        {
          vendor_id: 'testvendor',
          vendor_name: 'TestVendor',
          sku: 'WIDGET-001',
          product_name: 'Blue Widget',
          price: 10.5,
          unit: 'EA',
          source_document_id: docId,
          source_document_name: 'pricelist.pdf',
        },
        {
          vendor_id: 'testvendor',
          vendor_name: 'TestVendor',
          sku: 'GADGET-002',
          product_name: 'Red Gadget',
          price: 25.0,
          unit: 'BOX',
          source_document_id: docId,
          source_document_name: 'pricelist.pdf',
        },
      ];

      // Act
      const insertedCount = await repository.createBulk(products);

      // Assert
      expect(insertedCount).toBe(2);

      // Verify inserted products
      const retrieved = await repository.findByVendor('testvendor');
      expect(retrieved).toHaveLength(2);
      expect(retrieved.find((p) => p.sku === 'WIDGET-001')).toBeDefined();
      expect(retrieved.find((p) => p.sku === 'GADGET-002')).toBeDefined();
    });

    test('should insert 500+ products with automatic batching (BATCH_SIZE=100)', async () => {
      // Arrange - Create source document
      const docInput: CreateDocumentInput = {
        vendor_name: 'BulkVendor',
        document_name: 'large-pricelist.pdf',
        document_path: 'bulkvendor/large-pricelist.pdf',
        document_size_bytes: 5242880,
        document_type: 'application/pdf',
        processing_status: 'completed',
      };
      const docId = await documentRepository.create(docInput);

      // Generate 500 products
      const products: CreateVendorProductInput[] = [];
      for (let i = 1; i <= 500; i++) {
        products.push({
          vendor_id: 'bulkvendor',
          vendor_name: 'BulkVendor',
          sku: `SKU-${String(i).padStart(4, '0')}`,
          product_name: `Product ${i}`,
          price: Math.round((10 + i * 0.5) * 100) / 100,
          unit: i % 3 === 0 ? 'BOX' : i % 2 === 0 ? 'CASE' : 'EA',
          source_document_id: docId,
          source_document_name: 'large-pricelist.pdf',
        });
      }

      // Act - Should trigger 5 batches (100 each)
      const startTime = Date.now();
      const insertedCount = await repository.createBulk(products);
      const duration = Date.now() - startTime;

      // Assert
      expect(insertedCount).toBe(500);
      console.log(
        `✓ Inserted 500 products in ${duration}ms (${(duration / 500).toFixed(2)}ms per product)`
      );

      // Verify count in database
      const retrieved = await repository.findByVendor('bulkvendor');
      expect(retrieved).toHaveLength(500);

      // Spot check a few products
      expect(retrieved.find((p) => p.sku === 'SKU-0001')).toBeDefined();
      expect(retrieved.find((p) => p.sku === 'SKU-0250')).toBeDefined();
      expect(retrieved.find((p) => p.sku === 'SKU-0500')).toBeDefined();
    });

    test('should handle empty array gracefully', async () => {
      // Act
      const insertedCount = await repository.createBulk([]);

      // Assert
      expect(insertedCount).toBe(0);
    });

    test('should validate required fields', async () => {
      // Arrange - Missing vendor_id
      const invalidProducts = [
        {
          vendor_id: '',
          vendor_name: 'TestVendor',
          sku: 'SKU-001',
          product_name: 'Product 1',
          price: 10.0,
          unit: 'EA',
          source_document_id: '00000000-0000-0000-0000-000000000001',
        },
      ];

      // Act & Assert
      await expect(
        repository.createBulk(invalidProducts as CreateVendorProductInput[])
      ).rejects.toThrow('vendor_id is required');
    });
  });

  describe('findByVendor()', () => {
    test('should retrieve all products for vendor ordered by sku ASC', async () => {
      // Arrange - Create source document
      const docInput: CreateDocumentInput = {
        vendor_name: 'TestVendor',
        document_name: 'pricelist.pdf',
        document_path: 'testvendor/pricelist.pdf',
        document_size_bytes: 1024,
        document_type: 'application/pdf',
        processing_status: 'completed',
      };
      const docId = await documentRepository.create(docInput);

      // Insert products in random order
      const products: CreateVendorProductInput[] = [
        {
          vendor_id: 'testvendor',
          vendor_name: 'TestVendor',
          sku: 'ZEBRA-999',
          product_name: 'Zebra Product',
          price: 50.0,
          unit: 'EA',
          source_document_id: docId,
          source_document_name: 'pricelist.pdf',
        },
        {
          vendor_id: 'testvendor',
          vendor_name: 'TestVendor',
          sku: 'ALPHA-001',
          product_name: 'Alpha Product',
          price: 10.0,
          unit: 'EA',
          source_document_id: docId,
          source_document_name: 'pricelist.pdf',
        },
        {
          vendor_id: 'testvendor',
          vendor_name: 'TestVendor',
          sku: 'MIDDLE-500',
          product_name: 'Middle Product',
          price: 25.0,
          unit: 'BOX',
          source_document_id: docId,
          source_document_name: 'pricelist.pdf',
        },
      ];
      await repository.createBulk(products);

      // Act
      const retrieved = await repository.findByVendor('testvendor');

      // Assert - Ordered by sku ASC
      expect(retrieved).toHaveLength(3);
      expect(retrieved[0].sku).toBe('ALPHA-001');
      expect(retrieved[1].sku).toBe('MIDDLE-500');
      expect(retrieved[2].sku).toBe('ZEBRA-999');
    });

    test('should return empty array for vendor with no products', async () => {
      // Act
      const retrieved = await repository.findByVendor('nonexistentvendor');

      // Assert
      expect(retrieved).toEqual([]);
    });
  });

  describe('findBySourceDocument()', () => {
    test('should retrieve all products from specific source document', async () => {
      // Arrange - Create 2 source documents
      const doc1Input: CreateDocumentInput = {
        vendor_name: 'TestVendor',
        document_name: 'pricelist-jan.pdf',
        document_path: 'testvendor/pricelist-jan.pdf',
        document_size_bytes: 1024,
        document_type: 'application/pdf',
        processing_status: 'completed',
      };
      const doc1Id = await documentRepository.create(doc1Input);

      const doc2Input: CreateDocumentInput = {
        vendor_name: 'TestVendor',
        document_name: 'pricelist-feb.pdf',
        document_path: 'testvendor/pricelist-feb.pdf',
        document_size_bytes: 2048,
        document_type: 'application/pdf',
        processing_status: 'completed',
      };
      const doc2Id = await documentRepository.create(doc2Input);

      // Insert products from both documents
      const productsDoc1: CreateVendorProductInput[] = [
        {
          vendor_id: 'testvendor',
          vendor_name: 'TestVendor',
          sku: 'JAN-001',
          product_name: 'January Product 1',
          price: 10.0,
          unit: 'EA',
          source_document_id: doc1Id,
          source_document_name: 'pricelist-jan.pdf',
        },
        {
          vendor_id: 'testvendor',
          vendor_name: 'TestVendor',
          sku: 'JAN-002',
          product_name: 'January Product 2',
          price: 20.0,
          unit: 'EA',
          source_document_id: doc1Id,
          source_document_name: 'pricelist-jan.pdf',
        },
      ];
      await repository.createBulk(productsDoc1);

      const productsDoc2: CreateVendorProductInput[] = [
        {
          vendor_id: 'testvendor',
          vendor_name: 'TestVendor',
          sku: 'FEB-001',
          product_name: 'February Product 1',
          price: 15.0,
          unit: 'BOX',
          source_document_id: doc2Id,
          source_document_name: 'pricelist-feb.pdf',
        },
      ];
      await repository.createBulk(productsDoc2);

      // Act
      const doc1Products = await repository.findBySourceDocument(doc1Id);
      const doc2Products = await repository.findBySourceDocument(doc2Id);

      // Assert
      expect(doc1Products).toHaveLength(2);
      expect(doc1Products.every((p) => p.source_document_id === doc1Id)).toBe(true);
      expect(doc1Products.find((p) => p.sku === 'JAN-001')).toBeDefined();
      expect(doc1Products.find((p) => p.sku === 'JAN-002')).toBeDefined();

      expect(doc2Products).toHaveLength(1);
      expect(doc2Products[0].sku).toBe('FEB-001');
      expect(doc2Products[0].source_document_id).toBe(doc2Id);
    });

    test('should return empty array for document with no products', async () => {
      // Act
      const retrieved = await repository.findBySourceDocument(
        '00000000-0000-0000-0000-000000000000'
      );

      // Assert
      expect(retrieved).toEqual([]);
    });
  });

  describe('deleteByVendor() cascade delete', () => {
    test('should delete all products for vendor', async () => {
      // Arrange - Create document and products
      const docInput: CreateDocumentInput = {
        vendor_name: 'TestVendor',
        document_name: 'pricelist.pdf',
        document_path: 'testvendor/pricelist.pdf',
        document_size_bytes: 1024,
        document_type: 'application/pdf',
        processing_status: 'completed',
      };
      const docId = await documentRepository.create(docInput);

      const products: CreateVendorProductInput[] = [
        {
          vendor_id: 'testvendor',
          vendor_name: 'TestVendor',
          sku: 'PROD-001',
          product_name: 'Product 1',
          price: 10.0,
          unit: 'EA',
          source_document_id: docId,
          source_document_name: 'pricelist.pdf',
        },
        {
          vendor_id: 'testvendor',
          vendor_name: 'TestVendor',
          sku: 'PROD-002',
          product_name: 'Product 2',
          price: 20.0,
          unit: 'BOX',
          source_document_id: docId,
          source_document_name: 'pricelist.pdf',
        },
        {
          vendor_id: 'testvendor',
          vendor_name: 'TestVendor',
          sku: 'PROD-003',
          product_name: 'Product 3',
          price: 30.0,
          unit: 'CASE',
          source_document_id: docId,
          source_document_name: 'pricelist.pdf',
        },
      ];
      await repository.createBulk(products);

      // Verify products exist
      const before = await repository.findByVendor('testvendor');
      expect(before).toHaveLength(3);

      // Act
      const deleteCount = await repository.deleteByVendor('testvendor');

      // Assert
      expect(deleteCount).toBe(3);

      // Verify deletion
      const after = await repository.findByVendor('testvendor');
      expect(after).toHaveLength(0);
    });

    test('should return 0 for vendor with no products', async () => {
      // Act
      const deleteCount = await repository.deleteByVendor('nonexistentvendor');

      // Assert
      expect(deleteCount).toBe(0);
    });
  });

  describe('deleteBySourceDocument()', () => {
    test('should delete all products from specific source document', async () => {
      // Arrange - Create 2 documents
      const doc1Input: CreateDocumentInput = {
        vendor_name: 'TestVendor',
        document_name: 'pricelist-v1.pdf',
        document_path: 'testvendor/pricelist-v1.pdf',
        document_size_bytes: 1024,
        document_type: 'application/pdf',
        processing_status: 'completed',
      };
      const doc1Id = await documentRepository.create(doc1Input);

      const doc2Input: CreateDocumentInput = {
        vendor_name: 'TestVendor',
        document_name: 'pricelist-v2.pdf',
        document_path: 'testvendor/pricelist-v2.pdf',
        document_size_bytes: 2048,
        document_type: 'application/pdf',
        processing_status: 'completed',
      };
      const doc2Id = await documentRepository.create(doc2Input);

      // Insert products from both documents
      await repository.createBulk([
        {
          vendor_id: 'testvendor',
          vendor_name: 'TestVendor',
          sku: 'V1-PROD-001',
          product_name: 'V1 Product 1',
          price: 10.0,
          unit: 'EA',
          source_document_id: doc1Id,
          source_document_name: 'pricelist-v1.pdf',
        },
        {
          vendor_id: 'testvendor',
          vendor_name: 'TestVendor',
          sku: 'V1-PROD-002',
          product_name: 'V1 Product 2',
          price: 20.0,
          unit: 'EA',
          source_document_id: doc1Id,
          source_document_name: 'pricelist-v1.pdf',
        },
      ]);

      await repository.createBulk([
        {
          vendor_id: 'testvendor',
          vendor_name: 'TestVendor',
          sku: 'V2-PROD-001',
          product_name: 'V2 Product 1',
          price: 15.0,
          unit: 'BOX',
          source_document_id: doc2Id,
          source_document_name: 'pricelist-v2.pdf',
        },
      ]);

      // Act - Delete doc1 products
      const deleteCount = await repository.deleteBySourceDocument(doc1Id);

      // Assert
      expect(deleteCount).toBe(2);

      // Verify doc1 products deleted
      const doc1Products = await repository.findBySourceDocument(doc1Id);
      expect(doc1Products).toHaveLength(0);

      // Verify doc2 products still exist
      const doc2Products = await repository.findBySourceDocument(doc2Id);
      expect(doc2Products).toHaveLength(1);
      expect(doc2Products[0].sku).toBe('V2-PROD-001');
    });

    test('should return 0 for document with no products', async () => {
      // Act
      const deleteCount = await repository.deleteBySourceDocument(
        '00000000-0000-0000-0000-000000000000'
      );

      // Assert
      expect(deleteCount).toBe(0);
    });
  });
});
