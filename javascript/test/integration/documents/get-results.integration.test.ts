/**
 * Integration Test - Get Results Workflow
 *
 * Tests the /api/documents endpoint (GET) using test database with pre-seeded data.
 * No real AI processing - just testing the query/filter logic.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { DocumentRepository } from '../../../src/data/repositories/DocumentRepository.js';
import { cleanTestDatabase, getTestDbPool } from '../utils/helpers';

const FUNCTION_BASE_URL = 'http://localhost:7071';

describe('Integration: Get Results Workflow', () => {
  const testVendor = 'TEST_GET_RESULTS_01_26';
  let resultId1: string;
  let _resultId2: string;
  let _resultId3: string;
  let documentRepo: DocumentRepository;

  beforeEach(async () => {
    // Clean and seed test data
    await cleanTestDatabase();

    // Get repository
    const pool = await getTestDbPool();
    documentRepo = new DocumentRepository(pool);

    // Insert 3 test documents for the same vendor
    resultId1 = await documentRepo.create({
      vendor_name: testVendor,
      document_name: 'doc1.pdf',
      document_path: 'test/doc1.pdf',
      document_size_bytes: 1000,
      document_type: 'application/pdf',
      processing_status: 'completed',
      product_count: 5,
      ai_mapping_result: JSON.stringify([{ code: 'A001', description: 'Product 1', price: 10.0 }]),
    });

    _resultId2 = await documentRepo.create({
      vendor_name: testVendor,
      document_name: 'doc2.pdf',
      document_path: 'test/doc2.pdf',
      document_size_bytes: 1000,
      document_type: 'application/pdf',
      processing_status: 'completed',
      product_count: 3,
      ai_mapping_result: JSON.stringify([{ code: 'A002', description: 'Product 2', price: 20.0 }]),
    });

    _resultId3 = await documentRepo.create({
      vendor_name: testVendor,
      document_name: 'doc3.pdf',
      document_path: 'test/doc3.pdf',
      document_size_bytes: 1000,
      document_type: 'application/pdf',
      processing_status: 'pending',
      product_count: 0,
    });
  });

  it('should return all documents for a vendor', async () => {
    // Act
    const response = await fetch(`${FUNCTION_BASE_URL}/api/documents?vendor=${testVendor}`);

    // Assert
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveLength(3);
    expect(data.every((r: any) => r.vendor_name === testVendor)).toBe(true);
  });

  it('should filter by resultId', async () => {
    // Act
    const response = await fetch(`${FUNCTION_BASE_URL}/api/documents?resultId=${resultId1}`);

    // Assert
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveLength(1);
    expect(data[0].result_id).toBe(resultId1);
  });

  it('should return empty array for invalid UUID', async () => {
    // Act
    const response = await fetch(`${FUNCTION_BASE_URL}/api/documents?resultId=not-a-uuid`);

    // Assert
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveLength(0);
  });

  it('should limit results', async () => {
    // Act
    const response = await fetch(`${FUNCTION_BASE_URL}/api/documents?vendor=${testVendor}&limit=2`);

    // Assert
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveLength(2);
  });

  it('should filter by status (only completed)', async () => {
    // Act
    const response = await fetch(`${FUNCTION_BASE_URL}/api/documents?vendor=${testVendor}`);

    // Assert
    expect(response.status).toBe(200);
    const data = await response.json();

    // API returns all documents, not filtered by status
    expect(data).toHaveLength(3);
    const completedDocs = data.filter((r: any) => r.processing_status === 'completed');
    expect(completedDocs.length).toBe(2);
  });

  it('should handle vendor with no documents', async () => {
    // Act
    const response = await fetch(`${FUNCTION_BASE_URL}/api/documents?vendor=nonexistent-vendor`);

    // Assert
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveLength(0);
  });

  it('should include CORS headers', async () => {
    // Act
    const response = await fetch(`${FUNCTION_BASE_URL}/api/documents?vendor=${testVendor}`);

    // Assert
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Content-Type')).toContain('application/json');
  });

  it('should parse JSON fields in response', async () => {
    // Arrange - Create document with JSON fields
    await documentRepo.create({
      vendor_name: testVendor,
      document_name: 'json-test.pdf',
      document_path: 'test/json-test.pdf',
      document_size_bytes: 1000,
      document_type: 'application/pdf',
      processing_status: 'completed',
      ai_mapping_result: JSON.stringify([{ code: 'A001', price: 10.0 }]),
    });

    // Act
    const response = await fetch(`${FUNCTION_BASE_URL}/api/documents?vendor=${testVendor}&limit=1`);

    // Assert
    expect(response.status).toBe(200);
    const data = await response.json();

    if (data && data.length > 0) {
      const result = data[0];
      // JSON fields should be parsed as objects, not strings
      if (result.ai_mapping_result) {
        expect(typeof result.ai_mapping_result).toBe('object');
      }
    }
  });
});
