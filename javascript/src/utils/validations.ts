/**
 * Vendor Name Validation and File Naming Utilities
 *
 * Vendor name format: VENDOR_NAME_MM_YY
 * - All uppercase letters A-Z
 * - Underscores between words
 * - Ends with _MM_YY (month and year)
 * - Example: BETTER_LIVING_11_25
 */

export interface VendorNameParts {
  fullName: string; // BETTER_LIVING_11_25
  baseName: string; // BETTER_LIVING
  month: string; // 11
  year: string; // 25
  fileName: string; // BETTER_LIVING-11-25.pdf
}

/**
 * Validates vendor name format
 */
export function validateVendorName(vendorName: string): { valid: boolean; error?: string } {
  if (!vendorName) {
    return { valid: false, error: 'Vendor name is required' };
  }

  // Format: VENDOR_NAME_MM_YY (alphanumeric with underscores, ending in MM_YY)
  const pattern = /^[A-Z0-9]+(_[A-Z0-9]+)*_\d{2}_\d{2}$/;

  if (!pattern.test(vendorName)) {
    return {
      valid: false,
      error:
        'Vendor name must be in format VENDOR_NAME_MM_YY (e.g., BETTER_LIVING_11_25). Only uppercase letters, numbers, underscores, and MM_YY suffix allowed.',
    };
  }

  // Extract and validate month
  const parts = vendorName.split('_');
  const month = parts[parts.length - 2];
  const monthNum = parseInt(month);

  if (monthNum < 1 || monthNum > 12) {
    return {
      valid: false,
      error: `Invalid month: ${month}. Month must be between 01 and 12.`,
    };
  }

  return { valid: true };
}

/**
 * Parse vendor name into components
 */
export function parseVendorName(vendorName: string): VendorNameParts | null {
  const validation = validateVendorName(vendorName);
  if (!validation.valid) {
    return null;
  }

  const parts = vendorName.split('_');
  const year = parts[parts.length - 1];
  const month = parts[parts.length - 2];
  const baseName = parts.slice(0, -2).join('_');

  return {
    fullName: vendorName,
    baseName,
    month,
    year,
    fileName: `${baseName}_${month}_${year}.pdf`,
  };
}

/**
 * Get standardized file name for vendor
 */
export function getVendorFileName(vendorName: string): string {
  const parsed = parseVendorName(vendorName);
  if (!parsed) {
    throw new Error(`Invalid vendor name: ${vendorName}`);
  }
  return parsed.fileName;
}
