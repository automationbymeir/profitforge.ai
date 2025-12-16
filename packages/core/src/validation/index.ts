import type { ProductStaging } from "../types/index.js";

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Validation schema for product fields
 */
export const VALIDATION_SCHEMA = {
  SKU: {
    required: true,
    type: "string",
    maxLength: 100,
    pattern: /^[A-Za-z0-9\-_]+$/,
    errorMessage: "SKU must contain only letters, numbers, hyphens, and underscores",
  },
  Description: {
    required: true,
    type: "string",
    maxLength: 500,
    minLength: 3,
    errorMessage: "Description must be between 3 and 500 characters",
  },
  Cost: {
    required: true,
    type: "decimal",
    min: 0.01,
    max: 999999.99,
    precision: 2,
    errorMessage: "Cost must be between 0.01 and 999999.99",
  },
  MAP: {
    required: false,
    type: "decimal",
    min: 0,
    max: 999999.99,
    precision: 2,
    validation: "must be >= Cost if provided",
    errorMessage: "MAP must be >= Cost if provided",
  },
  MSRP: {
    required: false,
    type: "decimal",
    min: 0,
    max: 999999.99,
    precision: 2,
    validation: "must be >= MAP if both provided",
    errorMessage: "MSRP must be >= MAP if both provided",
  },
  Category: {
    required: false,
    type: "string",
    maxLength: 200,
    errorMessage: "Category must be <= 200 characters",
  },
  MOQ: {
    required: false,
    type: "integer",
    min: 1,
    max: 100000,
    default: 1,
    errorMessage: "MOQ must be between 1 and 100000",
  },
  LeadTimeDays: {
    required: false,
    type: "integer",
    min: 0,
    max: 365,
    errorMessage: "LeadTimeDays must be between 0 and 365",
  },
  UPC: {
    required: false,
    type: "string",
    pattern: /^\d{12,14}$/,
    errorMessage: "UPC must be 12-14 digits",
  },
  Weight: {
    required: false,
    type: "decimal",
    min: 0,
    precision: 4,
    errorMessage: "Weight must be >= 0",
  },
} as const;

/**
 * Validate a product staging record
 */
export function validateProduct(product: Partial<ProductStaging>): ValidationResult {
  const errors: ValidationError[] = [];

  // Validate SKU
  if (!product.sku) {
    errors.push({ field: "SKU", message: VALIDATION_SCHEMA.SKU.errorMessage });
  } else if (!VALIDATION_SCHEMA.SKU.pattern.test(product.sku)) {
    errors.push({ field: "SKU", message: VALIDATION_SCHEMA.SKU.errorMessage });
  } else if (product.sku.length > VALIDATION_SCHEMA.SKU.maxLength) {
    errors.push({ field: "SKU", message: `SKU must be <= ${VALIDATION_SCHEMA.SKU.maxLength} characters` });
  }

  // Validate Description
  if (!product.description) {
    errors.push({ field: "Description", message: VALIDATION_SCHEMA.Description.errorMessage });
  } else if (product.description.length < VALIDATION_SCHEMA.Description.minLength!) {
    errors.push({ field: "Description", message: VALIDATION_SCHEMA.Description.errorMessage });
  } else if (product.description.length > VALIDATION_SCHEMA.Description.maxLength) {
    errors.push({ field: "Description", message: VALIDATION_SCHEMA.Description.errorMessage });
  }

  // Validate Cost
  if (product.cost === undefined || product.cost === null) {
    errors.push({ field: "Cost", message: VALIDATION_SCHEMA.Cost.errorMessage });
  } else if (product.cost < VALIDATION_SCHEMA.Cost.min || product.cost > VALIDATION_SCHEMA.Cost.max) {
    errors.push({ field: "Cost", message: VALIDATION_SCHEMA.Cost.errorMessage });
  }

  // Validate MAP >= Cost
  if (product.map !== undefined && product.map !== null && product.cost !== undefined) {
    if (product.map < product.cost) {
      errors.push({ field: "MAP", message: VALIDATION_SCHEMA.MAP.errorMessage });
    }
  }

  // Validate MSRP >= MAP
  if (product.msrp !== undefined && product.msrp !== null && product.map !== undefined) {
    if (product.msrp < product.map) {
      errors.push({ field: "MSRP", message: VALIDATION_SCHEMA.MSRP.errorMessage });
    }
  }

  // Validate UPC
  if (product.upc && !VALIDATION_SCHEMA.UPC.pattern!.test(product.upc)) {
    errors.push({ field: "UPC", message: VALIDATION_SCHEMA.UPC.errorMessage });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
