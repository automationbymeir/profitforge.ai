/**
 * FieldMapper - Hybrid configuration-based + fuzzy matching field mapper
 *
 * Maps dynamic AI-extracted product fields to fixed database schema using:
 * 1. Exact alias matching (case-insensitive)
 * 2. Fuzzy string similarity matching (when exact fails)
 * 3. Configurable transformations and defaults
 * 4. Comprehensive validation and error reporting
 *
 * @module services/field-mapper
 */

import { distance } from 'fastest-levenshtein';
import { CreateVendorProductInput } from '../data/repositories/VendorProductRepository.prisma.js';
import config from '../utils/field-mapping-config.json' with { type: 'json' };
import { Product } from '../utils/models/product.js';

/**
 * Mapping rule definition from configuration
 */
interface MappingRule {
  targetField: string;
  primaryAliases: string[];
  fuzzyThreshold?: number;
  required: boolean;
  defaultValue?: unknown;
  transform?: string;
  notes?: string;
}

/**
 * Configuration structure
 */
interface MappingConfig {
  rules: MappingRule[];
  settings: {
    caseInsensitive: boolean;
    trimWhitespace: boolean;
    normalizeUnderscores: boolean;
    logMappingDecisions: boolean;
  };
}

/**
 * Mapping decision tracking for telemetry
 */
export interface MappingDecision {
  targetField: string;
  sourceField: string | null;
  matchType: 'exact' | 'fuzzy' | 'default' | 'missing';
  confidence: number;
  alternatives?: Array<{ field: string; score: number }>;
}

/**
 * Mapping result with telemetry
 */
export interface MappingResult {
  mapped: Partial<CreateVendorProductInput>;
  decisions: MappingDecision[];
  errors: string[];
  warnings: string[];
}

/**
 * Header mapping result - maps source field names to target field names
 */
export interface HeaderMapping {
  /** Map of source field -> target field */
  fieldMap: Map<string, string>;
  /** Mapping decisions for telemetry */
  decisions: MappingDecision[];
  /** Validation errors */
  errors: string[];
  /** Warnings about low-confidence mappings */
  warnings: string[];
}

/**
 * FieldMapper - Maps dynamic product fields to fixed schema
 */
export class FieldMapper {
  private config: MappingConfig;

  constructor(mappingConfig?: MappingConfig) {
    this.config = mappingConfig || (config as MappingConfig);
  }

