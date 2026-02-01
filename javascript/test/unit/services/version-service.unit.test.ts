import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentRepository } from '../../../src/data/repositories/DocumentRepository.js';
import type { Document } from '../../../src/models/document.js';
import { VersionService } from '../../../src/services/version-service.js';

describe('VersionService - Unit Tests', () => {
  let versionService: VersionService;
  let mockDocumentRepo: DocumentRepository;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock DocumentRepository
    mockDocumentRepo = {
      findById: vi.fn(),
      findByDocumentPath: vi.fn(),
      deleteById: vi.fn(),
    } as unknown as DocumentRepository;

    versionService = new VersionService(mockDocumentRepo);
  });

  describe('getHistory', () => {
    it('should get version history for document', async () => {
      const mockDocument: Document = {
        result_id: 'original-uuid',
        document_name: 'catalog.pdf',
        document_path: 'TEST/catalog.pdf',
        document_type: 'application/pdf',
        vendor_name: 'TEST',
        processing_status: 'completed',
        export_status: 'not_exported',
        reprocessing_count: 0,
        parent_document_id: null,
        doc_intel_page_count: 5,
        doc_intel_table_count: 2,
        doc_intel_cost_usd: 0.1,
        doc_intel_confidence_score: null,
        ai_mapping_result: null,
        ai_model_used: null,
        ai_model_cost_usd: 0.15,
        ai_confidence_score: 0.95,
        ai_completeness_score: 0.9,
        product_count: 10,
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-01'),
      };

      const mockVersions: Document[] = [
        mockDocument,
        {
          ...mockDocument,
          result_id: 'version-1-uuid',
          reprocessing_count: 1,
          parent_document_id: 'original-uuid',
          product_count: 12,
          ai_confidence_score: 0.97,
          ai_completeness_score: 0.92,
          ai_model_cost_usd: 0.16,
          created_at: new Date('2024-01-02'),
          updated_at: new Date('2024-01-02'),
        },
      ];

      vi.mocked(mockDocumentRepo.findById).mockResolvedValue(mockDocument);
      vi.mocked(mockDocumentRepo.findByDocumentPath).mockResolvedValue(mockVersions);

      const documentId = 'original-uuid';
      const result = await versionService.getHistory(documentId);

      expect(result.versions).toHaveLength(2);
      expect(result.versions[0].reprocessingCount).toBe(0);
      expect(result.versions[1].parentDocumentId).toBe('original-uuid');
      expect(result.rootDocumentId).toBe('original-uuid');
      expect(mockDocumentRepo.findById).toHaveBeenCalledWith(documentId);
      expect(mockDocumentRepo.findByDocumentPath).toHaveBeenCalledWith('original-uuid');
    });

    it('should handle non-existent document', async () => {
      vi.mocked(mockDocumentRepo.findById).mockResolvedValue(null);

      const documentId = 'nonexistent-uuid';
      await expect(versionService.getHistory(documentId)).rejects.toThrow('Document not found');
      expect(mockDocumentRepo.findById).toHaveBeenCalledWith(documentId);
    });

    it('should return versions in chronological order', async () => {
      const baseDoc: Document = {
        result_id: 'original',
        document_name: 'catalog.pdf',
        document_path: 'TEST/catalog.pdf',
        document_type: 'application/pdf',
        vendor_name: 'TEST',
        processing_status: 'completed',
        export_status: 'not_exported',
        reprocessing_count: 0,
        parent_document_id: null,
        doc_intel_page_count: 5,
        doc_intel_table_count: 2,
        doc_intel_cost_usd: 0.1,
        doc_intel_confidence_score: null,
        ai_mapping_result: null,
        ai_model_used: null,
        ai_model_cost_usd: 0.15,
        ai_confidence_score: 0.95,
        ai_completeness_score: 0.9,
        product_count: 10,
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-01'),
      };

      const mockVersions: Document[] = [
        baseDoc,
        {
          ...baseDoc,
          result_id: 'version-1',
          reprocessing_count: 1,
          parent_document_id: 'original',
          product_count: 11,
          ai_confidence_score: 0.96,
          ai_completeness_score: 0.91,
          ai_model_cost_usd: 0.16,
          created_at: new Date('2024-01-02'),
          updated_at: new Date('2024-01-02'),
        },
        {
          ...baseDoc,
          result_id: 'version-2',
          reprocessing_count: 2,
          parent_document_id: 'original',
          product_count: 12,
          ai_confidence_score: 0.97,
          ai_completeness_score: 0.92,
          ai_model_cost_usd: 0.17,
          created_at: new Date('2024-01-03'),
          updated_at: new Date('2024-01-03'),
        },
      ];

      vi.mocked(mockDocumentRepo.findById).mockResolvedValue(baseDoc);
      vi.mocked(mockDocumentRepo.findByDocumentPath).mockResolvedValue(mockVersions);

      const result = await versionService.getHistory('original');

      // Should be ordered by reprocessing_count ASC (original first)
      expect(result.versions[0].reprocessingCount).toBe(0);
      expect(result.versions[2].reprocessingCount).toBe(2);
    });
  });

  describe('deleteRun', () => {
    it('should delete specific version run', async () => {
      const mockVersion: Document = {
        result_id: 'version-1-uuid',
        document_name: 'catalog.pdf',
        document_path: 'TEST/catalog.pdf',
        document_type: 'application/pdf',
        vendor_name: 'TEST',
        processing_status: 'completed',
        export_status: 'not_exported',
        reprocessing_count: 1,
        parent_document_id: 'original-uuid',
        doc_intel_page_count: 5,
        doc_intel_table_count: 2,
        doc_intel_cost_usd: 0.1,
        doc_intel_confidence_score: null,
        ai_mapping_result: null,
        ai_model_used: null,
        ai_model_cost_usd: 0.15,
        ai_confidence_score: 0.95,
        ai_completeness_score: 0.9,
        product_count: 10,
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-01'),
      };

      vi.mocked(mockDocumentRepo.findById).mockResolvedValue(mockVersion);
      vi.mocked(mockDocumentRepo.deleteById).mockResolvedValue(1);

      const versionId = 'version-1-uuid';
      const result = await versionService.deleteRun(versionId);

      expect(result.documentId).toBe('version-1-uuid');
      expect(result.version).toBe(1);
      expect(mockDocumentRepo.findById).toHaveBeenCalledWith(versionId);
      expect(mockDocumentRepo.deleteById).toHaveBeenCalledWith(versionId);
    });

    it('should handle deletion of non-existent version', async () => {
      vi.mocked(mockDocumentRepo.findById).mockResolvedValue(null);

      const versionId = 'nonexistent-uuid';
      await expect(versionService.deleteRun(versionId)).rejects.toThrow('Document not found');
    });

    it('should prevent deletion of root document', async () => {
      const rootDoc: Document = {
        result_id: 'root-uuid',
        document_name: 'catalog.pdf',
        document_path: 'TEST/catalog.pdf',
        document_type: 'application/pdf',
        vendor_name: 'TEST',
        processing_status: 'completed',
        export_status: 'not_exported',
        reprocessing_count: 0,
        parent_document_id: null,
        doc_intel_page_count: 5,
        doc_intel_table_count: 2,
        doc_intel_cost_usd: 0.1,
        doc_intel_confidence_score: null,
        ai_mapping_result: null,
        ai_model_used: null,
        ai_model_cost_usd: 0.15,
        ai_confidence_score: 0.95,
        ai_completeness_score: 0.9,
        product_count: 10,
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-01'),
      };

      vi.mocked(mockDocumentRepo.findById).mockResolvedValue(rootDoc);

      const rootId = 'root-uuid';
      await expect(versionService.deleteRun(rootId)).rejects.toThrow('Cannot delete root document');
    });
  });
});
