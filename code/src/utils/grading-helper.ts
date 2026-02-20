import { Product } from '../services/index.js';
import { Document } from './models/index.js';

export interface ProductMatch {
  benchmarkProduct: Product;
  matchedProduct: Product | null;
  matchScore: number;
  matchType: 'exact' | 'partial' | 'none';
  fieldMatches: { [fieldName: string]: boolean };
}

export interface GradingMetrics {
  totalBenchmarkProducts: number;
  totalExtractedProducts: number;
  correctMatches: number;
  partialMatches: number;
  missedProducts: number;
  falsePositives: number;
  precision: number; // TP / (TP + FP)
  recall: number; // TP / (TP + FN)
  f1Score: number; // 2 * (precision * recall) / (precision + recall)
  accuracy: number; // Overall accuracy percentage
}

export interface GradingAnalysis {
  matchDetails: ProductMatch[];
  missedProductsList: Product[];
  falsePositivesList: Product[];
  fieldAccuracy: {
    [fieldName: string]: number;
  };
  qualityIssues: string[];
}

export interface GradingResult {
  runId: string;
  vendorName: string;
  benchmarkVersion: string;
  metrics: GradingMetrics;
  analysis: GradingAnalysis;
  gradedAt: Date;
}

/**
 * Calculate similarity score between two strings (0-1)
 */
export function calculateStringSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;

  // Simple Levenshtein-based similarity
  const maxLen = Math.max(s1.length, s2.length);
  const distance = levenshteinDistance(s1, s2);
  return 1 - distance / maxLen;
}

/**
 * Levenshtein distance between two strings
 */
export function levenshteinDistance(s1: string, s2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= s2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= s1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= s2.length; i++) {
    for (let j = 1; j <= s1.length; j++) {
      if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        );
      }
    }
  }

  return matrix[s2.length][s1.length];
}

/**
 * Get all field names from benchmark and extracted products
 */
export function getAllFieldNames(
  benchmarkProducts: Product[],
  extractedProducts: Product[]
): string[] {
  const fieldSet = new Set<string>();

  [...benchmarkProducts, ...extractedProducts].forEach((product) => {
    Object.keys(product).forEach((key) => fieldSet.add(key));
  });

  return Array.from(fieldSet);
}

/**
 * Calculate field distinctiveness (higher = more unique values, better for matching)
 */
export function calculateFieldWeights(products: Product[], fields: string[]): Map<string, number> {
  const weights = new Map<string, number>();

  fields.forEach((field) => {
    const values = new Set<string>();
    products.forEach((product) => {
      const value = product[field];
      if (value !== undefined && value !== null && value !== '') {
        values.add(String(value).toLowerCase());
      }
    });

    // Weight = uniqueness ratio (1.0 = all unique, 0 = all same)
    const uniqueness = products.length > 0 ? values.size / products.length : 0;
    weights.set(field, uniqueness);
  });

  return weights;
}

/**
 * Compare two field values
 */
export function compareFieldValues(
  val1: string | number | undefined,
  val2: string | number | undefined
): number {
  if (val1 === undefined || val2 === undefined || val1 === null || val2 === null) {
    return 0;
  }

  // Both numeric
  if (typeof val1 === 'number' && typeof val2 === 'number') {
    const diff = Math.abs(val1 - val2);
    const avg = (val1 + val2) / 2;
    if (avg === 0) return diff === 0 ? 1.0 : 0.0;
    const percentDiff = diff / avg;
    return percentDiff < 0.01 ? 1.0 : percentDiff < 0.1 ? 0.8 : percentDiff < 0.5 ? 0.5 : 0.0;
  }

  // Convert to strings and compare
  const str1 = String(val1);
  const str2 = String(val2);
  return calculateStringSimilarity(str1, str2);
}

/**
 * Match benchmark product to extracted product using dynamic fields
 */
export function matchProduct(
  benchmarkProduct: Product,
  extractedProducts: Product[],
  fields: string[],
  fieldWeights: Map<string, number>
): ProductMatch {
  let bestMatch: Product | null = null;
  let bestScore = 0;
  let bestFieldMatches: { [fieldName: string]: boolean } = {};

  for (const extracted of extractedProducts) {
    let totalScore = 0;
    let totalWeight = 0;
    const fieldMatches: { [fieldName: string]: boolean } = {};

    fields.forEach((field) => {
      const benchVal = benchmarkProduct[field];
      const extractVal = extracted[field];

      // Skip if either value is missing
      if (benchVal === undefined || extractVal === undefined) {
        fieldMatches[field] = false;
        return;
      }

      const similarity = compareFieldValues(benchVal, extractVal);
      const weight = fieldWeights.get(field) || 0.5; // Default weight if not found

      totalScore += similarity * weight;
      totalWeight += weight;

      const isMatch = similarity > 0.9;
      fieldMatches[field] = isMatch;
    });

    const normalizedScore = totalWeight > 0 ? totalScore / totalWeight : 0;

    if (normalizedScore > bestScore) {
      bestScore = normalizedScore;
      bestMatch = extracted;
      bestFieldMatches = fieldMatches;
    }
  }

  // Determine match type based on number of exact field matches
  const totalFields = fields.filter(
    (f) => benchmarkProduct[f] !== undefined && bestMatch?.[f] !== undefined
  ).length;

  let matchType: 'exact' | 'partial' | 'none' = 'none';
  if (totalFields > 0) {
    const exactMatchRatio = Object.values(bestFieldMatches).filter((m) => m).length / totalFields;
    if (exactMatchRatio >= 0.8) matchType = 'exact';
    else if (exactMatchRatio >= 0.4 || bestScore > 0.5) matchType = 'partial';
  }

  return {
    benchmarkProduct,
    matchedProduct: bestMatch,
    matchScore: bestScore,
    matchType,
    fieldMatches: bestFieldMatches,
  };
}

