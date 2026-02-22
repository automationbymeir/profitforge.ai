/**
 * DocumentRepository Unit Tests
 *
 * Tests all repository methods with mocked Prisma Client.
 * Validates Prisma operations, data transformations, and error handling.
 */

import type { PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CreateDocumentInput,
  UpdateAiMappingInput,
  UpdateOcrResultsInput,
} from '../../../src/data/repositories/DocumentRepository.prisma.js';
import { DocumentRepository } from '../../../src/data/repositories/DocumentRepository.prisma.js';

describe('DocumentRepository', () => {
  let mockPrisma: any;
  let repository: DocumentRepository;

  beforeEach(() => {
    // Create mock Prisma client
    mockPrisma = {
      document_processing_results: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        updateMany: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(),
      },
      vendor_products: {
        findMany: vi.fn(),
        deleteMany: vi.fn(),
      },
    } as any;

    repository = new DocumentRepository(mockPrisma as PrismaClient);
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
      mockPrisma.document_processing_results.create.mockResolvedValue({
        result_id: mockResultId,
      });

      const resultId = await repository.create(input);

      expect(resultId).toBe(mockResultId);
      expect(mockPrisma.document_processing_results.create).toHaveBeenCalledWith({
        data: {
          document_name: 'test-vendor.pdf',
          document_path: 'test-vendor/test-vendor.pdf',
          document_size_bytes: BigInt(12345),
          document_type: 'application/pdf',
          vendor_name: 'test-vendor',
          processing_status: 'pending',
          export_status: 'not_exported',
          processing_started_at: expect.any(Date),
          ai_model_requested: null,
          ai_prompt_requested: null,
        },
        select: {
          result_id: true,
        },
      });
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
        document_path: 'test-vendor/test.pdf',
        document_size_bytes: BigInt(12345),
        document_type: 'application/pdf',
        vendor_name: 'test-vendor',
        processing_status: 'pending',
        export_status: 'not_exported',
        uploaded_at: new Date(),
        processing_started_at: new Date(),
        processing_completed_at: null,
        exported_at: null,
        doc_intel_confidence_score: null,
        doc_intel_cost_usd: null,
        doc_intel_prompt_used: null,
        ai_model_requested: null,
        ai_prompt_requested: null,
        ai_mapping_result: null,
        ai_prompt_used: null,
        ai_model_used: null,
        ai_model_cost_usd: null,
        ai_confidence_score: null,
        ai_completeness_score: null,
        ai_prompt_tokens: null,
        ai_completion_tokens: null,
        requires_manual_review: false,
        manual_review_reason: null,
        reviewed_by: null,
        reviewed_at: null,
        error_message: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockPrisma.document_processing_results.findUnique.mockResolvedValue(mockDocument);

      const result = await repository.findById('550e8400-e29b-41d4-a716-446655440000');

      expect(result).toBeDefined();
      expect(result?.result_id).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(result?.document_name).toBe('test.pdf');
      expect(result?.vendor_name).toBe('test-vendor');
      expect(result?.processing_status).toBe('pending');
      expect(mockPrisma.document_processing_results.findUnique).toHaveBeenCalledWith({
        where: { result_id: '550e8400-e29b-41d4-a716-446655440000' },
      });
    });

    it('should return null when document not found', async () => {
      mockPrisma.document_processing_results.findUnique.mockResolvedValue(null);

      const result = await repository.findById('550e8400-e29b-41d4-a716-446655440000');

      expect(result).toBeNull();
    });
  });

  describe('findByVendor()', () => {
    it('should return documents for vendor ordered by created_at DESC', async () => {
      const mockDocuments = [
        {
          result_id: '1',
          document_name: 'doc1.pdf',
          document_path: 'test-vendor/doc1.pdf',
          document_size_bytes: BigInt(1000),
          document_type: 'application/pdf',
          vendor_name: 'test-vendor',
          processing_status: 'pending',
          export_status: 'not_exported',
          uploaded_at: new Date('2024-01-02'),
          processing_started_at: new Date('2024-01-02'),
          processing_completed_at: null,
          exported_at: null,
          doc_intel_confidence_score: null,
          doc_intel_cost_usd: null,
          doc_intel_prompt_used: null,
          ai_model_requested: null,
          ai_prompt_requested: null,
          ai_mapping_result: null,
          ai_prompt_used: null,
          ai_model_used: null,
          ai_model_cost_usd: null,
          ai_confidence_score: null,
          ai_completeness_score: null,
          ai_prompt_tokens: null,
          ai_completion_tokens: null,
          requires_manual_review: false,
          manual_review_reason: null,
          reviewed_by: null,
          reviewed_at: null,
          error_message: null,
          created_at: new Date('2024-01-02'),
          updated_at: new Date('2024-01-02'),
        },
        {
          result_id: '2',
          document_name: 'doc2.pdf',
          document_path: 'test-vendor/doc2.pdf',
          document_size_bytes: BigInt(2000),
          document_type: 'application/pdf',
          vendor_name: 'test-vendor',
          processing_status: 'pending',
          export_status: 'not_exported',
          uploaded_at: new Date('2024-01-01'),
          processing_started_at: new Date('2024-01-01'),
          processing_completed_at: null,
          exported_at: null,
          doc_intel_confidence_score: null,
          doc_intel_cost_usd: null,
          doc_intel_prompt_used: null,
          ai_model_requested: null,
          ai_prompt_requested: null,
          ai_mapping_result: null,
          ai_prompt_used: null,
          ai_model_used: null,
          ai_model_cost_usd: null,
          ai_confidence_score: null,
          ai_completeness_score: null,
          ai_prompt_tokens: null,
          ai_completion_tokens: null,
          requires_manual_review: false,
          manual_review_reason: null,
          reviewed_by: null,
          reviewed_at: null,
          error_message: null,
          created_at: new Date('2024-01-01'),
          updated_at: new Date('2024-01-01'),
        },
      ];

      mockPrisma.document_processing_results.findMany.mockResolvedValue(mockDocuments);

      const results = await repository.findByVendor('test-vendor');

      expect(results).toHaveLength(2);
      expect(results[0].result_id).toBe('1');
      expect(results[1].result_id).toBe('2');
      expect(mockPrisma.document_processing_results.findMany).toHaveBeenCalledWith({
        where: { vendor_name: 'test-vendor' },
        orderBy: { created_at: 'desc' },
      });
    });

    it('should return empty array when no documents found', async () => {
      mockPrisma.document_processing_results.findMany.mockResolvedValue([]);

      const results = await repository.findByVendor('nonexistent-vendor');

      expect(results).toEqual([]);
    });
  });

  describe('updateOcrResults()', () => {
    it('should update OCR results and return rows affected', async () => {
      const input: UpdateOcrResultsInput = {
        result_id: '550e8400-e29b-41d4-a716-446655440000',
        doc_intel_confidence_score: 0.95,
        doc_intel_cost_usd: 0.015,
        doc_intel_prompt_used: 'prebuilt-invoice',
      };

      mockPrisma.document_processing_results.updateMany.mockResolvedValue({
        count: 1,
      });

      const rowsAffected = await repository.updateOcrResults(input);

      expect(rowsAffected).toBe(1);
      expect(mockPrisma.document_processing_results.updateMany).toHaveBeenCalledWith({
        where: { result_id: input.result_id },
        data: {
          doc_intel_confidence_score: 0.95,
          doc_intel_cost_usd: 0.015,
          doc_intel_prompt_used: 'prebuilt-invoice',
          processing_status: 'ocr_complete',
          updated_at: expect.any(Date),
        },
      });
    });
  });

  describe('updateAiMapping()', () => {
    it('should update AI mapping results and return rows affected', async () => {
      const input: UpdateAiMappingInput = {
        result_id: '550e8400-e29b-41d4-a716-446655440000',
        ai_mapping_result: '{"products": [{"name": "Product 1", "sku": "SKU1", "price": 10.99}]}',
        ai_model_used: 'gpt-4',
        ai_prompt_used: 'Extract products from invoice',
        ai_model_cost_usd: 0.025,
        ai_confidence_score: 0.92,
        ai_completeness_score: 0.88,
        ai_prompt_tokens: 500,
        ai_completion_tokens: 150,
      };

      mockPrisma.document_processing_results.updateMany.mockResolvedValue({
        count: 1,
      });

      const rowsAffected = await repository.updateAiMapping(input);

      expect(rowsAffected).toBe(1);
      expect(mockPrisma.document_processing_results.updateMany).toHaveBeenCalledWith({
        where: { result_id: input.result_id },
        data: {
          ai_mapping_result: input.ai_mapping_result,
          ai_model_used: 'gpt-4',
          ai_prompt_used: 'Extract products from invoice',
          ai_model_cost_usd: 0.025,
          ai_confidence_score: 0.92,
          ai_completeness_score: 0.88,
          ai_prompt_tokens: 500,
          ai_completion_tokens: 150,
          processing_status: 'completed',
          processing_completed_at: expect.any(Date),
          updated_at: expect.any(Date),
        },
      });
    });
  });

  describe('deleteById()', () => {
    it('should delete document and return rows affected', async () => {
      mockPrisma.document_processing_results.delete.mockResolvedValue({});

      const rowsAffected = await repository.deleteById('550e8400-e29b-41d4-a716-446655440000');

      expect(rowsAffected).toBe(1);
      expect(mockPrisma.document_processing_results.delete).toHaveBeenCalledWith({
        where: { result_id: '550e8400-e29b-41d4-a716-446655440000' },
      });
    });

    it('should return 0 when document not found', async () => {
      mockPrisma.document_processing_results.delete.mockRejectedValue(new Error('Not found'));

      const rowsAffected = await repository.deleteById('nonexistent-id');

      expect(rowsAffected).toBe(0);
    });
  });

  describe('query()', () => {
    it('should query documents with filters', async () => {
      const mockDocuments = [
        {
          result_id: '1',
          document_name: 'doc1.pdf',
          document_path: 'test-vendor/doc1.pdf',
          document_size_bytes: BigInt(1000),
          document_type: 'application/pdf',
          vendor_name: 'test-vendor',
          processing_status: 'completed',
          export_status: 'not_exported',
          uploaded_at: new Date(),
          processing_started_at: new Date(),
          processing_completed_at: new Date(),
          exported_at: null,
          doc_intel_confidence_score: null,
          doc_intel_cost_usd: null,
          doc_intel_prompt_used: null,
          ai_model_requested: null,
          ai_prompt_requested: null,
          ai_mapping_result: null,
          ai_prompt_used: null,
          ai_model_used: null,
          ai_model_cost_usd: null,
          ai_confidence_score: null,
          ai_completeness_score: null,
          ai_prompt_tokens: null,
          ai_completion_tokens: null,
          requires_manual_review: false,
          manual_review_reason: null,
          reviewed_by: null,
          reviewed_at: null,
          error_message: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      mockPrisma.document_processing_results.findMany.mockResolvedValue(mockDocuments);

      const results = await repository.query({
        vendor_name: 'test-vendor',
        processing_status: 'completed',
        limit: 10,
        offset: 0,
      });

      expect(results).toHaveLength(1);
      expect(results[0].vendor_name).toBe('test-vendor');
      expect(results[0].processing_status).toBe('completed');
      expect(mockPrisma.document_processing_results.findMany).toHaveBeenCalledWith({
        where: {
          vendor_name: 'test-vendor',
          processing_status: 'completed',
        },
        orderBy: { created_at: 'desc' },
        take: 10,
        skip: 0,
      });
    });

    it('should query all documents when no filters provided', async () => {
      mockPrisma.document_processing_results.findMany.mockResolvedValue([]);

      const results = await repository.query();

      expect(results).toEqual([]);
      expect(mockPrisma.document_processing_results.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { created_at: 'desc' },
        take: undefined,
        skip: undefined,
      });
    });
  });
});
