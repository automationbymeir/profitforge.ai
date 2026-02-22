/**
 * VendorProductRepository Unit Tests
 *
 * Tests all repository methods with mocked Prisma Client.
 * Validates Prisma operations, batching logic, and error handling.
 */

import type { PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreateVendorProductInput } from '../../../src/data/repositories/VendorProductRepository.prisma.js';
import { VendorProductRepository } from '../../../src/data/repositories/VendorProductRepository.prisma.js';

describe('VendorProductRepository', () => {
  let mockPrisma: any;
  let repository: VendorProductRepository;

  beforeEach(() => {
    // Create mock Prisma client
    mockPrisma = {
      vendor_products: {
        createMany: vi.fn(),
        findMany: vi.fn(),
        deleteMany: vi.fn(),
      },
    } as any;

    repository = new VendorProductRepository(mockPrisma as PrismaClient);
  });

  describe('createBulk()', () => {
    it('should insert products and return count', async () => {
      const products: CreateVendorProductInput[] = [
        {
          vendor_id: 'test-vendor',
          vendor_name: 'Test Vendor',
          product_name: 'Product 1',
          sku: 'SKU001',
          price: 10.99,
          unit: 'EA',
          description: 'Test product 1',
          source_document_id: '550e8400-e29b-41d4-a716-446655440000',
          source_document_name: 'test.pdf',
        },
        {
          vendor_id: 'test-vendor',
          vendor_name: 'Test Vendor',
          product_name: 'Product 2',
          sku: 'SKU002',
          price: 20.99,
          unit: 'BX',
          description: 'Test product 2',
          source_document_id: '550e8400-e29b-41d4-a716-446655440000',
          source_document_name: 'test.pdf',
        },
      ];

      mockPrisma.vendor_products.createMany.mockResolvedValue({
        count: 2,
      });

      const insertedCount = await repository.createBulk(products);

      expect(insertedCount).toBe(2);
      expect(mockPrisma.vendor_products.createMany).toHaveBeenCalledWith({
        data: products.map((p) => ({
          vendor_id: p.vendor_id,
          vendor_name: p.vendor_name,
          product_name: p.product_name,
          sku: p.sku,
          price: p.price,
          unit: p.unit || null,
          description: p.description || null,
          source_document_id: p.source_document_id,
          source_document_name: p.source_document_name,
        })),
      });
    });

    it('should handle batching for 150 products', async () => {
      const products: CreateVendorProductInput[] = Array.from({ length: 150 }, (_, i) => ({
        vendor_id: 'test-vendor',
        vendor_name: 'Test Vendor',
        product_name: `Product ${i + 1}`,
        sku: `SKU${String(i + 1).padStart(3, '0')}`,
        price: 10.99 + i,
        unit: 'EA',
        description: `Test product ${i + 1}`,
        source_document_id: '550e8400-e29b-41d4-a716-446655440000',
        source_document_name: 'test.pdf',
      }));

      mockPrisma.vendor_products.createMany.mockResolvedValue({
        count: 150,
      });

      const insertedCount = await repository.createBulk(products);

      expect(insertedCount).toBe(150);
      expect(mockPrisma.vendor_products.createMany).toHaveBeenCalledTimes(1);
    });

    it('should return 0 for empty array', async () => {
      const insertedCount = await repository.createBulk([]);

      expect(insertedCount).toBe(0);
      expect(mockPrisma.vendor_products.createMany).not.toHaveBeenCalled();
    });

    it('should throw error if vendor_id is empty', async () => {
      const products: CreateVendorProductInput[] = [
        {
          vendor_id: '',
          vendor_name: 'Test Vendor',
          product_name: 'Product 1',
          sku: 'SKU001',
          price: 10.99,
          source_document_id: '550e8400-e29b-41d4-a716-446655440000',
          source_document_name: 'test.pdf',
        },
      ];

      await expect(repository.createBulk(products)).rejects.toThrow(
        'vendor_id is required for all products'
      );
    });

    it('should throw error if product_name is empty', async () => {
      const products: CreateVendorProductInput[] = [
        {
          vendor_id: 'test-vendor',
          vendor_name: 'Test Vendor',
          product_name: '',
          sku: 'SKU001',
          price: 10.99,
          source_document_id: '550e8400-e29b-41d4-a716-446655440000',
          source_document_name: 'test.pdf',
        },
      ];

      await expect(repository.createBulk(products)).rejects.toThrow(
        'product_name is required for all products'
      );
    });

    it('should throw error if sku is empty', async () => {
      const products: CreateVendorProductInput[] = [
        {
          vendor_id: 'test-vendor',
          vendor_name: 'Test Vendor',
          product_name: 'Product 1',
          sku: '',
          price: 10.99,
          source_document_id: '550e8400-e29b-41d4-a716-446655440000',
          source_document_name: 'test.pdf',
        },
      ];

      await expect(repository.createBulk(products)).rejects.toThrow(
        'sku is required for all products'
      );
    });
  });

  describe('findByVendor()', () => {
    it('should return products for vendor ordered by sku ASC', async () => {
      const mockProducts = [
        {
          id: '1',
          vendor_id: 'test-vendor',
          vendor_name: 'Test Vendor',
          product_name: 'Product 1',
          sku: 'SKU001',
          price: 10.99,
          unit: 'EA',
          description: 'Test product 1',
          source_document_id: '550e8400-e29b-41d4-a716-446655440000',
          source_document_name: 'test.pdf',
          created_at: new Date('2024-01-01'),
        },
        {
          id: '2',
          vendor_id: 'test-vendor',
          vendor_name: 'Test Vendor',
          product_name: 'Product 2',
          sku: 'SKU002',
          price: 20.99,
          unit: 'BX',
          description: 'Test product 2',
          source_document_id: '550e8400-e29b-41d4-a716-446655440000',
          source_document_name: 'test.pdf',
          created_at: new Date('2024-01-02'),
        },
      ];

      mockPrisma.vendor_products.findMany.mockResolvedValue(mockProducts);

      const results = await repository.findByVendor('test-vendor');

      expect(results).toHaveLength(2);
      expect(results[0].sku).toBe('SKU001');
      expect(results[1].sku).toBe('SKU002');
      expect(mockPrisma.vendor_products.findMany).toHaveBeenCalledWith({
        where: { vendor_id: 'test-vendor' },
        orderBy: { sku: 'asc' },
      });
    });

    it('should return empty array when no products found', async () => {
      mockPrisma.vendor_products.findMany.mockResolvedValue([]);

      const results = await repository.findByVendor('nonexistent-vendor');

      expect(results).toEqual([]);
    });
  });

  describe('findBySourceDocument()', () => {
    it('should return products from source document ordered by id ASC', async () => {
      const mockProducts = [
        {
          id: '1',
          vendor_id: 'test-vendor',
          vendor_name: 'Test Vendor',
          product_name: 'Product 1',
          sku: 'SKU001',
          price: 10.99,
          unit: 'EA',
          description: 'Test product 1',
          source_document_id: '550e8400-e29b-41d4-a716-446655440000',
          source_document_name: 'test.pdf',
          created_at: new Date(),
        },
        {
          id: '2',
          vendor_id: 'test-vendor',
          vendor_name: 'Test Vendor',
          product_name: 'Product 2',
          sku: 'SKU002',
          price: 20.99,
          unit: 'BX',
          description: 'Test product 2',
          source_document_id: '550e8400-e29b-41d4-a716-446655440000',
          source_document_name: 'test.pdf',
          created_at: new Date(),
        },
      ];

      mockPrisma.vendor_products.findMany.mockResolvedValue(mockProducts);

      const results = await repository.findBySourceDocument('550e8400-e29b-41d4-a716-446655440000');

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('1');
      expect(results[1].id).toBe('2');
      expect(mockPrisma.vendor_products.findMany).toHaveBeenCalledWith({
        where: { source_document_id: '550e8400-e29b-41d4-a716-446655440000' },
        orderBy: { id: 'asc' },
      });
    });

    it('should return empty array when no products found', async () => {
      mockPrisma.vendor_products.findMany.mockResolvedValue([]);

      const results = await repository.findBySourceDocument('nonexistent-doc-id');

      expect(results).toEqual([]);
    });
  });

  describe('deleteByVendor()', () => {
    it('should delete all products for vendor and return count', async () => {
      mockPrisma.vendor_products.deleteMany.mockResolvedValue({
        count: 5,
      });

      const deletedCount = await repository.deleteByVendor('test-vendor');

      expect(deletedCount).toBe(5);
      expect(mockPrisma.vendor_products.deleteMany).toHaveBeenCalledWith({
        where: { vendor_id: 'test-vendor' },
      });
    });

    it('should return 0 when no products found', async () => {
      mockPrisma.vendor_products.deleteMany.mockResolvedValue({
        count: 0,
      });

      const deletedCount = await repository.deleteByVendor('nonexistent-vendor');

      expect(deletedCount).toBe(0);
    });
  });

  describe('deleteBySourceDocument()', () => {
    it('should delete all products from source document and return count', async () => {
      mockPrisma.vendor_products.deleteMany.mockResolvedValue({
        count: 3,
      });

      const deletedCount = await repository.deleteBySourceDocument(
        '550e8400-e29b-41d4-a716-446655440000'
      );

      expect(deletedCount).toBe(3);
      expect(mockPrisma.vendor_products.deleteMany).toHaveBeenCalledWith({
        where: { source_document_id: '550e8400-e29b-41d4-a716-446655440000' },
      });
    });

    it('should return 0 when no products found', async () => {
      mockPrisma.vendor_products.deleteMany.mockResolvedValue({
        count: 0,
      });

      const deletedCount = await repository.deleteBySourceDocument('nonexistent-doc-id');

      expect(deletedCount).toBe(0);
    });
  });
});
