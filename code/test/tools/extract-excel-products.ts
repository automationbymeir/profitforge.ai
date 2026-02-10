#!/usr/bin/env tsx
/**
 * Extract Products from Excel File
 *
 * Reads an Excel file and extracts:
 * - Automatically detects column headers (first row)
 * - All products with their column values
 * - Handles any column names without validation
 *
 * Usage:
 *   tsx test/tools/extract-excel-products.ts <input.xlsx> <output.json>
 *   tsx test/tools/extract-excel-products.ts test/e2e/common/docs/FRIELING/FRIELING_JUL25_PRICE_LIST.xlsx test/outputs/excel-extracted-products.json
 */

import { readFileSync, writeFileSync } from 'fs';
import * as XLSX from 'xlsx';

interface ExcelProductsOutput {
  metadata: {
    extractedAt: string;
    fileName: string;
    sheetName: string;
    totalProducts: number;
    columns: string[];
  };
  products: Record<string, any>[];
}

/**
 * Extract products from Excel file
 */
function extractExcelProducts(filePath: string): ExcelProductsOutput {
  console.log(`Reading Excel file...`);
  const fileBuffer = readFileSync(filePath);
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

  if (workbook.SheetNames.length === 0) {
    throw new Error('Excel file contains no sheets');
  }

  const sheetName = workbook.SheetNames[0];
  console.log(`Using sheet: ${sheetName}`);

  const worksheet = workbook.Sheets[sheetName];

  // Parse with first row as headers (default behavior)
  const rawProducts = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, {
    defval: '', // Default value for empty cells
    raw: false, // Format values as strings to preserve formatting
  });

  console.log(`Parsed ${rawProducts.length} rows`);

  if (rawProducts.length === 0) {
    throw new Error('Excel file contains no data rows');
  }

  // Get column headers from first row keys
  const columns = Object.keys(rawProducts[0]);
  console.log(`Detected ${columns.length} columns:`);
  columns.forEach((col, idx) => {
    console.log(`  ${idx + 1}. ${col}`);
  });

  // Clean up products - remove completely empty rows
  const products = rawProducts.filter((row) => {
    return Object.values(row).some((val) => String(val).trim() !== '');
  });

  console.log(`Filtered to ${products.length} non-empty rows`);

  // Extract filename from path
  const fileName = filePath.split('/').pop() || filePath;

  return {
    metadata: {
      extractedAt: new Date().toISOString(),
      fileName,
      sheetName,
      totalProducts: products.length,
      columns,
    },
    products,
  };
}

/**
 * Main execution
 */
function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: tsx extract-excel-products.ts <input.xlsx> <output.json>');
    console.error(
      'Example: tsx extract-excel-products.ts test/e2e/common/docs/FRIELING/FRIELING_JUL25_PRICE_LIST.xlsx test/outputs/excel-extracted-products.json'
    );
    process.exit(1);
  }

  const [inputPath, outputPath] = args;

  console.log(`\n📊 Extracting products from Excel file...`);
  console.log(`Input: ${inputPath}\n`);

  try {
    const result = extractExcelProducts(inputPath);

    console.log(`\n✅ Extraction complete:`);
    console.log(`   Sheet: ${result.metadata.sheetName}`);
    console.log(`   Columns: ${result.metadata.columns.length}`);
    console.log(`   Products: ${result.metadata.totalProducts}`);

    console.log(`\n💾 Writing output to: ${outputPath}`);
    writeFileSync(outputPath, JSON.stringify(result, null, 2));

    // Also print summary of first few products
    console.log(`\n📋 Sample products (first 3):`);
    result.products.slice(0, 3).forEach((product, idx) => {
      console.log(`\n  Product ${idx + 1}:`);
      Object.entries(product).forEach(([key, value]) => {
        const displayValue =
          String(value).length > 50 ? String(value).substring(0, 47) + '...' : value;
        console.log(`    ${key}: ${displayValue}`);
      });
    });

    console.log(`\n✨ Done!\n`);
  } catch (error) {
    console.error(`\n❌ Error:`, error);
    process.exit(1);
  }
}

if (process.argv[1] === import.meta.url.replace('file://', '')) {
  main();
}
