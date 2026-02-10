#!/usr/bin/env tsx
/**
 * Extract Products from Raw OCR Data
 *
 * Reads raw OCR data from Azure Document Intelligence and extracts:
 * - All tables with their columns
 * - Products with their column values
 * - Merges tables with identical column structures
 *
 * Usage:
 *   tsx test/tools/extract-ocr-products.ts <input.json> <output.json>
 *   tsx test/tools/extract-ocr-products.ts test/outputs/raw-ocr-data.json test/outputs/ocr-extracted-products.json
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'node:url';

interface OcrTable {
  rowCount: number;
  columnCount: number;
  cells: Array<{
    kind?: string;
    rowIndex: number;
    columnIndex: number;
    content: string;
    rowSpan?: number;
    columnSpan?: number;
  }>;
}

interface ExtractedTable {
  tableIndex: number;
  columns: string[];
  rows: Record<string, string>[];
  productCount: number;
}

interface OcrProductsOutput {
  metadata: {
    extractedAt: string;
    totalTables: number;
    totalProducts: number;
    mergeIterations: number;
  };
  tables: ExtractedTable[];
}

/**
 * Normalize column name for comparison
 */
function normalizeColumn(col: string): string {
  return col
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, '_');
}

/**
 * Deduplicate columns within a table by merging duplicate column values
 */
function deduplicateColumns(
  columns: string[],
  rows: Record<string, string>[]
): { columns: string[]; rows: Record<string, string>[] } {
  // Find duplicate column names
  const columnCounts = new Map<string, number>();
  const columnIndices = new Map<string, number[]>();

  columns.forEach((col, idx) => {
    columnCounts.set(col, (columnCounts.get(col) || 0) + 1);
    if (!columnIndices.has(col)) {
      columnIndices.set(col, []);
    }
    columnIndices.get(col)!.push(idx);
  });

  // Check if we have duplicates
  const hasDuplicates = Array.from(columnCounts.values()).some((count) => count > 1);

  if (!hasDuplicates) {
    return { columns, rows };
  }

  console.log(
    `  ⚠️  Found duplicate columns: ${Array.from(columnCounts.entries())
      .filter(([, count]) => count > 1)
      .map(([col]) => col)}`
  );

  // Create new unique columns list
  const uniqueColumns = Array.from(new Set(columns));

  // Merge rows
  const mergedRows = rows.map((row) => {
    const newRow: Record<string, string> = {};

    uniqueColumns.forEach((col) => {
      const indices = columnIndices.get(col) || [];
      const values = indices.map((idx) => row[columns[idx]]).filter((v) => v && v.trim());

      // If all duplicates have same value, use it; otherwise join with ' | '
      const uniqueValues = Array.from(new Set(values));
      newRow[col] = uniqueValues.length === 1 ? uniqueValues[0] : uniqueValues.join(' | ');
    });

    return newRow;
  });

  console.log(`  ✓ Deduplicated ${columns.length} → ${uniqueColumns.length} columns`);

  return { columns: uniqueColumns, rows: mergedRows };
}

/**
 * Extract table data from OCR table structure
 */
function extractTableData(ocrTable: OcrTable): {
  columns: string[];
  rows: Record<string, string>[];
} {
  const { rowCount, columnCount, cells } = ocrTable;

  // Build a grid structure
  const grid: (string | null)[][] = Array(rowCount)
    .fill(null)
    .map(() => Array(columnCount).fill(null));

  // Fill the grid with cell contents
  for (const cell of cells) {
    const { rowIndex, columnIndex, content, rowSpan = 1, columnSpan = 1 } = cell;

    // Fill all spanned cells
    for (let r = rowIndex; r < Math.min(rowIndex + rowSpan, rowCount); r++) {
      for (let c = columnIndex; c < Math.min(columnIndex + columnSpan, columnCount); c++) {
        if (grid[r][c] === null) {
          grid[r][c] = content;
        }
      }
    }
  }

  // First row is headers
  const columns = grid[0].map((cell, idx) => cell || `Column_${idx + 1}`);

  // Remaining rows are data
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < rowCount; i++) {
    const row: Record<string, string> = {};
    let hasData = false;

    for (let j = 0; j < columnCount; j++) {
      const value = grid[i][j] || '';
      row[columns[j]] = value;
      if (value.trim()) hasData = true;
    }

    // Only add rows that have at least some data
    if (hasData) {
      rows.push(row);
    }
  }

  return { columns, rows };
}

