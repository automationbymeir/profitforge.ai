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
    cleanupStats?: {
      columnsBeforeCleanup: number;
      columnsAfterCleanup: number;
      emptyColumnsRemoved: string[];
    };
  };
  tables: ExtractedTable[];
  preMergedTables?: ExtractedTable[];
  deterministicCleanup?: {
    columns: string[];
    products: Record<string, string>[];
    productCount: number;
  };
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
 * Get column signature for grouping (normalized, sorted column names)
 */
function getColumnSignature(columns: string[]): string {
  return columns.map(normalizeColumn).sort().join('|');
}

/**
 * Merge tables with identical column sets and clean up empty columns
 */
function preMergeIdenticalTables(tables: ExtractedTable[]): {
  mergedTables: ExtractedTable[];
  iterations: number;
} {
  // Group tables by column signature
  const groups = new Map<string, ExtractedTable[]>();

  tables.forEach((table) => {
    const signature = getColumnSignature(table.columns);
    if (!groups.has(signature)) {
      groups.set(signature, []);
    }
    groups.get(signature)!.push(table);
  });

  console.log(`\n🔗 Pre-merging tables with identical columns...`);
  console.log(`  Found ${groups.size} unique column patterns`);

  const mergedTables: ExtractedTable[] = [];
  let iterations = 0;

  groups.forEach((groupTables) => {
    if (groupTables.length === 1) {
      // Single table, just clean up empty columns
      const table = groupTables[0];
      const cleaned = cleanupEmptyColumns(table.columns, table.rows);

      if (cleaned.emptyColumnsRemoved.length > 0) {
        console.log(
          `  Table ${table.tableIndex}: Removed ${cleaned.emptyColumnsRemoved.length} empty columns`
        );
      }

      mergedTables.push({
        tableIndex: table.tableIndex,
        columns: cleaned.columns,
        rows: cleaned.products,
        productCount: cleaned.products.length,
      });
    } else {
      // Multiple tables with same columns - merge them
      iterations += groupTables.length - 1;
      console.log(
        `  Merging ${groupTables.length} tables with signature: ${groupTables[0].columns.join(', ')}`
      );

      let merged = groupTables[0];
      for (let i = 1; i < groupTables.length; i++) {
        merged = mergeTables(merged, groupTables[i]);
      }

      // Clean up empty columns after merging
      const cleaned = cleanupEmptyColumns(merged.columns, merged.rows);

      console.log(`    → Merged ${groupTables.length} tables: ${merged.productCount} products`);
      if (cleaned.emptyColumnsRemoved.length > 0) {
        console.log(
          `    → Removed ${cleaned.emptyColumnsRemoved.length} empty columns: ${cleaned.emptyColumnsRemoved.join(', ')}`
        );
      }

      mergedTables.push({
        tableIndex: Math.min(...groupTables.map((t) => t.tableIndex)),
        columns: cleaned.columns,
        rows: cleaned.products,
        productCount: cleaned.products.length,
      });
    }
  });

  console.log(
    `  ✓ Pre-merge complete: ${tables.length} → ${mergedTables.length} tables (${iterations} merges)`
  );

  return { mergedTables, iterations };
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
function _calculateInconsistency(cols1: string[], cols2: string[]): number {
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
 * Deterministic cleanup: Remove columns where all values are empty/falsy
 */
function cleanupEmptyColumns(
  columns: string[],
  products: Record<string, string>[]
): {
  columns: string[];
  products: Record<string, string>[];
  emptyColumnsRemoved: string[];
} {
  const emptyColumns: string[] = [];
  const nonEmptyColumns: string[] = [];

  // Check each column to see if it has any non-empty values
  for (const col of columns) {
    const hasData = products.some((product) => {
      const value = product[col];
      return value && value.trim() !== '';
    });

    if (hasData) {
      nonEmptyColumns.push(col);
    } else {
      emptyColumns.push(col);
    }
  }

  // Create cleaned products with only non-empty columns
  const cleanedProducts = products.map((product) => {
    const cleaned: Record<string, string> = {};
    nonEmptyColumns.forEach((col) => {
      cleaned[col] = product[col] || '';
    });
    return cleaned;
  });

  return {
    columns: nonEmptyColumns,
    products: cleanedProducts,
    emptyColumnsRemoved: emptyColumns,
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

  // PRE-MERGE: Merge tables with identical column sets first
  const preMergeResult = preMergeIdenticalTables(extractedTables);
  const preMergedTables = [...preMergeResult.mergedTables]; // Store for output
  extractedTables = preMergeResult.mergedTables;

  // Re-index tables sequentially
  extractedTables = extractedTables.map((table, idx) => ({
    ...table,
    constableIndex: idx + 1,
  }));

  const totalProducts = extractedTables.reduce((sum, t) => sum + t.productCount, 0);

  // DETERMINISTIC CLEANUP: Merge all tables into one and remove empty columns
  console.log(`\n🧹 Applying deterministic cleanup...`);
  let allProducts: Record<string, string>[] = [];
  const allColumns = new Set<string>();

  // Collect all products and columns from all tables
  extractedTables.forEach((table) => {
    table.columns.forEach((col) => allColumns.add(col));
    allProducts = allProducts.concat(table.rows);
  });

  const columnsBeforeCleanup = Array.from(allColumns);
  console.log(`  Columns before cleanup: ${columnsBeforeCleanup.length}`);
  console.log(`  Total products: ${allProducts.length}`);

  // Normalize all products to have all columns
  const normalizedProducts = allProducts.map((product) => {
    const normalized: Record<string, string> = {};
    columnsBeforeCleanup.forEach((col) => {
      normalized[col] = product[col] || '';
    });
    return normalized;
  });

  // Remove empty columns
  const cleaned = cleanupEmptyColumns(columnsBeforeCleanup, normalizedProducts);

  console.log(`  Columns after cleanup: ${cleaned.columns.length}`);
  console.log(
    `  Empty columns removed (${cleaned.emptyColumnsRemoved.length}):`,
    cleaned.emptyColumnsRemoved
  );

  return {
    metadata: {
      extractedAt: new Date().toISOString(),
      totalTables: extractedTables.length,
      totalProducts,
      cleanupStats: {
        columnsBeforeCleanup: columnsBeforeCleanup.length,
        columnsAfterCleanup: cleaned.columns.length,
        emptyColumnsRemoved: cleaned.emptyColumnsRemoved,
      },
    },
    tables: extractedTables,
    preMergedTables,
    deterministicCleanup: {
      columns: cleaned.columns,
      products: cleaned.products,
      productCount: cleaned.products.length,
    },
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

  // Print pre-merged tables summary
  if (result.preMergedTables && result.preMergedTables.length > 1) {
    console.log(`\n📋 Pre-Merged Tables (after identical column merge):`);
    result.preMergedTables.forEach((table) => {
      console.log(
        `   Table ${table.tableIndex}: ${table.productCount} products, ${table.columns.length} columns`
      );
      console.log(`      Columns: ${table.columns.join(', ')}`);
    });
  }

  // Print summary of tables
  console.log(`\n📊 Table Summary:`);
  result.tables.forEach((table) => {
    console.log(
      `   Table ${table.tableIndex}: ${table.productCount} products, ${table.columns.length} columns`
    );
    console.log(`      Columns: ${table.columns.join(', ')}`);
  });

  // Print deterministic cleanup results
  if (result.deterministicCleanup) {
    console.log(`\n🧹 Deterministic Cleanup Results:`);
    console.log(
      `   Final columns (${result.deterministicCleanup.columns.length}): ${result.deterministicCleanup.columns.join(', ')}`
    );
    console.log(`   Final products: ${result.deterministicCleanup.productCount}`);
    console.log(
      `   Empty columns removed: ${result.metadata.cleanupStats?.emptyColumnsRemoved.length || 0}`
    );
    if (result.metadata.cleanupStats?.emptyColumnsRemoved.length) {
      console.log(`      → ${result.metadata.cleanupStats.emptyColumnsRemoved.join(', ')}`);
    }
  }

  console.log(`\n💾 Writing output to: ${outputPath}`);
  writeFileSync(outputPath, JSON.stringify(result, null, 2));

  console.log(`\n✨ Done!\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
