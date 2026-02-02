/**
 * DocumentRepository Integration Tests
 *
 * Tests DocumentRepository with real Docker SQL Server database.
 * Validates CRUD operations, query filtering, reprocessing versions, and cascade deletes.
 */

import type sql from 'mssql';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { CreateDocumentInput } from '../../../src/data/repositories/DocumentRepository.js';
import { DocumentRepository } from '../../../src/data/repositories/DocumentRepository.js';
import { cleanTestDatabase, getTestDbPool } from '../utils/helpers.js';

describe('DocumentRepository Integration Tests', () => {
  let pool: sql.ConnectionPool;
  let repository: DocumentRepository;

  beforeEach(async () => {
    pool = await getTestDbPool();
    repository = new DocumentRepository(pool);
    await cleanTestDatabase();
  });

  afterEach(async () => {
    await cleanTestDatabase();
  });

  describe('create() and findById() round-trip', () => {
    const input: CreateDocumentInput = {
      vendor_name: 'TestVendor',
      document_name: 'invoice-001.pdf',
      document_path: 'testvendor/inbox/invoice-001.pdf',
      document_size_bytes: 102400,
      document_type: 'application/pdf',
      processing_status: 'pending',
    };

    test('should create document and retrieve by ID', async () => {
      // Arrange

      // Act - Create
      const resultId = await repository.create(input);
      expect(resultId).toBeDefined();
      expect(typeof resultId).toBe('string');

      // Act - Find by ID
      const document = await repository.findById(resultId);

      // Assert
      expect(document).toBeDefined();
      expect(document?.result_id).toBe(resultId);
      expect(document?.vendor_name).toBe('TestVendor');
      expect(document?.document_name).toBe('invoice-001.pdf');
      expect(document?.document_path).toBe('testvendor/inbox/invoice-001.pdf');
      expect(document?.processing_status).toBe('pending');
      expect(document?.export_status).toBe('not_exported'); // Schema default
      expect(document?.created_at).toBeInstanceOf(Date);
      expect(document?.updated_at).toBeInstanceOf(Date);
    });

    test('should return null for non-existent ID', async () => {
      // Act
      const document = await repository.findById('00000000-0000-0000-0000-000000000000');

      // Assert
      expect(document).toBeNull();
    });
  });

  describe('findByVendor()', () => {
    test('should retrieve multiple documents for vendor ordered by created_at DESC', async () => {
      // Arrange - Create 3 documents with slight delays
      const vendor = 'TestVendor';
      const doc1: CreateDocumentInput = {
        vendor_name: vendor,
        document_name: 'invoice-001.pdf',
        document_path: `${vendor}/inbox/invoice-001.pdf`,
        document_size_bytes: 1024,
        document_type: 'application/pdf',
        processing_status: 'pending',
      };
      const doc2: CreateDocumentInput = {
        vendor_name: vendor,
        document_name: 'invoice-002.pdf',
        document_path: `${vendor}/inbox/invoice-002.pdf`,
        document_size_bytes: 2048,
        document_type: 'application/pdf',
        processing_status: 'ocr_complete',
      };
      const doc3: CreateDocumentInput = {
        vendor_name: vendor,
        document_name: 'invoice-003.pdf',
        document_path: `${vendor}/inbox/invoice-003.pdf`,
        document_size_bytes: 3072,
        document_type: 'application/pdf',
        processing_status: 'completed',
      };

      await repository.create(doc1);
      await new Promise((resolve) => setTimeout(resolve, 10)); // Small delay
      await repository.create(doc2);
      await new Promise((resolve) => setTimeout(resolve, 10)); // Small delay
      await repository.create(doc3);

      // Act
      const documents = await repository.findByVendor(vendor);

      // Assert
      expect(documents).toHaveLength(3);
      expect(documents[0].document_name).toBe('invoice-003.pdf'); // Most recent first
      expect(documents[1].document_name).toBe('invoice-002.pdf');
      expect(documents[2].document_name).toBe('invoice-001.pdf');
      expect(documents[0].created_at.getTime()).toBeGreaterThan(documents[1].created_at.getTime());
      expect(documents[1].created_at.getTime()).toBeGreaterThan(documents[2].created_at.getTime());
    });

    test('should return empty array for vendor with no documents', async () => {
      // Act
      const documents = await repository.findByVendor('NonExistentVendor');

      // Assert
      expect(documents).toEqual([]);
    });
  });

  describe('findByDocumentPath()', () => {
    test('should retrieve documents by exact path', async () => {
      // Arrange
      const input: CreateDocumentInput = {
        vendor_name: 'TestVendor',
        document_name: 'invoice.pdf',
        document_path: 'testvendor/inbox/2024/invoice.pdf',
        document_size_bytes: 5120,
        document_type: 'application/pdf',
        processing_status: 'pending',
      };
      await repository.create(input);

      // Act
      const documents = await repository.findByDocumentPath('testvendor/inbox/2024/invoice.pdf');

      // Assert
      expect(documents).toHaveLength(1);
      expect(documents[0].document_path).toBe('testvendor/inbox/2024/invoice.pdf');
      expect(documents[0].vendor_name).toBe('TestVendor');
    });

    test('should return empty array for non-existent path', async () => {
      // Act
      const documents = await repository.findByDocumentPath('nonexistent/path.pdf');

      // Assert
      expect(documents).toEqual([]);
    });
  });

  describe('updateOcrResults()', () => {
    test('should update OCR results for existing document', async () => {
      // Arrange - Create document
      const input: CreateDocumentInput = {
        vendor_name: 'TestVendor',
        document_name: 'invoice.pdf',
        document_path: 'testvendor/inbox/invoice.pdf',
        document_size_bytes: 1024,
        document_type: 'application/pdf',
        processing_status: 'pending',
      };
      const resultId = await repository.create(input);

      // Act - Update OCR results
      await repository.updateOcrResults({
        result_id: resultId,
        doc_intel_extracted_text: 'Sample OCR text from invoice',
        doc_intel_structured_data: JSON.stringify({ total: 1500.5 }),
        doc_intel_confidence_score: 0.95,
        doc_intel_page_count: 1,
        doc_intel_table_count: 2,
        doc_intel_cost_usd: 0.01,
        doc_intel_prompt_used: 'invoice-extraction-v1',
      });

      // Assert
      const updated = await repository.findById(resultId);
      expect(updated?.doc_intel_confidence_score).toBe(0.95);
      expect(updated?.doc_intel_page_count).toBe(1);
      expect(updated?.doc_intel_table_count).toBe(2);
      expect(updated?.processing_status).toBe('ocr_complete');
      expect(updated?.updated_at.getTime()).toBeGreaterThan(updated!.created_at.getTime());
    });
  });

  describe('updateAiMapping()', () => {
    test('should update AI mapped products for existing document', async () => {
      // Arrange - Create document
      const input: CreateDocumentInput = {
        vendor_name: 'TestVendor',
        document_name: 'invoice.pdf',
        document_path: 'testvendor/inbox/invoice.pdf',
        document_size_bytes: 1024,
        document_type: 'application/pdf',
        processing_status: 'ocr_complete',
      };
      const resultId = await repository.create(input);

      // Act - Update AI mapping
      const mappedProducts = JSON.stringify([
        { sku: 'WIDGET-001', name: 'Blue Widget', price: 10.5, quantity: 100 },
        { sku: 'GADGET-002', name: 'Red Gadget', price: 25.0, quantity: 50 },
      ]);
      await repository.updateAiMapping({
        result_id: resultId,
        ai_mapping_result: mappedProducts,
        ai_model_used: 'gpt-4o-2024-08-06',
        ai_model_cost_usd: 0.05,
        ai_confidence_score: 0.88,
        ai_completeness_score: 0.92,
        product_count: 2,
      });

      // Assert
      const updated = await repository.findById(resultId);
      expect(updated?.ai_mapping_result).toBe(mappedProducts);
      expect(updated?.ai_model_used).toBe('gpt-4o-2024-08-06');
      expect(updated?.ai_confidence_score).toBe(0.88);
      expect(updated?.product_count).toBe(2);
      expect(updated?.processing_status).toBe('completed');
      expect(updated?.updated_at.getTime()).toBeGreaterThan(updated!.created_at.getTime());
    });
  });

  describe('updateStatus()', () => {
    test('should update processing status', async () => {
      // Arrange
      const input: CreateDocumentInput = {
        vendor_name: 'TestVendor',
        document_name: 'invoice.pdf',
        document_path: 'testvendor/inbox/invoice.pdf',
        document_size_bytes: 1024,
        document_type: 'application/pdf',
        processing_status: 'pending',
      };
      const resultId = await repository.create(input);

      // Act
      await repository.updateStatus(resultId, 'ocr_complete');

      // Assert
      const updated = await repository.findById(resultId);
      expect(updated?.processing_status).toBe('ocr_complete');
    });

    test('should update to failed status', async () => {
      // Arrange
      const input: CreateDocumentInput = {
        vendor_name: 'TestVendor',
        document_name: 'invoice.pdf',
        document_path: 'testvendor/inbox/invoice.pdf',
        document_size_bytes: 1024,
        document_type: 'application/pdf',
        processing_status: 'pending',
      };
      const resultId = await repository.create(input);

      // Act
      await repository.updateStatus(resultId, 'failed');

      // Assert
      const updated = await repository.findById(resultId);
      expect(updated?.processing_status).toBe('failed');
    });
  });

  describe('updateExportStatus()', () => {
    test('should update export status to confirmed', async () => {
      // Arrange
      const input: CreateDocumentInput = {
        vendor_name: 'TestVendor',
        document_name: 'invoice.pdf',
        document_path: 'testvendor/inbox/invoice.pdf',
        document_size_bytes: 1024,
        document_type: 'application/pdf',
        processing_status: 'completed',
      };
      const resultId = await repository.create(input);

      // Act
      await repository.updateExportStatus(resultId, 'confirmed');

      // Assert
      const updated = await repository.findById(resultId);
      expect(updated?.export_status).toBe('confirmed');
    });
  });

  describe('query() with filters', () => {
    test('should query documents with status filter', async () => {
      // Arrange - Create documents with different statuses
      await repository.create({
        vendor_name: 'Vendor1',
        document_name: 'doc1.pdf',
        document_path: 'vendor1/doc1.pdf',
        document_size_bytes: 1024,
        document_type: 'application/pdf',
        processing_status: 'pending',
      });
      await repository.create({
        vendor_name: 'Vendor1',
        document_name: 'doc2.pdf',
        document_path: 'vendor1/doc2.pdf',
        document_size_bytes: 2048,
        document_type: 'application/pdf',
        processing_status: 'ocr_complete',
      });
      await repository.create({
        vendor_name: 'Vendor1',
        document_name: 'doc3.pdf',
        document_path: 'vendor1/doc3.pdf',
        document_size_bytes: 3072,
        document_type: 'application/pdf',
        processing_status: 'ocr_complete',
      });

      // Act
      const results = await repository.query({ processing_status: 'ocr_complete' });

      // Assert
      expect(results).toHaveLength(2);
      expect(results.every((doc) => doc.processing_status === 'ocr_complete')).toBe(true);
    });

    test('should query documents with vendor and export status filters', async () => {
      // Arrange
      await repository.create({
        vendor_name: 'VendorA',
        document_name: 'doc1.pdf',
        document_path: 'vendora/doc1.pdf',
        document_size_bytes: 1024,
        document_type: 'application/pdf',
        processing_status: 'completed',
      });
      const doc2Id = await repository.create({
        vendor_name: 'VendorA',
        document_name: 'doc2.pdf',
        document_path: 'vendora/doc2.pdf',
        document_size_bytes: 2048,
        document_type: 'application/pdf',
        processing_status: 'completed',
      });
      await repository.updateExportStatus(doc2Id, 'confirmed');

      await repository.create({
        vendor_name: 'VendorB',
        document_name: 'doc3.pdf',
        document_path: 'vendorb/doc3.pdf',
        document_size_bytes: 3072,
        document_type: 'application/pdf',
        processing_status: 'completed',
      });

      // Act
      const results = await repository.query({
        vendor_name: 'VendorA',
        export_status: 'not_exported',
      });

      // Assert
      expect(results).toHaveLength(1);
      expect(results[0].vendor_name).toBe('VendorA');
      expect(results[0].export_status).toBe('not_exported');
    });
  });

  describe('createReprocessingVersion()', () => {
    test('should create new version with parent-child relationship', async () => {
      // Arrange - Create original document
      const originalInput: CreateDocumentInput = {
        vendor_name: 'TestVendor',
        document_name: 'invoice.pdf',
        document_path: 'testvendor/inbox/invoice.pdf',
        document_size_bytes: 1024,
        document_type: 'application/pdf',
        processing_status: 'completed',
      };
      const originalId = await repository.create(originalInput);

      // Update with OCR results
      await repository.updateOcrResults({
        result_id: originalId,
        doc_intel_extracted_text: 'Original OCR text',
        doc_intel_structured_data: '{"total": 100}',
        doc_intel_confidence_score: 0.9,
        doc_intel_page_count: 1,
        doc_intel_table_count: 1,
        doc_intel_cost_usd: 0.01,
        doc_intel_prompt_used: 'v1',
      });

      // Act - Create reprocessing version
      const newVersionId = await repository.createReprocessingVersion(originalId, originalId);

      // Assert - New version exists
      expect(newVersionId).toBeDefined();
      expect(newVersionId).not.toBe(originalId);

      // Assert - New version has correct data
      const newVersion = await repository.findById(newVersionId);
      expect(newVersion).toBeDefined();
      expect(newVersion?.vendor_name).toBe('TestVendor');
      expect(newVersion?.document_name).toBe('invoice.pdf');
      expect(newVersion?.document_path).toBe('testvendor/inbox/invoice.pdf');
      expect(newVersion?.processing_status).toBe('ocr_complete'); // Has OCR, ready for AI
      expect(newVersion?.export_status).toBe('pending');
      expect(newVersion?.parent_document_id).toBe(originalId);

      // Assert - OCR data is reset
      expect(newVersion?.ai_mapping_result).toBeNull();
    });
  });

  describe('deleteById()', () => {
    test('should delete document by ID and return count', async () => {
      // Arrange
      const input: CreateDocumentInput = {
        vendor_name: 'TestVendor',
        document_name: 'invoice.pdf',
        document_path: 'testvendor/inbox/invoice.pdf',
        document_size_bytes: 1024,
        document_type: 'application/pdf',
        processing_status: 'pending',
      };
      const resultId = await repository.create(input);

      // Act
      const deleteCount = await repository.deleteById(resultId);

      // Assert
      expect(deleteCount).toBe(1);

      // Verify deletion
      const deleted = await repository.findById(resultId);
      expect(deleted).toBeNull();
    });

    test('should return 0 for non-existent ID', async () => {
      // Act
      const deleteCount = await repository.deleteById('00000000-0000-0000-0000-000000000000');

      // Assert
      expect(deleteCount).toBe(0);
    });
  });

  describe('deleteByVendor()', () => {
    test('should delete all documents for vendor', async () => {
      // Arrange - Create 3 documents for vendor
      const vendor = 'TestVendor';
      await repository.create({
        vendor_name: vendor,
        document_name: 'doc1.pdf',
        document_path: `${vendor}/doc1.pdf`,
        document_size_bytes: 1024,
        document_type: 'application/pdf',
        processing_status: 'pending',
      });
      await repository.create({
        vendor_name: vendor,
        document_name: 'doc2.pdf',
        document_path: `${vendor}/doc2.pdf`,
        document_size_bytes: 2048,
        document_type: 'application/pdf',
        processing_status: 'ocr_complete',
      });
      await repository.create({
        vendor_name: vendor,
        document_name: 'doc3.pdf',
        document_path: `${vendor}/doc3.pdf`,
        document_size_bytes: 3072,
        document_type: 'application/pdf',
        processing_status: 'completed',
      });

      // Create document for different vendor
      await repository.create({
        vendor_name: 'OtherVendor',
        document_name: 'doc4.pdf',
        document_path: 'othervendor/doc4.pdf',
        document_size_bytes: 4096,
        document_type: 'application/pdf',
        processing_status: 'pending',
      });

      // Act
      const deleteCount = await repository.deleteByVendor(vendor);

      // Assert
      expect(deleteCount).toBe(3);

      // Verify deletion
      const remaining = await repository.findByVendor(vendor);
      expect(remaining).toHaveLength(0);

      // Verify other vendor not affected
      const otherVendorDocs = await repository.findByVendor('OtherVendor');
      expect(otherVendorDocs).toHaveLength(1);
    });

    test('should return 0 for vendor with no documents', async () => {
      // Act
      const deleteCount = await repository.deleteByVendor('NonExistentVendor');

      // Assert
      expect(deleteCount).toBe(0);
    });
  });

  describe('deleteByDocumentPath()', () => {
    test('should delete documents by exact path', async () => {
      // Arrange
      const path = 'testvendor/inbox/invoice.pdf';
      await repository.create({
        vendor_name: 'TestVendor',
        document_name: 'invoice.pdf',
        document_path: path,
        document_size_bytes: 1024,
        document_type: 'application/pdf',
        processing_status: 'pending',
      });

      // Act
      const deleteCount = await repository.deleteByDocumentPath(path);

      // Assert
      expect(deleteCount).toBe(1);

      // Verify deletion
      const deleted = await repository.findByDocumentPath(path);
      expect(deleted).toHaveLength(0);
    });

    test('should return 0 for non-existent path', async () => {
      // Act
      const deleteCount = await repository.deleteByDocumentPath('nonexistent/path.pdf');

      // Assert
      expect(deleteCount).toBe(0);
    });
  });
});
