#!/usr/bin/env tsx
/**
 * OCR Service Testing Script
 *
 * Tests OCR processing in isolation with real PDF files
 *
 * Usage:
 *   npx tsx test/tools/test-ocr-service.ts <pdf-file-path>
 *   npx tsx test/tools/test-ocr-service.ts test/fixtures/sample-catalog.pdf
 *
 * Output:
 *   - Saves OCR results to: test/outputs/ocr-azure-doc-intelligence-<filename>.json
 *   - Displays OCR structure analysis
 *   - Shows table/cell statistics
 */

import { AzureKeyCredential, DocumentAnalysisClient } from '@azure/ai-form-recognizer';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface OcrStats {
  pageCount: number;
  tableCount: number;
  totalCells: number;
  headerCells: number;
  contentCells: number;
  tablesPerPage: Record<number, number>;
  cellsPerTable: number[];
}

/**
 * Analyze OCR response structure
 */
function analyzeOcrStructure(ocrResponse: {
  pages?: unknown[];
  tables?: Array<{
    cells?: Array<{ kind?: string }>;
    boundingRegions?: Array<{ pageNumber?: number }>;
  }>;
}): OcrStats {
  const stats: OcrStats = {
    pageCount: ocrResponse.pages?.length || 0,
    tableCount: ocrResponse.tables?.length || 0,
    totalCells: 0,
    headerCells: 0,
    contentCells: 0,
    tablesPerPage: {},
    cellsPerTable: [],
  };

  // Analyze tables
  if (ocrResponse.tables) {
    ocrResponse.tables.forEach((table) => {
      const cellCount = table.cells?.length || 0;
      stats.totalCells += cellCount;
      stats.cellsPerTable.push(cellCount);

      // Count cell types
      if (table.cells) {
        table.cells.forEach((cell) => {
          if (cell.kind === 'columnHeader') stats.headerCells++;
          if (cell.kind === 'content') stats.contentCells++;
        });
      }

      // Track tables per page
      const pageNum = table.boundingRegions?.[0]?.pageNumber || 0;
      stats.tablesPerPage[pageNum] = (stats.tablesPerPage[pageNum] || 0) + 1;
    });
  }

  return stats;
}

/**
 * Display OCR structure summary
 */
function displayOcrSummary(stats: OcrStats, filename: string) {
  console.log('\n' + '='.repeat(60));
  console.log(`📄 OCR Analysis: ${filename}`);
  console.log('='.repeat(60));
  console.log(`\n📊 Document Structure:`);
  console.log(`   Pages:  ${stats.pageCount}`);
  console.log(`   Tables: ${stats.tableCount}`);
  console.log(
    `   Cells:  ${stats.totalCells} (${stats.headerCells} headers, ${stats.contentCells} content)`
  );

  if (stats.tableCount > 0) {
    console.log(`\n📋 Table Distribution:`);
    const pageNums = Object.keys(stats.tablesPerPage).sort((a, b) => parseInt(a) - parseInt(b));
    pageNums.forEach((page) => {
      console.log(`   Page ${page}: ${stats.tablesPerPage[parseInt(page)]} table(s)`);
    });

    console.log(`\n📏 Table Sizes:`);
    const avgCells = stats.cellsPerTable.reduce((a, b) => a + b, 0) / stats.cellsPerTable.length;
    const minCells = Math.min(...stats.cellsPerTable);
    const maxCells = Math.max(...stats.cellsPerTable);
    console.log(`   Avg cells per table: ${avgCells.toFixed(1)}`);
    console.log(`   Min/Max: ${minCells}/${maxCells} cells`);
  }

  console.log('\n' + '='.repeat(60));
}

/**
 * Run OCR on a PDF file
 */
