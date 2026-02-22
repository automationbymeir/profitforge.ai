import type { ChatCompletion } from 'openai/resources/chat/completions';
import { Product } from './models/index.js';

interface TableCell {
  kind: string;
  content?: string;
  rowIndex: number;
  columnIndex: number;
}

interface Table {
  cells: TableCell[];
}

export interface MappingResultJson {
  timestamp: string;
  products: Product[];
  productCount: number;
  canonicalHeaders: Array<{ columnIndex: number; headerName: string }>;
  tableStructure: Record<string, unknown>;
  qualityMetrics: {
    completenessScore: number;
    confidenceScore: number;
    totalFields: number;
    populatedFields: number;
    emptyFields: number;
    productsWithAllFields: number;
    averageFieldsPerProduct: number;
    // Enhanced KPIs
    fieldPopulationRates: Record<string, number>; // % populated per field
    completenessDistribution: {
      '100%': number;
      '90-99%': number;
      '75-89%': number;
      '50-74%': number;
      '<50%': number;
    };
    dataQualityIssues: {
      emptyOrNearlyEmptyProducts: number;
      fieldsWithHighMissingRate: string[]; // Fields with >50% missing
      fieldsWithAllSameValue: string[]; // Possible extraction errors
    };
  };
  usage: {
    promptTokens: number;
    completionTokens: number;
    cost: number;
  };
}

export function extractTableHeaders(
  tables: Table[]
): Array<{ tableIdx: number; colIdx: number; header: string }> {
  const allHeaders: Array<{ tableIdx: number; colIdx: number; header: string }> = [];
  tables.forEach((table: Table, tableIdx: number) => {
    const headerCells = table.cells.filter((c: TableCell) => c.kind === 'columnHeader');
    headerCells.forEach((cell: TableCell) => {
      allHeaders.push({
        tableIdx,
        colIdx: cell.columnIndex,
        header: cell.content || '',
      });
    });
  });
  return allHeaders;
}

/**
 * Calculate quality metrics for extracted products
 *
 * Returns two primary KPIs for evaluating extraction quality:
 *
 * **COMPLETENESS SCORE**: Overall data fill rate across all fields
 * - Measures: What % of all possible data cells are populated
 * - Range: 0-100%
 * - Good: >85% | Acceptable: 60-85% | Poor: <60%
 * - Use case: Understand overall extraction success rate
 *
 * **CONFIDENCE SCORE**: Percentage of fully complete products
 * - Measures: What % of products have ALL fields populated
 * - Range: 0-100%
 * - Good: >80% | Acceptable: 40-80% | Poor: <40%
 * - Use case: Understand data consistency and reliability
 *
 * Low confidence with acceptable completeness (e.g., 10% confidence, 75% completeness)
 * indicates sparse but widespread data - most products missing at least one field.
 *
 * @param products - Array of extracted products
 * @param columnHeaders - Expected column headers to check against
 * @returns Quality scores and detailed metrics
 */
export function calculateQualityMetrics(
  products: Product[],
  columnHeaders: string[]
): {
  completenessScore: number;
  confidenceScore: number;
  metrics: {
    totalFields: number;
    populatedFields: number;
    emptyFields: number;
    productsWithAllFields: number;
    averageFieldsPerProduct: number;
    fieldPopulationRates: Record<string, number>;
    completenessDistribution: {
      '100%': number;
      '90-99%': number;
      '75-89%': number;
      '50-74%': number;
      '<50%': number;
    };
    dataQualityIssues: {
      emptyOrNearlyEmptyProducts: number;
      fieldsWithHighMissingRate: string[];
      fieldsWithAllSameValue: string[];
    };
  };
} {
  const totalFieldCount = products.length * columnHeaders.length;
  let populatedFields = 0;
  let emptyFields = 0;
  let productsWithAllFields = 0;

  // Track field-level statistics
  const fieldStats: Record<string, { populated: number; uniqueValues: Set<string> }> = {};
  columnHeaders.forEach((header) => {
    fieldStats[header] = { populated: 0, uniqueValues: new Set() };
  });

  // Track product completeness
  const completenessDistribution = {
    '100%': 0,
    '90-99%': 0,
    '75-89%': 0,
    '50-74%': 0,
    '<50%': 0,
  };

  products.forEach((p) => {
    let fieldsInProduct = 0;
    columnHeaders.forEach((header) => {
      const value = p[header];
      if (value !== undefined && value !== null && value !== '') {
        populatedFields++;
        fieldsInProduct++;
        fieldStats[header].populated++;
        fieldStats[header].uniqueValues.add(String(value));
      } else {
        emptyFields++;
      }
    });

    // Categorize product completeness
    const productCompleteness = (fieldsInProduct / columnHeaders.length) * 100;
    if (productCompleteness === 100) {
      completenessDistribution['100%']++;
      productsWithAllFields++;
    } else if (productCompleteness >= 90) {
      completenessDistribution['90-99%']++;
    } else if (productCompleteness >= 75) {
      completenessDistribution['75-89%']++;
    } else if (productCompleteness >= 50) {
      completenessDistribution['50-74%']++;
    } else {
      completenessDistribution['<50%']++;
    }
  });

  // Calculate field-level population rates
  const fieldPopulationRates: Record<string, number> = {};
  const fieldsWithHighMissingRate: string[] = [];
  const fieldsWithAllSameValue: string[] = [];

  columnHeaders.forEach((header) => {
    const populationRate = (fieldStats[header].populated / products.length) * 100;
    fieldPopulationRates[header] = Math.round(populationRate * 100) / 100;

    // Flag fields with high missing rate (>50% missing)
    if (populationRate < 50) {
      fieldsWithHighMissingRate.push(header);
    }

    // Flag fields where all values are identical (possible extraction error)
    if (fieldStats[header].uniqueValues.size === 1 && fieldStats[header].populated > 1) {
      fieldsWithAllSameValue.push(header);
    }
  });

  // Count empty or nearly empty products (<20% complete)
  const emptyOrNearlyEmptyProducts = completenessDistribution['<50%'];

  // COMPLETENESS SCORE: Percentage of all possible data fields that are populated
  // Formula: (populated fields / total possible fields) × 100
  // Example: 617 products × 10 columns = 6,170 total fields
  //          If 4,767 are populated → 77.2% completeness
  // High score (>85%) = most data extracted successfully
  // Low score (<50%) = many missing values, possible extraction issues
  const completenessScore = totalFieldCount > 0 ? (populatedFields / totalFieldCount) * 100 : 0;

  // CONFIDENCE SCORE: Percentage of products that have ALL fields populated
  // Formula: (products with all fields / total products) × 100
  // Example: Only 10 out of 617 products fully populated → 1.6% confidence
  // High score (>80%) = consistent, complete data extraction
  // Low score (<20%) = sparse data, most products missing at least one field
  // Note: More strict than completeness - even one missing field = not counted
  const confidenceScore = products.length > 0 ? (productsWithAllFields / products.length) * 100 : 0;

  return {
    completenessScore: Math.round(completenessScore * 100) / 100,
    confidenceScore: Math.round(confidenceScore * 100) / 100,
    metrics: {
      totalFields: totalFieldCount,
      populatedFields,
      emptyFields,
      productsWithAllFields,
      averageFieldsPerProduct: products.length > 0 ? populatedFields / products.length : 0,
      fieldPopulationRates,
      completenessDistribution,
      dataQualityIssues: {
        emptyOrNearlyEmptyProducts,
        fieldsWithHighMissingRate,
        fieldsWithAllSameValue,
      },
    },
  };
}

