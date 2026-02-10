/**
 * E2E Test - Model Accuracy Comparison
 *
 * Compares raw OCR output against benchmark Excel data:
 * 1. Upload PDF → Extract raw OCR tables from ocr.json blob
 * 2. Upload Excel benchmark → Stored as benchmark.json blob
 * 3. Grade OCR accuracy: Compare OCR tables vs benchmark data
 *
 * This reveals OCR extraction accuracy at the table/column level.
 */

import { writeFileSync } from 'fs';
import { beforeAll, describe, expect, it } from 'vitest';

// Import service instances
import {
  // clean,
  pollDocumentStatus,
  pollUploadCompletion,
  storageService,
  waitForDocumentCreation,
} from './common/utils.js';

// Import API helpers
import { uploadBenchmark } from './common/helpers.js';
import { extractOcrTables, gradeOcrAccuracy } from './common/model-accuracy-utils.js';

const VENDOR_NAME = 'E2E_TEST_ACCURACY_07_25'; // Must match VENDOR_NAME_MM_YY format
const VENDOR_FOLDER = 'FRIELING'; // Actual folder name in test/e2e/common/docs
// const PDF_FILE = 'FRIELING_JUL25_PRICE_LIST.pdf';
const EXCEL_FILE = 'FRIELING_JUL25_PRICE_LIST.xlsx';
const DOCS_PATH = './common/docs'; // Relative path to docs folder from test file location

// Shared state
let uploadedRunId: string;
let rawOcrData: any;
let benchmarkData: any;