/**
 * Check if two column sets are identical (ignoring normalization differences)
 */
export function columnsMatch(cols1: string[], cols2: string[]): boolean {
  if (cols1.length !== cols2.length) return false;

  const normalized1 = cols1.map(normalizeColumn).sort();
  const normalized2 = cols2.map(normalizeColumn).sort();

  return normalized1.every((col, idx) => col === normalized2[idx]);
}

/**
 * Calculate inconsistency score between two tables
 * inconsistency = (outerJoin - innerJoin) / outerJoin
 *               = 1 - (innerJoin / outerJoin)
 *
 * Lower score = more similar tables
 * Score of 0 = identical columns
 * Score of 1 = no common columns
 */
function calculateInconsistency(cols1: string[], cols2: string[]): number {
  const normalized1 = cols1.map(normalizeColumn);
  const normalized2 = cols2.map(normalizeColumn);

  const outerJoin = new Set([...normalized1, ...normalized2]);
  const innerJoin = normalized1.filter((col) => normalized2.includes(col));

  const inconsistency = (outerJoin.size - innerJoin.length) / outerJoin.size;

  return inconsistency;
}

/**
 * Merge two tables into one with outer join of columns
 */
function mergeTables(table1: ExtractedTable, table2: ExtractedTable): ExtractedTable {
  // Get all unique columns (outer join)
  const allColumns = Array.from(new Set([...table1.columns, ...table2.columns]));

  // Merge rows, filling missing columns with empty strings
  const mergedRows: Record<string, string>[] = [
    ...table1.rows.map((row) => {
      const newRow: Record<string, string> = {};
      allColumns.forEach((col) => {
        newRow[col] = row[col] || '';
      });
      return newRow;
    }),
    ...table2.rows.map((row) => {
      const newRow: Record<string, string> = {};
      allColumns.forEach((col) => {
        newRow[col] = row[col] || '';
      });
      return newRow;
    }),
  ];

  return {
    tableIndex: Math.min(table1.tableIndex, table2.tableIndex),
    columns: allColumns,
    rows: mergedRows,
    productCount: mergedRows.length,
  };
}

/**
 * Main extraction function
 */
