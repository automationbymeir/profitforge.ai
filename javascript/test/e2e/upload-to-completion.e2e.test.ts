/**
 * E2E Processing Test - Upload to Completion
 *
 * Critical happy path: Upload PDF → OCR → AI Mapping → Database storage
 * Uses REAL Azure AI services (expensive, slow).
 * Tests the entire pipeline end-to-end.
 *
 * Prerequisites:
 * 1. Azure Functions running locally (npm start)
 * 2. Valid connection strings in local.settings.json
 * 3. Sample documents in test/e2e/docs/ directory
 * 4. Clean queue state: npm run queue:purge (optional, clears old poison messages)
 */

import { readFileSync } from 'fs';
import sql from 'mssql';
import { join } from 'path';
import { beforeAll, describe, expect, it } from 'vitest';
import { generateTestVendorName } from '../helpers/testVendorNames';

const FUNCTION_BASE_URL = process.env.FUNCTION_APP_URL || 'http://localhost:7071';
const UPLOAD_ENDPOINT = `${FUNCTION_BASE_URL}/api/upload`;

// Read connection string from environment (E2E tests use production resources)
const DB_CONNECTION_STRING = process.env.SQL_CONNECTION_STRING || '';

if (!DB_CONNECTION_STRING) {
  throw new Error('SQL_CONNECTION_STRING environment variable is required for E2E tests');
}

/**
 * Wait for document to reach a specific status
 */
