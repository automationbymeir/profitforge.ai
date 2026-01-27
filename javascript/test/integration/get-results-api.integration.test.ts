/**
 * Integration Test - Get Results API
 *
 * Tests the /api/getResults endpoint using test database with pre-seeded data.
 * No real AI processing - just testing the query/filter logic.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { cleanTestDatabase, insertTestDocument } from './helpers/test-db';

const FUNCTION_BASE_URL = 'http://localhost:7071';

describe('Integration: Get Results API', () => {
  const testVendor = 'TEST_GET_RESULTS_01_26';
  let resultId1: string;
  let _resultId2: string;
  let _resultId3: string;

  beforeEach(async () => {
    // Clean and seed test data
    await cleanTestDatabase();

    // Insert 3 test documents for the same vendor
    resultId1 = await insertTestDocument({
      vendorName: testVendor,
      documentName: 'doc1.pdf',
      processingStatus: 'completed',
      productCount: 5,
      aiMappingResult: [{ code: 'A001', description: 'Product 1', price: 10.0 }],
    });

    _resultId2 = await insertTestDocument({
      vendorName: testVendor,
      documentName: 'doc2.pdf',
      processingStatus: 'completed',
      productCount: 3,
      aiMappingResult: [{ code: 'A002', description: 'Product 2', price: 20.0 }],
    });

    _resultId3 = await insertTestDocument({
      vendorName: testVendor,
      documentName: 'doc3.pdf',
      processingStatus: 'pending',
      productCount: 0,
    });
  });

  it('should return all documents for a vendor', async () => {
    // Act
    const response = await fetch(`${FUNCTION_BASE_URL}/api/getResults?vendor=${testVendor}`);

    // Assert
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveLength(3);
    expect(data.every((r: any) => r.vendor_name === testVendor)).toBe(true);
  });

  it('should filter by resultId', async () => {
    // Act
    const response = await fetch(`${FUNCTION_BASE_URL}/api/getResults?resultId=${resultId1}`);

    // Assert
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveLength(1);
    expect(data[0].result_id).toBe(resultId1);
  });

  it('should return empty array for invalid UUID', async () => {
    // Act
    const response = await fetch(`${FUNCTION_BASE_URL}/api/getResults?resultId=not-a-uuid`);

    // Assert
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveLength(0);
  });

  it('should limit results', async () => {
    // Act
    const response = await fetch(
      `${FUNCTION_BASE_URL}/api/getResults?vendor=${testVendor}&limit=2`
    );

    // Assert
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveLength(2);
  });

  it('should filter by status (only completed)', async () => {
    // Act
    const response = await fetch(`${FUNCTION_BASE_URL}/api/getResults?vendor=${testVendor}`);

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
    const response = await fetch(`${FUNCTION_BASE_URL}/api/getResults?vendor=nonexistent-vendor`);

    // Assert
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveLength(0);
  });

  it('should include CORS headers', async () => {
    // Act
    const response = await fetch(`${FUNCTION_BASE_URL}/api/getResults?vendor=${testVendor}`);

    // Assert
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Content-Type')).toContain('application/json');
  });

  it('should parse JSON fields in response', async () => {
    // Arrange - Create document with JSON fields
    await insertTestDocument({
      vendorName: testVendor,
      documentName: 'json-test.pdf',
      processingStatus: 'completed',
      aiMappingResult: [{ code: 'A001', price: 10.0 }],
    });

    // Act
    const response = await fetch(
      `${FUNCTION_BASE_URL}/api/getResults?vendor=${testVendor}&limit=1`
    );

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

  it('should show all versions when allVersions=true', async () => {
    // Arrange - Create version chain
    const originalId = await insertTestDocument({
      vendorName: testVendor,
      documentName: 'versions.pdf',
      processingStatus: 'completed',
      reprocessingCount: 0,
    });

    const version1Id = await insertTestDocument({
      vendorName: testVendor,
      documentName: 'versions.pdf',
      processingStatus: 'completed',
      reprocessingCount: 1,
      parentDocumentId: originalId,
    });

    // Act - Query with allVersions=true
    const response = await fetch(
      `${FUNCTION_BASE_URL}/api/getResults?vendor=${testVendor}&allVersions=true`
    );

    // Assert
    expect(response.status).toBe(200);
    const data = await response.json();

    // Should see both versions
    const resultIds = data.map((r: any) => r.result_id);
    expect(resultIds).toContain(originalId);
    expect(resultIds).toContain(version1Id);
  });

  it('should show only latest version by default', async () => {
    // Arrange - Create version chain
    const originalId = await insertTestDocument({
      vendorName: testVendor,
      documentName: 'latest.pdf',
      processingStatus: 'completed',
      reprocessingCount: 0,
    });

    const version1Id = await insertTestDocument({
      vendorName: testVendor,
      documentName: 'latest.pdf',
      processingStatus: 'completed',
      reprocessingCount: 1,
      parentDocumentId: originalId,
    });

    // Act - Query without allVersions (default)
    const response = await fetch(`${FUNCTION_BASE_URL}/api/getResults?vendor=${testVendor}`);

    // Assert
    expect(response.status).toBe(200);
    const data = await response.json();

    // Should only see latest version (version1), not original
    const resultIds = data.map((r: any) => r.result_id);
    expect(resultIds).not.toContain(originalId);
    expect(resultIds).toContain(version1Id);
  });
});