function extractOcrProducts(rawOcrData: any): OcrProductsOutput {
  const ocrResponse = rawOcrData.ocrResponse;
  const tables: OcrTable[] = ocrResponse.tables || [];

  console.log(`Found ${tables.length} tables in OCR data`);

  // Extract data from each table
  let extractedTables: ExtractedTable[] = [];

  for (let i = 0; i < tables.length; i++) {
    const table = tables[i];
    console.log(`\nProcessing table ${i + 1}/${tables.length}...`);
    console.log(`  Dimensions: ${table.rowCount} rows × ${table.columnCount} columns`);

    try {
      let { columns, rows } = extractTableData(table);

      // Deduplicate columns if needed
      const deduped = deduplicateColumns(columns, rows);
      columns = deduped.columns;
      rows = deduped.rows;

      console.log(`  Extracted: ${rows.length} data rows`);
      console.log(`  Columns (${columns.length}): ${columns.join(', ')}`);

      extractedTables.push({
        tableIndex: i + 1,
        columns,
        rows,
        productCount: rows.length,
      });
    } catch (error) {
      console.error(`  ✗ Error processing table ${i + 1}:`, error);
    }
  }

  // Smart table merging based on inconsistency score
  const INCONSISTENCY_THRESHOLD = 0.3; // Merge if 70%+ columns are common
  let mergeIterations = 0;

  console.log(`\n🔄 Starting smart table merging (threshold: ${INCONSISTENCY_THRESHOLD})...`);

  while (extractedTables.length > 1) {
    // Calculate inconsistency for all pairs
    const pairs: Array<{
      i: number;
      j: number;
      inconsistency: number;
      table1Idx: number;
      table2Idx: number;
    }> = [];

    for (let i = 0; i < extractedTables.length; i++) {
      for (let j = i + 1; j < extractedTables.length; j++) {
        const inconsistency = calculateInconsistency(
          extractedTables[i].columns,
          extractedTables[j].columns
        );

        pairs.push({
          i,
          j,
          inconsistency,
          table1Idx: extractedTables[i].tableIndex,
          table2Idx: extractedTables[j].tableIndex,
        });
      }
    }

    // Sort by: inconsistency (ascending), then table1Idx, then table2Idx
    pairs.sort((a, b) => {
      if (Math.abs(a.inconsistency - b.inconsistency) > 0.001) {
        return a.inconsistency - b.inconsistency;
      }
      if (a.table1Idx !== b.table1Idx) {
        return a.table1Idx - b.table1Idx;
      }
      return a.table2Idx - b.table2Idx;
    });

    // Check if we should merge the best pair
    const bestPair = pairs[0];

    if (bestPair.inconsistency >= INCONSISTENCY_THRESHOLD) {
      console.log(
        `\n✓ Merge complete: Lowest inconsistency (${bestPair.inconsistency.toFixed(3)}) exceeds threshold`
      );
      break;
    }

    // Merge the tables
    mergeIterations++;
    const table1 = extractedTables[bestPair.i];
    const table2 = extractedTables[bestPair.j];

    console.log(
      `\n  Iteration ${mergeIterations}: Merging tables ${table1.tableIndex} and ${table2.tableIndex}`
    );
    console.log(`    Inconsistency: ${bestPair.inconsistency.toFixed(3)}`);
    console.log(
      `    Table ${table1.tableIndex}: ${table1.columns.length} cols, ${table1.productCount} rows`
    );
    console.log(
      `    Table ${table2.tableIndex}: ${table2.columns.length} cols, ${table2.productCount} rows`
    );

    const merged = mergeTables(table1, table2);

    console.log(`    → Merged: ${merged.columns.length} cols, ${merged.productCount} rows`);

    // Remove the two tables and add the merged one
    extractedTables = [
      ...extractedTables.slice(0, bestPair.i),
      ...extractedTables.slice(bestPair.i + 1, bestPair.j),
      ...extractedTables.slice(bestPair.j + 1),
      merged,
    ];
  }

  // Re-index tables sequentially
  extractedTables = extractedTables.map((table, idx) => ({
    ...table,
    tableIndex: idx + 1,
  }));

  const totalProducts = extractedTables.reduce((sum, t) => sum + t.productCount, 0);

  return {
    metadata: {
      extractedAt: new Date().toISOString(),
      totalTables: extractedTables.length,
      totalProducts,
      mergeIterations,
    },
    tables: extractedTables,
  };
}

/**
 * Main execution
 */
function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: tsx extract-ocr-products.ts <input.json> <output.json>');
    console.error(
      'Example: tsx extract-ocr-products.ts test/outputs/raw-ocr-data.json test/outputs/ocr-extracted-products.json'
    );
    process.exit(1);
  }

  const [inputPath, outputPath] = args;

  console.log(`\n📖 Reading OCR data from: ${inputPath}`);
  const rawData = JSON.parse(readFileSync(inputPath, 'utf-8'));

  console.log(`\n🔍 Extracting products...`);
  const result = extractOcrProducts(rawData);

  console.log(`\n✅ Extraction complete:`);
  console.log(`   Tables: ${result.metadata.totalTables}`);
  console.log(`   Products: ${result.metadata.totalProducts}`);
  console.log(`   Merge iterations: ${result.metadata.mergeIterations}`);

  // Print summary of tables
  console.log(`\n📊 Table Summary:`);
  result.tables.forEach((table) => {
    console.log(
      `   Table ${table.tableIndex}: ${table.productCount} products, ${table.columns.length} columns`
    );
    console.log(`      Columns: ${table.columns.join(', ')}`);
  });

  console.log(`\n💾 Writing output to: ${outputPath}`);
  writeFileSync(outputPath, JSON.stringify(result, null, 2));

  console.log(`\n✨ Done!\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
