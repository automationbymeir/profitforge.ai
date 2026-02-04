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
  baseName: string; // BETTER_LIVING
  month: string; // 11
  year: string; // 25
}

// Format: VENDOR_NAME_MM_YY (alphanumeric with underscores, ending in MM_YY)
const pattern = /^[A-Z0-9]+(_[A-Z0-9]+)*_\d{2}_\d{2}$/;

/**
 * Validates vendor name format
 */
export function validateVendorName(vendorName: string): boolean {
  if (!pattern.test(vendorName)) {
    return false;
  }
  const { month } = parseVendorName(vendorName);
  if (parseInt(month, 10) < 1 || parseInt(month, 10) > 12) {
    return false;
  }
  return true;
}

/**
 * Parse vendor name into components
 */
export function parseVendorName(vendorName: string): VendorNameParts {
  const parts = vendorName.split('_');
  const year = parts.pop() || '';
  const month = parts.pop() || '';
  const baseName = parts.join('_');

  return {
    baseName,
    month,
    year,
  };
}
