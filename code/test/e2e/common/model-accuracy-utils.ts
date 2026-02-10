/**
 * Helper: Extract tables from raw OCR response
 */
export function extractOcrTables(ocrData: any): any[][] {
  const ocrResponse = ocrData.ocrResponse || ocrData;
  const tables = ocrResponse.tables || [];

  return tables.map((table: any) => {
    const rows: any[][] = [];
    const maxRow = Math.max(...table.cells.map((c: any) => c.rowIndex));
    const maxCol = Math.max(...table.cells.map((c: any) => c.columnIndex));

    // Initialize grid
    for (let r = 0; r <= maxRow; r++) {
      rows[r] = new Array(maxCol + 1).fill('');
    }

    // Fill grid with cell content
    table.cells.forEach((cell: any) => {
      rows[cell.rowIndex][cell.columnIndex] = cell.content || '';
    });

    // First row is headers
    const headers = rows[0];
    const dataRows = rows.slice(1);

    // Convert to objects with column names as keys
    return dataRows
      .map((row) => {
        const obj: any = {};
        headers.forEach((header, index) => {
          obj[header] = row[index];
        });
        return obj;
      })
      .filter((row) => {
        // Filter out empty rows (all values are empty strings)
        return Object.values(row).some((val) => val && String(val).trim() !== '');
      });
  });
}

/**
 * Helper: Normalize column name for matching
 */
function normalizeColumnName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Helper: Normalize value for comparison
 */
function normalizeValue(value: any): string {
  if (value == null) return '';
  return String(value).toLowerCase().replace(/\s+/g, ' ').replace(/[$,]/g, '').trim();
}

/**
 * Helper: Find matching column in OCR data
 */
function findMatchingColumn(
  excelColumnName: string,
  ocrRow: any
): { key: string; value: any } | null {
  const normalizedExcel = normalizeColumnName(excelColumnName);
  const ocrKeys = Object.keys(ocrRow);

  for (const key of ocrKeys) {
    if (normalizeColumnName(key) === normalizedExcel) {
      return { key, value: ocrRow[key] };
    }
  }

  return null;
}

/**
 * Helper: Grade OCR extraction accuracy
 * Compares raw OCR tables against benchmark data
 */
export function gradeOcrAccuracy(ocrTables: any[][], benchmarkProducts: any[]): any {
  // Flatten all OCR tables into single array of rows
  const allOcrRows = ocrTables.flat();

  // Get benchmark column names (from first product)
  const benchmarkColumns = Object.keys(benchmarkProducts[0] || {});

  let totalCells = 0;
  let matchedCells = 0;
  let exactMatches = 0;
  let fuzzyMatches = 0;
  let mismatches = 0;

  const columnAccuracy: Record<
    string,
    { total: number; exact: number; fuzzy: number; missed: number }
  > = {};

  benchmarkColumns.forEach((col) => {
    columnAccuracy[col] = { total: 0, exact: 0, fuzzy: 0, missed: 0 };
  });

  const missingRows: string[] = [];
  const sampleMismatches: Array<{
    column: string;
    expected: string;
    actual: string;
    rowKey: string;
  }> = [];

  // For each benchmark row, try to find matching OCR row by key field
  benchmarkProducts.forEach((benchmarkRow) => {
    // Use first column as key (usually Item # or SKU)
    const keyColumn =
      benchmarkColumns.find((col) => normalizeColumnName(col).includes('item')) ||
      benchmarkColumns[0];
    const keyValue = benchmarkRow[keyColumn];

    // Find matching OCR row by key
    const matchingOcrRow = allOcrRows.find((ocrRow) => {
      const match = findMatchingColumn(keyColumn, ocrRow);
      return match && normalizeValue(match.value) === normalizeValue(keyValue);
    });

    if (!matchingOcrRow) {
      // No matching row found - all cells are misses
      benchmarkColumns.forEach((col) => {
        columnAccuracy[col].total++;
        columnAccuracy[col].missed++;
        totalCells++;
        mismatches++;
      });
      missingRows.push(String(keyValue));
      return;
    }

    // Compare each column
    benchmarkColumns.forEach((excelCol) => {
      const expectedValue = benchmarkRow[excelCol];
      const ocrMatch = findMatchingColumn(excelCol, matchingOcrRow);

      totalCells++;
      columnAccuracy[excelCol].total++;

      if (!ocrMatch) {
        // Column not found in OCR
        columnAccuracy[excelCol].missed++;
        mismatches++;
        if (sampleMismatches.length < 10) {
          sampleMismatches.push({
            column: excelCol,
            expected: String(expectedValue),
            actual: '[COLUMN NOT FOUND]',
            rowKey: String(keyValue),
          });
        }
        return;
      }

      const actualValue = ocrMatch.value;
      const normalizedExpected = normalizeValue(expectedValue);
      const normalizedActual = normalizeValue(actualValue);

      if (normalizedExpected === normalizedActual) {
        // Exact match
        matchedCells++;
        exactMatches++;
        columnAccuracy[excelCol].exact++;
      } else if (
        normalizedExpected &&
        normalizedActual &&
        (normalizedExpected.includes(normalizedActual) ||
          normalizedActual.includes(normalizedExpected))
      ) {
        // Fuzzy match (substring)
        matchedCells++;
        fuzzyMatches++;
        columnAccuracy[excelCol].fuzzy++;
      } else {
        // Mismatch
        mismatches++;
        columnAccuracy[excelCol].missed++;
        if (sampleMismatches.length < 10) {
          sampleMismatches.push({
            column: excelCol,
            expected: String(expectedValue),
            actual: String(actualValue),
            rowKey: String(keyValue),
          });
        }
      }
    });
  });

  // Calculate accuracy percentages per column
  const columnAccuracyPercentages: Record<string, number> = {};
  Object.entries(columnAccuracy).forEach(([col, stats]) => {
    if (stats.total > 0) {
      columnAccuracyPercentages[col] = ((stats.exact + stats.fuzzy) / stats.total) * 100;
    } else {
      columnAccuracyPercentages[col] = 0;
    }
  });

  const overallAccuracy = totalCells > 0 ? (matchedCells / totalCells) * 100 : 0;

  return {
    overallAccuracy,
    totalCells,
    matchedCells,
    exactMatches,
    fuzzyMatches,
    mismatches,
    totalRows: benchmarkProducts.length,
    matchedRows: benchmarkProducts.length - missingRows.length,
    missingRows,
    columnAccuracy: columnAccuracyPercentages,
    columnStats: columnAccuracy,
    sampleMismatches,
  };
}
