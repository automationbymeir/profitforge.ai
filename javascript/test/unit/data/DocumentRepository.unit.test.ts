/**
 * DocumentRepository Unit Tests
 *
 * Tests all repository methods with mocked SQL connection pool.
 * Validates query structure, parameter binding, and error handling.
 */

import sql from 'mssql';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CreateDocumentInput,
  UpdateAiMappingInput,
  UpdateOcrResultsInput,
} from '../../../src/data/repositories/DocumentRepository.js';
import { DocumentRepository } from '../../../src/data/repositories/DocumentRepository.js';

describe('DocumentRepository', () => {
  let mockPool: sql.ConnectionPool;
  let mockRequest: any;
  let repository: DocumentRepository;

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

    repository = new DocumentRepository(mockPool);
  });

  describe('create()', () => {
    it('should insert document and return result_id', async () => {
      const input: CreateDocumentInput = {
        document_name: 'test-vendor.pdf',
        document_path: 'test-vendor/test-vendor.pdf',
        document_size_bytes: 12345,
        document_type: 'application/pdf',
        vendor_name: 'test-vendor',
        processing_status: 'pending',
      };

      const mockResultId = '550e8400-e29b-41d4-a716-446655440000';
      mockRequest.query.mockResolvedValue({
        recordset: [{ result_id: mockResultId }],
      });

      const resultId = await repository.create(input);

      expect(resultId).toBe(mockResultId);
      expect(mockPool.request).toHaveBeenCalled();
      expect(mockRequest.input).toHaveBeenCalledWith('vendorName', sql.NVarChar, 'test-vendor');
      expect(mockRequest.input).toHaveBeenCalledWith(
        'documentName',
        sql.NVarChar,
        'test-vendor.pdf'
      );
      expect(mockRequest.input).toHaveBeenCalledWith(
        'documentPath',
        sql.NVarChar,
        'test-vendor/test-vendor.pdf'
      );
      expect(mockRequest.input).toHaveBeenCalledWith('fileSize', sql.BigInt, 12345);
      expect(mockRequest.input).toHaveBeenCalledWith('fileType', sql.NVarChar, 'application/pdf');
      expect(mockRequest.input).toHaveBeenCalledWith('status', sql.NVarChar, 'pending');
      expect(mockRequest.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO vvocr.document_processing_results')
      );
      expect(mockRequest.query).toHaveBeenCalledWith(
        expect.stringContaining('OUTPUT INSERTED.result_id')
      );
    });

    it('should throw error if vendor_name is empty', async () => {
      const input: CreateDocumentInput = {
        document_name: 'test.pdf',
        document_path: 'test/test.pdf',
        document_size_bytes: 12345,
        document_type: 'application/pdf',
        vendor_name: '',
      };

      await expect(repository.create(input)).rejects.toThrow('vendor_name is required');
    });

    it('should throw error if document_name is empty', async () => {
      const input: CreateDocumentInput = {
        document_name: '',
        document_path: 'test/test.pdf',
        document_size_bytes: 12345,
        document_type: 'application/pdf',
        vendor_name: 'test-vendor',
      };

      await expect(repository.create(input)).rejects.toThrow('document_name is required');
    });

    it('should throw error if document_path is empty', async () => {
      const input: CreateDocumentInput = {
        document_name: 'test.pdf',
        document_path: '',
        document_size_bytes: 12345,
        document_type: 'application/pdf',
        vendor_name: 'test-vendor',
      };

      await expect(repository.create(input)).rejects.toThrow('document_path is required');
    });
  });

  describe('findById()', () => {
    it('should return document when found', async () => {
      const mockDocument = {
        result_id: '550e8400-e29b-41d4-a716-446655440000',
        document_name: 'test.pdf',
        vendor_name: 'test-vendor',
        processing_status: 'pending',
      };

      mockRequest.query.mockResolvedValue({
        recordset: [mockDocument],
      });

      const result = await repository.findById('550e8400-e29b-41d4-a716-446655440000');

      expect(result).toEqual(mockDocument);
      expect(mockRequest.input).toHaveBeenCalledWith(
        'resultId',
        sql.UniqueIdentifier,
        '550e8400-e29b-41d4-a716-446655440000'
      );
      expect(mockRequest.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE result_id = @resultId')
      );
    });

    it('should return null when document not found', async () => {
      mockRequest.query.mockResolvedValue({
        recordset: [],
      });

      const result = await repository.findById('550e8400-e29b-41d4-a716-446655440000');

      expect(result).toBeNull();
    });
  });

  describe('findByVendor()', () => {
    it('should return documents for vendor ordered by created_at DESC', async () => {
      const mockDocuments = [
        { result_id: '1', vendor_name: 'test-vendor', created_at: new Date('2024-01-02') },
        { result_id: '2', vendor_name: 'test-vendor', created_at: new Date('2024-01-01') },
      ];

      mockRequest.query.mockResolvedValue({
        recordset: mockDocuments,
      });

      const results = await repository.findByVendor('test-vendor');

      expect(results).toEqual(mockDocuments);
      expect(mockRequest.input).toHaveBeenCalledWith('vendorName', sql.NVarChar, 'test-vendor');
      expect(mockRequest.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE vendor_name = @vendorName')
      );
      expect(mockRequest.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at DESC')
      );
    });

    it('should return empty array when no documents found', async () => {
      mockRequest.query.mockResolvedValue({
        recordset: [],
      });

      const results = await repository.findByVendor('nonexistent-vendor');

      expect(results).toEqual([]);
    });
  });

  describe('updateOcrResults()', () => {
    it('should update OCR results and return rows affected', async () => {
      const input: UpdateOcrResultsInput = {
        result_id: '550e8400-e29b-41d4-a716-446655440000',
        doc_intel_extracted_text: 'Extracted text content',
        doc_intel_structured_data: '{"tables": []}',
        doc_intel_confidence_score: 0.95,
        doc_intel_page_count: 5,
        doc_intel_table_count: 2,
        doc_intel_cost_usd: 0.015,
        doc_intel_prompt_used: 'prebuilt-invoice',
      };

      mockRequest.query.mockResolvedValue({
        rowsAffected: [1],
      });

      const rowsAffected = await repository.updateOcrResults(input);

      expect(rowsAffected).toBe(1);
      expect(mockRequest.input).toHaveBeenCalledWith(
        'resultId',
        sql.UniqueIdentifier,
        input.result_id
      );
      expect(mockRequest.input).toHaveBeenCalledWith(
        'extractedText',
        sql.NVarChar,
        input.doc_intel_extracted_text
      );
      expect(mockRequest.input).toHaveBeenCalledWith('confidenceScore', sql.Decimal(5, 4), 0.95);
      expect(mockRequest.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE vvocr.document_processing_results')
      );
      expect(mockRequest.query).toHaveBeenCalledWith(
        expect.stringContaining("processing_status = 'ocr_complete'")
      );
    });
  });

  describe('updateAiMapping()', () => {
    it('should update AI mapping results and return rows affected', async () => {
      const input: UpdateAiMappingInput = {
        result_id: '550e8400-e29b-41d4-a716-446655440000',
        ai_mapping_result: '{"products": [{"name": "Product 1", "sku": "SKU1", "price": 10.99}]}',
        ai_model_used: 'gpt-4',
        ai_model_cost_usd: 0.025,
        ai_confidence_score: 0.92,
        ai_completeness_score: 0.88,
        product_count: 1,
      };

      mockRequest.query.mockResolvedValue({
        rowsAffected: [1],
      });

      const rowsAffected = await repository.updateAiMapping(input);

      expect(rowsAffected).toBe(1);
      expect(mockRequest.input).toHaveBeenCalledWith(
        'resultId',
        sql.UniqueIdentifier,
        input.result_id
      );
      expect(mockRequest.input).toHaveBeenCalledWith(
        'mappingResult',
        sql.NVarChar,
        input.ai_mapping_result
      );
      expect(mockRequest.input).toHaveBeenCalledWith('modelUsed', sql.NVarChar, 'gpt-4');
      expect(mockRequest.input).toHaveBeenCalledWith('productCount', sql.Int, 1);
      expect(mockRequest.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE vvocr.document_processing_results')
      );
      expect(mockRequest.query).toHaveBeenCalledWith(
        expect.stringContaining("processing_status = 'completed'")
      );
    });
  });

  describe('deleteById()', () => {
    it('should delete document and return rows affected', async () => {
      mockRequest.query.mockResolvedValue({
        rowsAffected: [1],
      });

      const rowsAffected = await repository.deleteById('550e8400-e29b-41d4-a716-446655440000');

      expect(rowsAffected).toBe(1);
      expect(mockRequest.input).toHaveBeenCalledWith(
        'resultId',
        sql.UniqueIdentifier,
        '550e8400-e29b-41d4-a716-446655440000'
      );
      expect(mockRequest.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM vvocr.document_processing_results')
      );
      expect(mockRequest.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE result_id = @resultId')
      );
    });

    it('should return 0 when document not found', async () => {
      mockRequest.query.mockResolvedValue({
        rowsAffected: [0],
      });

      const rowsAffected = await repository.deleteById('nonexistent-id');

      expect(rowsAffected).toBe(0);
    });
  });

  describe('query()', () => {
    it('should query documents with filters', async () => {
      const mockDocuments = [
        { result_id: '1', vendor_name: 'test-vendor', processing_status: 'completed' },
      ];

      mockRequest.query.mockResolvedValue({
        recordset: mockDocuments,
      });

      const results = await repository.query({
        vendor_name: 'test-vendor',
        processing_status: 'completed',
        limit: 10,
        offset: 0,
      });

      expect(results).toEqual(mockDocuments);
      expect(mockRequest.input).toHaveBeenCalledWith('vendorName', sql.NVarChar, 'test-vendor');
      expect(mockRequest.input).toHaveBeenCalledWith('processingStatus', sql.NVarChar, 'completed');
      expect(mockRequest.query).toHaveBeenCalledWith(
        expect.stringContaining('OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY')
      );
    });

    it('should query all documents when no filters provided', async () => {
      mockRequest.query.mockResolvedValue({
        recordset: [],
      });

      const results = await repository.query();

      expect(results).toEqual([]);
      expect(mockRequest.query).toHaveBeenCalledWith(expect.stringContaining('WHERE 1=1'));
      expect(mockRequest.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at DESC')
      );
    });
  });

  describe('createReprocessingVersion()', () => {
    it('should create new version with incremented reprocessing_count', async () => {
      const originalDoc = {
        document_name: 'test.pdf',
        document_path: 'test-vendor/test.pdf',
        document_size_bytes: 12345,
        document_type: 'application/pdf',
        vendor_name: 'test-vendor',
        doc_intel_extracted_text: 'text',
        doc_intel_structured_data: '{}',
        doc_intel_confidence_score: 0.95,
        doc_intel_page_count: 5,
        doc_intel_table_count: 2,
        doc_intel_cost_usd: 0.015,
        doc_intel_prompt_used: 'prebuilt-invoice',
        reprocessing_count: 0,
        parent_document_id: null,
      };

      const newResultId = '550e8400-e29b-41d4-a716-446655440001';

      // Mock existing document query
      mockRequest.query
        .mockResolvedValueOnce({
          recordset: [originalDoc],
        })
        // Mock insert new version
        .mockResolvedValueOnce({
          recordset: [{ result_id: newResultId }],
        });

      const resultId = await repository.createReprocessingVersion(
        '550e8400-e29b-41d4-a716-446655440000',
        null
      );

      expect(resultId).toBe(newResultId);
      expect(mockRequest.input).toHaveBeenCalledWith('reprocessingCount', sql.Int, 1);
      // Verify INSERT query contains new status values
      const insertCall = mockRequest.query.mock.calls.find((call: any[]) =>
        call[0].includes('INSERT INTO vvocr.document_processing_results')
      );
      expect(insertCall).toBeDefined();
      expect(insertCall[0]).toContain("'ocr_complete'");
      expect(insertCall[0]).toContain("'pending'");
    });

    it('should throw error when original document not found', async () => {
      mockRequest.query.mockResolvedValue({
        recordset: [],
      });

      await expect(repository.createReprocessingVersion('nonexistent-id', null)).rejects.toThrow(
        'Document not found: nonexistent-id'
      );
    });
  });
});
