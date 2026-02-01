import sql from 'mssql';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getVersionService, VersionService } from '../../../src/services/version-service.js';

// Mock database
vi.mock('../../../src/utils/database.js', () => ({
  withDatabase: vi.fn((callback) => {
    const mockPool = {
      request: vi.fn().mockReturnThis(),
      input: vi.fn().mockReturnThis(),
      query: vi.fn(),
      close: vi.fn(),
    };
    return callback(mockPool);
  }),
}));

describe('VersionService - Unit Tests', () => {
  let versionService: VersionService;

  beforeEach(() => {
    vi.clearAllMocks();
    versionService = new VersionService();
  });

  describe('getHistory', () => {
    it('should get version history for document', async () => {
      const mockVersions = [
        {
          result_id: 'original-uuid',
          document_name: 'catalog.pdf',
          vendor_name: 'TEST',
          processing_status: 'completed',
          export_status: 'not_exported',
          reprocessing_count: 0,
          parent_document_id: null,
          product_count: 10,
          ai_confidence_score: 0.95,
          ai_completeness_score: 0.9,
          ai_model_cost_usd: 0.15,
          doc_intel_cost_usd: 0.1,
          created_at: new Date('2024-01-01'),
          processing_completed_at: new Date('2024-01-01'),
          exported_at: null,
        },
        {
          result_id: 'version-1-uuid',
          document_name: 'catalog.pdf',
          vendor_name: 'TEST',
          processing_status: 'completed',
          export_status: 'not_exported',
          reprocessing_count: 1,
          parent_document_id: 'original-uuid',
          product_count: 12,
          ai_confidence_score: 0.97,
          ai_completeness_score: 0.92,
          ai_model_cost_usd: 0.16,
          doc_intel_cost_usd: 0.1,
          created_at: new Date('2024-01-02'),
          processing_completed_at: new Date('2024-01-02'),
          exported_at: null,
        },
      ];

      const { withDatabase } = await import('../../../src/utils/database.js');
      vi.mocked(withDatabase).mockImplementation(async (callback) => {
        return callback({
          request: () => ({
            input: vi.fn().mockReturnThis(),
            query: vi.fn().mockResolvedValue({
              recordset: mockVersions,
            }),
          }),
        } as unknown as sql.ConnectionPool);
      });

      const documentId = 'original-uuid';
      const result = await versionService.getHistory(documentId);

      expect(result.versions).toHaveLength(2);
      expect(result.versions[0].reprocessingCount).toBe(0);
      expect(result.versions[1].parentDocumentId).toBe('original-uuid');
      expect(result.rootDocumentId).toBe('original-uuid');
    });

    it('should handle non-existent document', async () => {
      const { withDatabase } = await import('../../../src/utils/database.js');
      vi.mocked(withDatabase).mockImplementation(async (callback) => {
        return callback({
          request: () => ({
            input: vi.fn().mockReturnThis(),
            query: vi.fn().mockResolvedValue({
              recordset: [],
            }),
          }),
        } as unknown as sql.ConnectionPool);
      });

      const documentId = 'nonexistent-uuid';
      await expect(versionService.getHistory(documentId)).rejects.toThrow('Document not found');
    });

    it('should return versions in chronological order', async () => {
      const mockVersions = [
        {
          result_id: 'original',
          document_name: 'catalog.pdf',
          vendor_name: 'TEST',
          processing_status: 'completed',
          export_status: 'not_exported',
          reprocessing_count: 0,
          parent_document_id: null,
          product_count: 10,
          ai_confidence_score: 0.95,
          ai_completeness_score: 0.9,
          ai_model_cost_usd: 0.15,
          doc_intel_cost_usd: 0.1,
          created_at: new Date('2024-01-01'),
          processing_completed_at: new Date('2024-01-01'),
          exported_at: null,
        },
        {
          result_id: 'version-1',
          document_name: 'catalog.pdf',
          vendor_name: 'TEST',
          processing_status: 'completed',
          export_status: 'not_exported',
          reprocessing_count: 1,
          parent_document_id: 'original',
          product_count: 11,
          ai_confidence_score: 0.96,
          ai_completeness_score: 0.91,
          ai_model_cost_usd: 0.16,
          doc_intel_cost_usd: 0.1,
          created_at: new Date('2024-01-02'),
          processing_completed_at: new Date('2024-01-02'),
          exported_at: null,
        },
        {
          result_id: 'version-2',
          document_name: 'catalog.pdf',
          vendor_name: 'TEST',
          processing_status: 'completed',
          export_status: 'not_exported',
          reprocessing_count: 2,
          parent_document_id: 'original',
          product_count: 12,
          ai_confidence_score: 0.97,
          ai_completeness_score: 0.92,
          ai_model_cost_usd: 0.17,
          doc_intel_cost_usd: 0.1,
          created_at: new Date('2024-01-03'),
          processing_completed_at: new Date('2024-01-03'),
          exported_at: null,
        },
      ];

      const { withDatabase } = await import('../../../src/utils/database.js');
      vi.mocked(withDatabase).mockImplementation(async (callback) => {
        return callback({
          request: () => ({
            input: vi.fn().mockReturnThis(),
            query: vi.fn().mockResolvedValue({
              recordset: mockVersions,
            }),
          }),
        } as unknown as sql.ConnectionPool);
      });

      const result = await versionService.getHistory('original');

      // Should be ordered by reprocessing_count ASC (original first)
      expect(result.versions[0].reprocessingCount).toBe(0);
      expect(result.versions[2].reprocessingCount).toBe(2);
    });
  });

  describe('deleteRun', () => {
    it('should delete specific version run', async () => {
      const { withDatabase } = await import('../../../src/utils/database.js');
      vi.mocked(withDatabase).mockImplementation(async (callback) => {
        return callback({
          request: () => ({
            input: vi.fn().mockReturnThis(),
            query: vi.fn().mockResolvedValue({
              recordset: [
                {
                  result_id: 'version-1-uuid',
                  reprocessing_count: 1,
                  parent_document_id: 'original-uuid', // This is a reprocessed version, not root
                },
              ],
              rowsAffected: [1],
            }),
          }),
        } as unknown as sql.ConnectionPool);
      });

      const versionId = 'version-1-uuid';
      const result = await versionService.deleteRun(versionId);

      expect(result.documentId).toBe('version-1-uuid');
      expect(result.version).toBe(1);
    });

    it('should handle deletion of non-existent version', async () => {
      const { withDatabase } = await import('../../../src/utils/database.js');
      vi.mocked(withDatabase).mockImplementation(async (callback) => {
        return callback({
          request: () => ({
            input: vi.fn().mockReturnThis(),
            query: vi.fn().mockResolvedValue({
              recordset: [],
            }),
          }),
        } as unknown as sql.ConnectionPool);
      });

      const versionId = 'nonexistent-uuid';
      await expect(versionService.deleteRun(versionId)).rejects.toThrow('Document not found');
    });
  });

  describe('singleton pattern', () => {
    it('should return same instance on multiple calls', () => {
      const instance1 = getVersionService();
      const instance2 = getVersionService();

      expect(instance1).toBe(instance2);
    });
  });
});
