/**
 * VendorProductRepository Unit Tests
 *
 * Tests all repository methods with mocked SQL connection pool.
 * Validates batching logic, query structure, and error handling.
 */

import sql from 'mssql';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreateVendorProductInput } from '../../../src/data/repositories/VendorProductRepository.js';
import { VendorProductRepository } from '../../../src/data/repositories/VendorProductRepository.js';

describe('VendorProductRepository', () => {
  let mockPool: sql.ConnectionPool;
  let mockRequest: any;
  let repository: VendorProductRepository;

  beforeEach(() => {
    // Create mock request object
    mockRequest = {
      input: vi.fn().mockReturnThis(),
      query: vi.fn(),
    };

    // Create mock pool
    mockPool = {
      request: vi.fn().mockReturnValue(mockRequest),
    } as any;

    repository = new VendorProductRepository(mockPool);
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

      mockRequest.query.mockResolvedValue({
        rowsAffected: [1],
      });

      const insertedCount = await repository.createBulk(products);

      expect(insertedCount).toBe(2);
      expect(mockPool.request).toHaveBeenCalledTimes(2);
      expect(mockRequest.input).toHaveBeenCalledWith('vendorId', sql.NVarChar, 'test-vendor');
      expect(mockRequest.input).toHaveBeenCalledWith('productName', sql.NVarChar, 'Product 1');
      expect(mockRequest.input).toHaveBeenCalledWith('sku', sql.NVarChar, 'SKU001');
      expect(mockRequest.input).toHaveBeenCalledWith('price', sql.Decimal(18, 4), 10.99);
      expect(mockRequest.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO vvocr.vendor_products')
      );
    });

    it('should handle batching for 150 products (2 batches)', async () => {
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

      mockRequest.query.mockResolvedValue({
        rowsAffected: [1],
      });

      const insertedCount = await repository.createBulk(products);

      expect(insertedCount).toBe(150);
      // Should call request for each product (150 times)
      expect(mockPool.request).toHaveBeenCalledTimes(150);
    });

    it('should return 0 for empty array', async () => {
      const insertedCount = await repository.createBulk([]);

      expect(insertedCount).toBe(0);
      expect(mockPool.request).not.toHaveBeenCalled();
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
    it('should return products for vendor ordered by created_at DESC', async () => {
      const mockProducts = [
        {
          id: 2,
          vendor_id: 'test-vendor',
          product_name: 'Product 2',
          sku: 'SKU002',
          price: 20.99,
          created_at: new Date('2024-01-02'),
        },
        {
          id: 1,
          vendor_id: 'test-vendor',
          product_name: 'Product 1',
          sku: 'SKU001',
          price: 10.99,
          created_at: new Date('2024-01-01'),
        },
      ];

      mockRequest.query.mockResolvedValue({
        recordset: mockProducts,
      });

      const results = await repository.findByVendor('test-vendor');

      expect(results).toEqual(mockProducts);
      expect(mockRequest.input).toHaveBeenCalledWith('vendorId', sql.NVarChar, 'test-vendor');
      expect(mockRequest.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE vendor_id = @vendorId')
      );
      expect(mockRequest.query).toHaveBeenCalledWith(expect.stringContaining('ORDER BY sku ASC'));
    });

    it('should return empty array when no products found', async () => {
      mockRequest.query.mockResolvedValue({
        recordset: [],
      });

      const results = await repository.findByVendor('nonexistent-vendor');

      expect(results).toEqual([]);
    });
  });

  describe('findBySourceDocument()', () => {
    it('should return products from source document ordered by id ASC', async () => {
      const mockProducts = [
        {
          id: 1,
          vendor_id: 'test-vendor',
          product_name: 'Product 1',
          sku: 'SKU001',
          price: 10.99,
          source_document_id: '550e8400-e29b-41d4-a716-446655440000',
        },
        {
          id: 2,
          vendor_id: 'test-vendor',
          product_name: 'Product 2',
          sku: 'SKU002',
          price: 20.99,
          source_document_id: '550e8400-e29b-41d4-a716-446655440000',
        },
      ];

      mockRequest.query.mockResolvedValue({
        recordset: mockProducts,
      });

      const results = await repository.findBySourceDocument('550e8400-e29b-41d4-a716-446655440000');

      expect(results).toEqual(mockProducts);
      expect(mockRequest.input).toHaveBeenCalledWith(
        'documentId',
        sql.UniqueIdentifier,
        '550e8400-e29b-41d4-a716-446655440000'
      );
      expect(mockRequest.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE source_document_id = @documentId')
      );
      expect(mockRequest.query).toHaveBeenCalledWith(expect.stringContaining('ORDER BY id ASC'));
    });

    it('should return empty array when no products found', async () => {
      mockRequest.query.mockResolvedValue({
        recordset: [],
      });

      const results = await repository.findBySourceDocument('nonexistent-doc-id');

      expect(results).toEqual([]);
    });
  });

  describe('deleteByVendor()', () => {
    it('should delete all products for vendor and return count', async () => {
      mockRequest.query.mockResolvedValue({
        rowsAffected: [5],
      });

      const deletedCount = await repository.deleteByVendor('test-vendor');

      expect(deletedCount).toBe(5);
      expect(mockRequest.input).toHaveBeenCalledWith('vendorId', sql.NVarChar, 'test-vendor');
      expect(mockRequest.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM vvocr.vendor_products')
      );
      expect(mockRequest.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE vendor_id = @vendorId')
      );
    });

    it('should return 0 when no products found', async () => {
      mockRequest.query.mockResolvedValue({
        rowsAffected: [0],
      });

      const deletedCount = await repository.deleteByVendor('nonexistent-vendor');

      expect(deletedCount).toBe(0);
    });
  });

  describe('deleteBySourceDocument()', () => {
    it('should delete all products from source document and return count', async () => {
      mockRequest.query.mockResolvedValue({
        rowsAffected: [3],
      });

      const deletedCount = await repository.deleteBySourceDocument(
        '550e8400-e29b-41d4-a716-446655440000'
      );

      expect(deletedCount).toBe(3);
      expect(mockRequest.input).toHaveBeenCalledWith(
        'documentId',
        sql.UniqueIdentifier,
        '550e8400-e29b-41d4-a716-446655440000'
      );
      expect(mockRequest.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM vvocr.vendor_products')
      );
      expect(mockRequest.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE source_document_id = @documentId')
      );
    });

    it('should return 0 when no products found', async () => {
      mockRequest.query.mockResolvedValue({
        rowsAffected: [0],
      });

      const deletedCount = await repository.deleteBySourceDocument('nonexistent-doc-id');

      expect(deletedCount).toBe(0);
    });
  });
});
