import { CONFIDENCE_THRESHOLDS, type ReviewLevel } from "../types/index.js";

/**
 * Determine review level based on confidence score
 */
export function determineReviewLevel(confidence: number): ReviewLevel {
  if (confidence >= CONFIDENCE_THRESHOLDS.autoApprove) {
    return "auto_approve";
  } else if (confidence >= CONFIDENCE_THRESHOLDS.standardReview) {
    return "standard_review";
  } else if (confidence >= CONFIDENCE_THRESHOLDS.detailedReview) {
    return "detailed_review";
  } else {
    return "reject";
  }
}

/**
 * Clean decimal value from string (removes $, commas, etc.)
 */
export function cleanDecimal(value: string | number): number {
  if (typeof value === "number") return value;
  const cleaned = value.replace(/[$,\s]/g, "");
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Extract digits only from string
 */
export function extractDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Convert to uppercase and trim
 */
export function toUpperCase(value: string): string {
  return value.toUpperCase().trim();
}

/**
 * Generate date path for Data Lake storage
 */
export function getDatePath(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

/**
 * Generate vendor-specific path in Data Lake
 */
export function getVendorPath(vendorId: string, date?: Date): string {
  const datePath = date ? getDatePath(date) : getDatePath();
  return `${vendorId}/${datePath}`;
}