describe('Model Accuracy - OCR vs Benchmark Comparison', () => {
  beforeAll(async () => {
    // await clean(VENDOR_NAME);

    // console.log('\n=== Setup: Uploading PDF and Benchmark ===\n');

    // // 1. Upload PDF document
    // console.log(`Uploading PDF: ${PDF_FILE}...`);
    // const uploadResult = await uploadDocument(
    //   VENDOR_NAME,
    //   `${DOCS_PATH}/${VENDOR_FOLDER}/${PDF_FILE}`
    // );
    // console.log(`✓ Document uploaded. Status: ${uploadResult.status}`);

    // // 2. Wait for document creation (blob trigger is async)
    console.log('Waiting for document record creation...');
    uploadedRunId = await waitForDocumentCreation(VENDOR_NAME);
    console.log(`✓ Document record created. Run ID: ${uploadedRunId}`);

    // 3. Wait for OCR and AI processing to complete
    console.log('Waiting for OCR and AI processing...');
    await pollDocumentStatus(uploadedRunId, 'completed');
    console.log('✓ Processing complete');

    // 4. Download raw OCR data from blob
    console.log('Downloading OCR data from blob storage...');
    rawOcrData = await storageService.downloadJsonBlob(
      'uploads',
      `${VENDOR_NAME}/ocr-azure-doc-intelligence.json`
    );
    console.log(`✓ OCR data downloaded (${JSON.stringify(rawOcrData).length} bytes)`);

    // Write OCR data to file for inspection
    writeFileSync('test/outputs/raw-ocr-data.json', JSON.stringify(rawOcrData, null, 2));
    console.log('✓ OCR data written to test/outputs/raw-ocr-data.json');

    // 5. Upload benchmark Excel file
    console.log(`Uploading benchmark: ${EXCEL_FILE}...`);
    await uploadBenchmark(VENDOR_NAME, `${DOCS_PATH}/${VENDOR_FOLDER}/${EXCEL_FILE}`);
    console.log('✓ Benchmark uploaded');

    // 6. wait for upload to complete and benchmark blob to be available
    console.log(`Uploading benchmark: ${EXCEL_FILE}...`);
    await pollUploadCompletion(`${VENDOR_NAME}/benchmark.json`);
    console.log('✓ Benchmark uploaded');

    // 7. Download benchmark data from blob
    console.log('Downloading benchmark data from blob storage...');
    benchmarkData = await storageService.downloadJsonBlob(
      'uploads',
      `${VENDOR_NAME}/benchmark.json`
    );
    console.log(`✓ Benchmark data downloaded (${benchmarkData.products.length} products)`);

    // Write benchmark data to file for inspection
    writeFileSync('test/outputs/benchmark-data.json', JSON.stringify(benchmarkData, null, 2));
    console.log('✓ Benchmark data written to test/outputs/benchmark-data.json');
  }, 300000);

  it('should extract tables from raw OCR data', () => {
    const tables = extractOcrTables(rawOcrData);

    console.log(`\n=== OCR Tables Extracted ===`);
    console.log(`Number of tables: ${tables.length}`);
    tables.forEach((table, index) => {
      console.log(`Table ${index + 1}: ${table.length} rows`);
      if (table.length > 0) {
        console.log(`  Columns: ${Object.keys(table[0]).join(', ')}`);
      }
    });

    expect(tables.length).toBeGreaterThan(0);
    expect(tables[0].length).toBeGreaterThan(0);
  });

  it('should have benchmark data with correct structure', () => {
    expect(benchmarkData).toBeDefined();
    expect(benchmarkData.products).toBeDefined();
    expect(benchmarkData.products.length).toBeGreaterThan(0);

    const firstProduct = benchmarkData.products[0];
    console.log(`\n=== Benchmark Structure ===`);
    console.log(`Total products: ${benchmarkData.products.length}`);
    console.log(`Columns: ${Object.keys(firstProduct).join(', ')}`);
    console.log(`Sample product:`, firstProduct);

    expect(firstProduct).toBeDefined();
  });

  it('should grade OCR accuracy against benchmark', () => {
    const ocrTables = extractOcrTables(rawOcrData);
    const benchmarkProducts = benchmarkData.products;

    const gradeResult = gradeOcrAccuracy(ocrTables, benchmarkProducts);

    console.log(`\n=== OCR Accuracy Grading Results ===`);
    console.log(`Overall Accuracy: ${gradeResult.overallAccuracy.toFixed(2)}%`);
    console.log(`Total Cells: ${gradeResult.totalCells}`);
    console.log(
      `Matched Cells: ${gradeResult.matchedCells} (${((gradeResult.matchedCells / gradeResult.totalCells) * 100).toFixed(2)}%)`
    );
    console.log(`  - Exact Matches: ${gradeResult.exactMatches}`);
    console.log(`  - Fuzzy Matches: ${gradeResult.fuzzyMatches}`);
    console.log(`Mismatches: ${gradeResult.mismatches}`);
    console.log(`\nRow Matching:`);
    console.log(`  - Total Benchmark Rows: ${gradeResult.totalRows}`);
    console.log(`  - Matched Rows: ${gradeResult.matchedRows}`);
    console.log(`  - Missing Rows: ${gradeResult.missingRows.length}`);

    if (gradeResult.missingRows.length > 0) {
      console.log(
        `  - Missing Row IDs: ${gradeResult.missingRows.slice(0, 10).join(', ')}${gradeResult.missingRows.length > 10 ? '...' : ''}`
      );
    }

    console.log(`\nColumn Accuracy:`);
    Object.entries(gradeResult.columnAccuracy).forEach(([col, accuracy]) => {
      const stats = gradeResult.columnStats[col];
      console.log(
        `  ${col}: ${(accuracy as number).toFixed(2)}% (${stats.exact} exact, ${stats.fuzzy} fuzzy, ${stats.missed} missed)`
      );
    });

    if (gradeResult.sampleMismatches.length > 0) {
      console.log(`\nSample Mismatches (first 10):`);
      gradeResult.sampleMismatches.forEach((mismatch: any, index: number) => {
        console.log(`  ${index + 1}. Row ${mismatch.rowKey} - ${mismatch.column}:`);
        console.log(`     Expected: "${mismatch.expected}"`);
        console.log(`     Actual:   "${mismatch.actual}"`);
      });
    }

    // Assertions
    expect(gradeResult.overallAccuracy).toBeGreaterThan(0);
    expect(gradeResult.totalCells).toBeGreaterThan(0);
    expect(gradeResult.matchedCells).toBeGreaterThan(0);

    // Store results for future reference
    console.log('\n=== Test Complete ===\n');
  });
});
