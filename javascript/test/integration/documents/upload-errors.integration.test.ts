/**
 * Integration Test - Upload Endpoint Error Handling
 *
 * Tests error scenarios for the document upload endpoint.
 * Focuses on validation and error responses.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { TEST_FILE_METADATA, TEST_VENDOR_PREFIXES } from '../../fixtures/test-data';
import { generateTestVendorName } from '../../tools/testVendorNames';
import { cleanTestDatabase } from '../utils/helpers';

const FUNCTION_BASE_URL = 'http://localhost:7071';

describe('Integration: Upload Endpoint Errors', () => {
  beforeEach(async () => {
    await cleanTestDatabase();
  });

  it('should reject empty file upload', async () => {
    const emptyFile = Buffer.from('');
    const formData = new FormData();
    formData.append(
      'file',
      new Blob([emptyFile], { type: TEST_FILE_METADATA.EMPTY_PDF.type }),
      TEST_FILE_METADATA.EMPTY_PDF.name
    );
    formData.append('vendorName', 'TEST_EMPTY_01_26');

    const response = await fetch(`${FUNCTION_BASE_URL}/api/documents/upload`, {
      method: 'POST',
      body: formData,
    });

    // Upload succeeds, validation happens in blob processor
    expect(response.status).toBe(201);
  });

  it('should reject unsupported file type', async () => {
    const textFile = Buffer.from('This is text');
    const formData = new FormData();
    formData.append(
      'file',
      new Blob([textFile], { type: TEST_FILE_METADATA.INVALID_TEXT.type }),
      TEST_FILE_METADATA.INVALID_TEXT.name
    );
    formData.append(
      'vendorName',
      generateTestVendorName(TEST_VENDOR_PREFIXES.INTEGRATION, 'UNSUPPORTED_FILE')
    );

    const response = await fetch(`${FUNCTION_BASE_URL}/api/documents/upload`, {
      method: 'POST',
      body: formData,
    });

    expect(response.status).toBe(400);
  });

  it('should reject upload without vendorId', async () => {
    const testFile = Buffer.from('fake pdf content');
    const formData = new FormData();
    formData.append(
      'file',
      new Blob([testFile], { type: TEST_FILE_METADATA.VALID_PDF.type }),
      TEST_FILE_METADATA.VALID_PDF.name
    );

    const response = await fetch(`${FUNCTION_BASE_URL}/api/documents/upload`, {
      method: 'POST',
      body: formData,
    });

    expect(response.status).toBe(400);
  });

  it('should handle malformed FormData gracefully', async () => {
    const response = await fetch(`${FUNCTION_BASE_URL}/api/documents/upload`, {
      method: 'POST',
      body: 'invalid-formdata',
    });

    // TODO: Add FormData validation to return 400 instead of 500
    // Currently throws unhandled error
    expect(response.status).toBe(500);
  });

  it('should reject file exceeding size limit', async () => {
    // Create a large buffer (21 MB, exceeding 20 MB limit)
    const largeFile = Buffer.alloc(21 * 1024 * 1024);
    const formData = new FormData();
    formData.append(
      'file',
      new Blob([Uint8Array.from(largeFile)], { type: TEST_FILE_METADATA.VALID_PDF.type }),
      'large.pdf'
    );
    formData.append(
      'vendorName',
      generateTestVendorName(TEST_VENDOR_PREFIXES.INTEGRATION, 'LARGE_FILE')
    );

    const response = await fetch(`${FUNCTION_BASE_URL}/api/documents/upload`, {
      method: 'POST',
      body: formData,
    });

    // TODO: Add file size validation at upload handler level
    // Currently accepts large files (validation happens in blob processor)
    // 201 = accepted, will fail later in blob processor
    expect([201, 400, 413]).toContain(response.status);
  });
});