async function waitForDocumentStatus(
  resultId: string,
  expectedStatus: string,
  maxWaitMs: number = 180000
): Promise<any> {
  const startTime = Date.now();
  const pool = new sql.ConnectionPool(DB_CONNECTION_STRING);
  await pool.connect();

  while (Date.now() - startTime < maxWaitMs) {
    const result = await pool
      .request()
      .input('resultId', sql.NVarChar, resultId)
      .query('SELECT * FROM vvocr.document_processing_results WHERE result_id = @resultId');

    const record = result.recordset[0];

    if (record && record.status === expectedStatus) {
      await pool.close();
      return record;
    }

    // Only exit on failed if it's been in failed state for >10 seconds
    // (to avoid exiting on transient errors during retry logic)
    if (record && record.status === 'failed' && expectedStatus !== 'failed') {
      const timeSinceUpdate = new Date().getTime() - new Date(record.updated_at).getTime();
      if (timeSinceUpdate > 10000) {
        await pool.close();
        return record;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  await pool.close();
  throw new Error(`Timeout waiting for ${expectedStatus} (waited ${maxWaitMs}ms)`);
}

describe('E2E Processing: Upload to Completion', () => {
  beforeAll(() => {
    if (!DB_CONNECTION_STRING) {
      throw new Error('E2E tests require real database connection string in local.settings.json');
    }
  });

  it('should process PDF from upload through AI mapping', async () => {
    // Arrange
    const testFile = readFileSync(join(__dirname, './docs/samplePDF.pdf'));
    const vendorName = generateTestVendorName('E2E', 'UPLOAD_TO_COMPLETION');
    const formData = new FormData();
    formData.append('file', new Blob([testFile], { type: 'application/pdf' }), 'test-upload.pdf');
    formData.append('vendorName', vendorName);

    console.log('\n📤 Uploading document...');
    console.log(`   Vendor name: ${vendorName}`);
    const startTime = Date.now();

    // Act - Upload
    const uploadResponse = await fetch(`${FUNCTION_BASE_URL}/api/upload`, {
      method: 'POST',
      body: formData,
    });

    if (uploadResponse.status !== 201) {
      const errorBody = await uploadResponse.text();
      console.error(`Upload failed (${uploadResponse.status}):`, errorBody);
    }

    expect(uploadResponse.status).toBe(201);
    const uploadData = await uploadResponse.json();
    const resultId = uploadData.resultId;

    console.log(`✓ Upload successful (resultId: ${resultId})`);
    console.log(`  Vendor: ${uploadData.vendorId || vendorName}`);
    console.log(`  File: ${uploadData.filePath || 'uploaded'}`);

    // Wait for OCR completion
    console.log('⏳ Waiting for OCR processing...');
    const ocrComplete = await waitForDocumentStatus(resultId, 'ocr_complete', 120000);
    expect(ocrComplete.ocr_text).toBeDefined();
    expect(ocrComplete.ocr_text.length).toBeGreaterThan(0);
    const pageCount = ocrComplete.ocr_page_count || ocrComplete.doc_intel_page_count || 0;
    console.log(
      `✓ OCR complete (${ocrComplete.ocr_text.length} characters extracted, ${pageCount} pages)`
    );

    // Wait for AI mapping completion
    console.log('⏳ Waiting for AI mapping...');
    const completed = await waitForDocumentStatus(resultId, 'completed', 120000);

    // Assert - Verify all stages completed
    expect(completed.status).toBe('completed');
    expect(completed.ocr_text).toBeDefined();
    expect(completed.extracted_products).toBeDefined();
    expect(completed.product_count).toBeGreaterThan(0);

    // Bronze layer paths (may vary by implementation)
    expect(
      completed.bronze_raw_path || completed.bronze_ocr_path || completed.bronze_ai_mapping_path
    ).toBeDefined();

    const totalTime = Date.now() - startTime;
    console.log(`✓ AI mapping complete (${completed.product_count} products found)`);
    console.log(`⏱️  Total processing time: ${(totalTime / 1000).toFixed(1)}s`);

    // Verify extracted products structure
    const products = JSON.parse(completed.extracted_products);
    expect(Array.isArray(products)).toBe(true);
    expect(products.length).toBe(completed.product_count);

    // Verify each product has required fields
    products.forEach((product: any) => {
      expect(product.code || product.sku).toBeDefined();
      expect(product.description || product.name).toBeDefined();
      expect(product.price).toBeGreaterThanOrEqual(0);
    });

    // Display detailed metrics
    console.log('\n📊 Processing Metrics:');
    console.log(`  OCR Confidence: ${completed.doc_intel_confidence_score || 'N/A'}`);
    console.log(`  AI Model: ${completed.ai_model_used || 'N/A'}`);
    console.log(`  AI Confidence: ${completed.ai_confidence_score || 'N/A'}`);
    console.log(`  Total Tokens: ${completed.ai_total_tokens || 'N/A'}`);

    if (products.length > 0) {
      console.log('\n📦 Sample Products (first 3):');
      products.slice(0, 3).forEach((product: any, idx: number) => {
        console.log(`  ${idx + 1}. ${product.name || product.description || product.sku}`);
        console.log(`     SKU: ${product.sku || product.code || 'N/A'}`);
        console.log(`     Price: $${product.price || 'N/A'}`);
      });
      if (products.length > 3) {
        console.log(`  ... and ${products.length - 3} more products`);
      }
    }

    console.log('\n✅ E2E pipeline validation passed\n');
  }, 300000); // 5 minute timeout

  it.skip('should reject unsupported file types', async () => {
    const testFile = Buffer.from('This is a plain text file');
    const formData = new FormData();
    formData.append('file', new Blob([testFile], { type: 'text/plain' }), 'test.txt');
    formData.append('vendorName', 'e2e-test-vendor');

    const uploadResponse = await fetch(UPLOAD_ENDPOINT, {
      method: 'POST',
      body: formData,
    });

    expect(uploadResponse.status).toBe(400);
    const errorText = await uploadResponse.text();
    expect(errorText).toContain('Unsupported file type');
  });

  it('should handle multiple concurrent uploads', async () => {
    const testFile = readFileSync(join(__dirname, './docs/samplePDF.pdf'));

    const uploads = Array.from({ length: 3 }, (_, i) => {
      const formData = new FormData();
      formData.append(
        'file',
        new Blob([testFile], { type: 'application/pdf' }),
        `samplePDF-${i}.pdf`
      );
      formData.append('vendorName', generateTestVendorName('E2E', `CONCURRENT_UPLOAD_${i}`));

      return fetch(UPLOAD_ENDPOINT, {
        method: 'POST',
        body: formData,
      });
    });

    const responses = await Promise.all(uploads);
    const results = await Promise.all(responses.map((r) => r.json()));

    expect(results).toHaveLength(3);
    results.forEach((result) => {
      expect(result).toHaveProperty('resultId');
      expect(result.filePath || result.vendorName).toBeDefined();
    });

    console.log('✅ Concurrent uploads successful:', results.length);
  }, 90000);
});