  /**
   * Map headers once from source field names to target schema
   * This should be called ONCE per document, not per product
   *
   * @param sourceFieldNames - Array of field names from the AI-extracted products
   * @returns Header mapping with field name translations
   */
  mapHeaders(sourceFieldNames: string[]): HeaderMapping {
    const fieldMap = new Map<string, string>();
    const decisions: MappingDecision[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    // Create a mock product with all field names to leverage existing mapping logic
    const mockProduct: Product = {};
    for (const fieldName of sourceFieldNames) {
      mockProduct[fieldName] = undefined;
    }

    // Normalize source field names for matching
    const normalizedSource = this.normalizeSourceFields(mockProduct);

    // Map each target field to a source field
    for (const rule of this.config.rules) {
      const decision = this.mapField(rule, normalizedSource, mockProduct);
      decision.targetField = rule.targetField;
      decisions.push(decision);

      // Store the mapping
      if (decision.sourceField !== null && decision.matchType !== 'missing') {
        fieldMap.set(decision.sourceField, rule.targetField);
      }

      // Validation
      if (rule.required && decision.matchType === 'missing') {
        errors.push(
          `Required field '${rule.targetField}' could not be mapped. Tried aliases: ${rule.primaryAliases.join(', ')}`
        );
      }

      // Warnings for low confidence matches
      if (decision.matchType === 'fuzzy' && decision.confidence < 0.85) {
        warnings.push(
          `Low confidence mapping for '${rule.targetField}': ${decision.sourceField} (confidence: ${decision.confidence.toFixed(2)})`
        );
      }
    }

    return { fieldMap, decisions, errors, warnings };
  }

  /**
   * Apply header mapping to convert a single product
   *
   * @param source - Source product with dynamic field names
   * @param headerMapping - Pre-computed header mapping
   * @param contextData - Additional context data (vendor, document info)
   * @returns Mapped product
   */
  applyMapping(
    source: Product,
    headerMapping: HeaderMapping,
    contextData: {
      vendor_id: string;
      vendor_name: string;
      source_document_id: string;
      source_document_name: string;
    }
  ): Partial<CreateVendorProductInput> {
    const mapped: Record<string, unknown> = {
      ...contextData,
    };

    // Apply field mappings
    for (const [sourceField, targetField] of headerMapping.fieldMap.entries()) {
      let value = source[sourceField];

      // Apply transformation if configured
      const rule = this.config.rules.find((r) => r.targetField === targetField);
      if (rule?.transform && value !== undefined && value !== null) {
        value = this.applyTransform(value, rule.transform) as string | number | undefined;
      }

      mapped[targetField] = value;
    }

    // Apply default values for fields not found
    for (const rule of this.config.rules) {
      if (mapped[rule.targetField] === undefined && rule.defaultValue !== undefined) {
        mapped[rule.targetField] = rule.defaultValue;
      }
    }

    return mapped as Partial<CreateVendorProductInput>;
  }

  /**
   * Map a product object to the target schema (legacy single-product method)
   *
   * @deprecated Use mapHeaders() once, then applyMapping() for each product
   * @param source - Source product with dynamic field names
   * @param contextData - Additional context data (vendor, document info)
   * @returns Mapping result with decisions and validation
   */
  map(
    source: Product,
    contextData: {
      vendor_id: string;
      vendor_name: string;
      source_document_id: string;
      source_document_name: string;
    }
  ): MappingResult {
    const mapped: Record<string, unknown> = {
      ...contextData, // Include context data directly
    };
    const decisions: MappingDecision[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    // Normalize source field names for matching
    const normalizedSource = this.normalizeSourceFields(source);

    for (const rule of this.config.rules) {
      const decision = this.mapField(rule, normalizedSource, source);
      decisions.push(decision);

      // Apply mapped value
      if (decision.sourceField !== null && decision.matchType !== 'missing') {
        let value = source[decision.sourceField];

        // Apply transformation
        if (rule.transform && value !== undefined && value !== null) {
          value = this.applyTransform(value, rule.transform) as string | number | undefined;
        }

        mapped[rule.targetField] = value;
      } else if (rule.defaultValue !== undefined) {
        mapped[rule.targetField] = rule.defaultValue;
        decision.matchType = 'default';
      }

      // Validation
      if (
        rule.required &&
        (mapped[rule.targetField] === undefined || mapped[rule.targetField] === null)
      ) {
        errors.push(
          `Required field '${rule.targetField}' could not be mapped. Tried aliases: ${rule.primaryAliases.join(', ')}`
        );
      }

      // Warnings for low confidence matches
      if (decision.matchType === 'fuzzy' && decision.confidence < 0.85) {
        warnings.push(
          `Low confidence mapping for '${rule.targetField}': ${decision.sourceField} (confidence: ${decision.confidence.toFixed(2)})`
        );
      }
    }

    return {
      mapped: mapped as Partial<CreateVendorProductInput>,
      decisions,
      errors,
      warnings,
    };
  }

  /**
   * Map a single field using exact match, then fuzzy matching
   */
  private mapField(
    rule: MappingRule,
    normalizedSource: Map<string, string>,
    _originalSource: Product
  ): MappingDecision {
    // 1. Try exact match (case-insensitive)
    for (const alias of rule.primaryAliases) {
      const normalizedAlias = this.normalizeFieldName(alias);
      if (normalizedSource.has(normalizedAlias)) {
        const originalFieldName = normalizedSource.get(normalizedAlias);
        if (!originalFieldName) continue;
        return {
          targetField: rule.targetField,
          sourceField: originalFieldName,
          matchType: 'exact',
          confidence: 1.0,
        };
      }
    }

    // 2. Try fuzzy match if threshold is defined
    if (rule.fuzzyThreshold !== undefined) {
      const fuzzyMatch = this.findFuzzyMatch(
        rule.primaryAliases,
        Array.from(normalizedSource.keys()),
        normalizedSource,
        rule.fuzzyThreshold
      );

      if (fuzzyMatch) {
        return fuzzyMatch;
      }
    }

    // 3. No match found
    return {
      targetField: rule.targetField,
      sourceField: null,
      matchType: 'missing',
      confidence: 0,
    };
  }

  /**
   * Find best fuzzy match using Levenshtein distance
   */
  private findFuzzyMatch(
    aliases: string[],
    sourceFields: string[],
    normalizedMap: Map<string, string>,
    threshold: number
  ): MappingDecision | null {
    const matches: Array<{ normalizedField: string; originalField: string; similarity: number }> =
      [];

    for (const sourceField of sourceFields) {
      for (const alias of aliases) {
        const normalizedAlias = this.normalizeFieldName(alias);
        const similarity = this.calculateSimilarity(normalizedAlias, sourceField);

        if (similarity >= threshold) {
          const originalField = normalizedMap.get(sourceField);
          if (originalField) {
            matches.push({
              normalizedField: sourceField,
              originalField,
              similarity,
            });
          }
        }
      }
    }

    if (matches.length === 0) {
      return null;
    }

    // Sort by similarity (highest first)
    matches.sort((a, b) => b.similarity - a.similarity);

    // Return best match with alternatives
    const best = matches[0];
    const alternatives = matches.slice(1, 4).map((m) => ({
      field: m.originalField,
      score: m.similarity,
    }));

    return {
      targetField: '', // Will be set by caller
      sourceField: best.originalField,
      matchType: 'fuzzy',
      confidence: best.similarity,
      alternatives: alternatives.length > 0 ? alternatives : undefined,
    };
  }

  /**
   * Calculate similarity score (0-1) using normalized Levenshtein distance
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const maxLength = Math.max(str1.length, str2.length);
    if (maxLength === 0) return 1.0;

    const dist = distance(str1, str2);
    return 1 - dist / maxLength;
  }

  /**
   * Normalize source fields for matching
   */
  private normalizeSourceFields(source: Product): Map<string, string> {
    const normalized = new Map<string, string>();

    for (const key of Object.keys(source)) {
      const normalizedKey = this.normalizeFieldName(key);
      normalized.set(normalizedKey, key); // Map normalized -> original
    }

    return normalized;
  }

  /**
   * Normalize field name for comparison
   */
  private normalizeFieldName(fieldName: string): string {
    let normalized = fieldName;

    if (this.config.settings.caseInsensitive) {
      normalized = normalized.toLowerCase();
    }

    if (this.config.settings.trimWhitespace) {
      normalized = normalized.trim();
    }

    if (this.config.settings.normalizeUnderscores) {
      normalized = normalized.replace(/_/g, '');
    }

    return normalized;
  }

  /**
   * Apply transformation to a value
   */
  private applyTransform(value: unknown, transform: string): unknown {
    switch (transform) {
      case 'parseFloat':
        return typeof value === 'string' ? parseFloat(value) : value;
      case 'parseInt':
        return typeof value === 'string' ? parseInt(value, 10) : value;
      case 'toString':
        return value !== null && value !== undefined ? String(value) : value;
      case 'trim':
        return typeof value === 'string' ? value.trim() : value;
      default:
        return value;
    }
  }

  /**
   * Validate that a mapping result meets requirements
   */
  validateMapping(result: MappingResult): boolean {
    return result.errors.length === 0;
  }

  /**
   * Get summary statistics for mapping decisions
   */
  getMappingStats(decisions: MappingDecision[]): {
    exact: number;
    fuzzy: number;
    default: number;
    missing: number;
    avgConfidence: number;
  } {
    const stats = {
      exact: decisions.filter((d) => d.matchType === 'exact').length,
      fuzzy: decisions.filter((d) => d.matchType === 'fuzzy').length,
      default: decisions.filter((d) => d.matchType === 'default').length,
      missing: decisions.filter((d) => d.matchType === 'missing').length,
      avgConfidence: 0,
    };

    const confidences = decisions.filter((d) => d.matchType !== 'missing').map((d) => d.confidence);
    stats.avgConfidence =
      confidences.length > 0 ? confidences.reduce((sum, c) => sum + c, 0) / confidences.length : 0;

    return stats;
  }

  /**
   * Format mapping decisions for logging/telemetry
   * Returns a structured object suitable for Application Insights custom properties
   */
  formatMappingTelemetry(decisions: MappingDecision[]): Record<string, string> {
    const telemetry: Record<string, string> = {};

    for (const decision of decisions) {
      const key = `mapping_${decision.targetField}`;

      if (decision.matchType === 'exact' || decision.matchType === 'fuzzy') {
        telemetry[key] =
          `${decision.sourceField} (${decision.matchType}, ${(decision.confidence * 100).toFixed(0)}%)`;
      } else if (decision.matchType === 'default') {
        telemetry[key] = 'default_value';
      } else {
        telemetry[key] = 'not_found';
      }
    }

    const stats = this.getMappingStats(decisions);
    telemetry['mapping_stats'] = JSON.stringify({
      exact: stats.exact,
      fuzzy: stats.fuzzy,
      default: stats.default,
      missing: stats.missing,
      avgConfidence: Math.round(stats.avgConfidence * 100),
    });

    return telemetry;
  }
}

/**
 * Factory function for FieldMapper
 */
export function createFieldMapper(): FieldMapper {
  return new FieldMapper();
}