export function calculateGrade(benchmarkBlob: Buffer<ArrayBufferLike>, document: Document) {
  const benchmarkData = JSON.parse(benchmarkBlob.toString('utf-8'));
  const benchmarkProducts: Product[] = benchmarkData.products || [];

  // 3. Parse extracted products
  const mappingData = JSON.parse(document.ai_mapping_result || '{}');
  const extractedProducts: Product[] = mappingData.products || [];

  // 4. Get all fields and calculate field weights for intelligent matching
  const allFields = getAllFieldNames(benchmarkProducts, extractedProducts);
  const fieldWeights = calculateFieldWeights(benchmarkProducts, allFields);

  console.log(`Grading with ${allFields.length} fields:`, allFields);
  console.log('Field weights (distinctiveness):', Object.fromEntries(fieldWeights));

  // 5. Match products
  const matches: ProductMatch[] = [];
  const matchedExtractedIndices = new Set<number>();

  for (const benchmarkProduct of benchmarkProducts) {
    const match = matchProduct(benchmarkProduct, extractedProducts, allFields, fieldWeights);
    matches.push(match);

    // Track which extracted products were matched
    if (match.matchedProduct) {
      const idx = extractedProducts.indexOf(match.matchedProduct);
      if (idx !== -1) matchedExtractedIndices.add(idx);
    }
  }

  // 6. Calculate metrics
  const correctMatches = matches.filter((m) => m.matchType === 'exact').length;
  const partialMatches = matches.filter((m) => m.matchType === 'partial').length;
  const missedProducts = matches.filter((m) => m.matchType === 'none').length;

  // False positives: extracted products not matched to any benchmark product
  const falsePositives = extractedProducts.length - matchedExtractedIndices.size;

  const truePositives = correctMatches;
  const falseNegatives = missedProducts;

  const precision =
    truePositives + falsePositives > 0 ? truePositives / (truePositives + falsePositives) : 0;
  const recall =
    truePositives + falseNegatives > 0 ? truePositives / (truePositives + falseNegatives) : 0;
  const f1Score = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const accuracy =
    benchmarkProducts.length > 0
      ? ((correctMatches + partialMatches * 0.5) / benchmarkProducts.length) * 100
      : 0;

  // 6. Calculate field-level accuracy for each field
  const fieldAccuracy: { [fieldName: string]: number } = {};

  allFields.forEach((field) => {
    const fieldMatches = matches.filter((m) => m.fieldMatches[field] === true).length;
    const totalProductsWithField = benchmarkProducts.filter((p) => p[field] !== undefined).length;
    fieldAccuracy[field] =
      totalProductsWithField > 0
        ? Math.round((fieldMatches / totalProductsWithField) * 10000) / 100
        : 0;
  });

  console.log('Field accuracy:', fieldAccuracy);

  // 7. Identify issues
  const missedProductsList = matches
    .filter((m) => m.matchType === 'none')
    .map((m) => m.benchmarkProduct);

  const falsePositivesList: Product[] = [];
  extractedProducts.forEach((product, idx) => {
    if (!matchedExtractedIndices.has(idx)) {
      falsePositivesList.push(product);
    }
  });

  const qualityIssues: string[] = [];
  if (missedProducts > 0) {
    qualityIssues.push(`${missedProducts} products were not extracted from the document`);
  }
  if (falsePositives > 0) {
    qualityIssues.push(`${falsePositives} spurious products were incorrectly extracted`);
  }

  // Check accuracy for all fields
  Object.entries(fieldAccuracy).forEach(([field, accuracy]) => {
    if (accuracy < 80) {
      qualityIssues.push(`Field "${field}" accuracy is below 80% (${accuracy.toFixed(1)}%)`);
    }
  });

  // 8. Assemble result
  const result: GradingResult = {
    runId: document.result_id,
    vendorName: document.vendor_name,
    benchmarkVersion: benchmarkData.version || new Date().toISOString(),
    metrics: {
      totalBenchmarkProducts: benchmarkProducts.length,
      totalExtractedProducts: extractedProducts.length,
      correctMatches,
      partialMatches,
      missedProducts,
      falsePositives,
      precision: Math.round(precision * 10000) / 100,
      recall: Math.round(recall * 10000) / 100,
      f1Score: Math.round(f1Score * 10000) / 100,
      accuracy: Math.round(accuracy * 100) / 100,
    },
    analysis: {
      matchDetails: matches,
      missedProductsList,
      falsePositivesList,
      fieldAccuracy,
      qualityIssues,
    },
    gradedAt: new Date(),
  };
  return result;
}