export function extractProductsFromTables(
  tables: Table[],
  canonicalHeaders: Array<{ columnIndex: number; headerName: string }>
): Product[] {
  const products: Product[] = [];

  for (const table of tables) {
    const contentCells = table.cells.filter((c: TableCell) => c.kind === 'content');
    if (contentCells.length === 0) continue;

    const rowCount = Math.max(...contentCells.map((c: TableCell) => c.rowIndex)) + 1;

    // Skip header row (rowIdx 0)
    for (let rowIdx = 1; rowIdx < rowCount; rowIdx++) {
      const rowCells = contentCells.filter((c: TableCell) => c.rowIndex === rowIdx);

      const product: Product = {};
      let hasAnyData = false;

      // Extract data for each canonical column
      for (const header of canonicalHeaders) {
        const cell = rowCells.find((c: TableCell) => c.columnIndex === header.columnIndex);
        const content = cell?.content?.trim();

        if (content) {
          hasAnyData = true;
          // Try to parse as number if it looks numeric
          const numericMatch = content.match(/^[\d,]+\.?\d*$/);
          if (numericMatch) {
            product[header.headerName] = parseFloat(content.replace(/,/g, ''));
          } else {
            product[header.headerName] = content;
          }
        }
      }

      // Only add product if it has at least one field with data
      if (hasAnyData) {
        products.push(product);
      }
    }
  }

  return products;
}

//calculate Quality Metrics and extract products using canonical headers
// different than benchmark, which compares to ground truth - this is more of an internal quality check on the AI mapping results themselves

export function calculateJsonResult(
  normalizationResponse: ChatCompletion,
  tables: Table[]
): MappingResultJson {
  // Extract content from OpenAI response
  const content = normalizationResponse.choices[0]?.message?.content;

  if (!content) {
    console.error('No content in AI response');
    throw new Error('AI response missing content');
  }

  const normalizationResult = JSON.parse(content);
  const canonicalHeaders = normalizationResult.canonicalHeaders || [];

  if (!Array.isArray(canonicalHeaders) || canonicalHeaders.length === 0) {
    console.error('No canonical headers in AI response');
    throw new Error('AI response missing canonical headers');
  }

  // Extract products using canonical headers
  const products = extractProductsFromTables(tables, canonicalHeaders);

  // Calculate quality metrics
  const headerNames = canonicalHeaders.map((h: { headerName: string }) => h.headerName);
  const { completenessScore, confidenceScore, metrics } = calculateQualityMetrics(
    products,
    headerNames
  );

  // Calculate costs
  const promptTokens = normalizationResponse.usage?.prompt_tokens || 0;
  const completionTokens = normalizationResponse.usage?.completion_tokens || 0;
  // GPT-4o pricing: $2.50/1M input, $10.00/1M output
  const cost = (promptTokens * 0.0025 + completionTokens * 0.01) / 1000;

  const mappingResultJson = {
    timestamp: new Date().toISOString(),
    products,
    productCount: products.length,
    canonicalHeaders,
    tableStructure: normalizationResult.tableStructure || {},
    qualityMetrics: {
      completenessScore,
      confidenceScore,
      ...metrics,
    },
    usage: {
      promptTokens,
      completionTokens,
      cost,
    },
  };
  return mappingResultJson;
}