async function runOcrTest(pdfPath: string) {
  // Validate inputs
  if (!existsSync(pdfPath)) {
    console.error(`❌ Error: PDF file not found: ${pdfPath}`);
    process.exit(1);
  }

  // Get credentials
  const endpoint = process.env.DOCUMENT_INTELLIGENCE_ENDPOINT;
  const apiKey = process.env.DOCUMENT_INTELLIGENCE_KEY;

  if (!endpoint || !apiKey) {
    console.error('❌ Error: Missing environment variables');
    console.error('   Required: DOCUMENT_INTELLIGENCE_ENDPOINT, DOCUMENT_INTELLIGENCE_KEY');
    process.exit(1);
  }

  console.log(`\n🔍 Processing PDF: ${pdfPath}`);
  console.log(`📡 Endpoint: ${endpoint}`);

  // Read PDF
  const pdfBuffer = readFileSync(pdfPath);
  console.log(`📦 PDF size: ${(pdfBuffer.length / 1024).toFixed(2)} KB`);

  // Initialize client
  const client = new DocumentAnalysisClient(endpoint, new AzureKeyCredential(apiKey));

  // Run OCR
  console.log(`\n⏳ Running Document Intelligence OCR...`);
  const startTime = Date.now();
  const poller = await client.beginAnalyzeDocument('prebuilt-layout', pdfBuffer);
  const ocrResponse = await poller.pollUntilDone();
  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);

  console.log(`✅ OCR complete in ${duration}s`);

  // Calculate costs
  const pageCount = ocrResponse?.pages?.length || 0;
  const cost = (pageCount / 1000) * 1.5; // $1.50 per 1,000 pages
  console.log(`💰 Estimated cost: $${cost.toFixed(4)}`);

  // Analyze structure
  const stats = analyzeOcrStructure(ocrResponse);
  displayOcrSummary(stats, basename(pdfPath));

  // Prepare output
  const outputDir = join(__dirname, '../outputs');
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const pdfBasename = basename(pdfPath, '.pdf');
  const outputFilename = `ocr-azure-doc-intelligence-${pdfBasename}.json`;
  const outputPath = join(outputDir, outputFilename);

  // Save result (same format as blob storage)
  const outputData = {
    metadata: {
      sourceFile: pdfPath,
      processedAt: new Date().toISOString(),
      processingTime: endTime - startTime,
      ocrStartTime: startTime,
      ocrEndTime: endTime,
      processingCost: cost,
      confidenceScore: undefined, // Could extract from pages if needed
    },
    ocrResponse,
  };

  writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
  console.log(`\n💾 Saved OCR results to: ${outputPath}`);

  // Show sample table structure if tables exist
  if (stats.tableCount > 0 && ocrResponse.tables) {
    console.log(`\n📋 Sample Table Structure (Table 0):`);
    const firstTable = ocrResponse.tables[0];
    console.log(`   Row count: ${firstTable.rowCount}`);
    console.log(`   Column count: ${firstTable.columnCount}`);
    console.log(`   Bounding regions:`, firstTable.boundingRegions);

    if (firstTable.cells && firstTable.cells.length > 0) {
      console.log(`\n   Sample cells (first 5):`);
      firstTable.cells
        .slice(0, 5)
        .forEach(
          (cell: { rowIndex?: number; columnIndex?: number; kind?: string; content?: string }) => {
            console.log(
              `     [${cell.rowIndex},${cell.columnIndex}] ${cell.kind}: "${cell.content}"`
            );
          }
        );
    }
  }

  console.log(`\n✅ Test complete! Use this file with test-ai-service.ts\n`);
}

// Main execution
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log(`
Usage: npx tsx test/tools/test-ocr-service.ts <pdf-file-path>

Example:
  npx tsx test/tools/test-ocr-service.ts test/fixtures/sample-catalog.pdf

This script:
  1. Runs Azure Document Intelligence OCR on the PDF
  2. Saves results to test/outputs/ocr-azure-doc-intelligence-<filename>.json
  3. Displays structure analysis and statistics
  4. Output can be used with test-ai-service.ts for AI testing
  `);
  process.exit(1);
}

const pdfPath = args[0];
runOcrTest(pdfPath).catch((error) => {
  console.error(`\n❌ Error: ${error.message}`);
  if (error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
