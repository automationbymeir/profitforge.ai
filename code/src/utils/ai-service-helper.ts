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
  };
} {
  const totalFieldCount = products.length * columnHeaders.length;
  let populatedFields = 0;
  let emptyFields = 0;
  let productsWithAllFields = 0;

  products.forEach((p) => {
    let fieldsInProduct = 0;
    columnHeaders.forEach((header) => {
      const value = p[header];
      if (value !== undefined && value !== null && value !== '') {
        populatedFields++;
        fieldsInProduct++;
      } else {
        emptyFields++;
      }
    });
    if (fieldsInProduct === columnHeaders.length) {
      productsWithAllFields++;
    }
  });

  const completenessScore = totalFieldCount > 0 ? (populatedFields / totalFieldCount) * 100 : 0;
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
  console.log('Quality Metrics:', { completenessScore, confidenceScore, metrics });

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
