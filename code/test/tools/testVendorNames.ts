/**
 * Test Vendor Name Generator
 * Generates unique vendor names for integration tests
 */

/**
 * Generate a unique test vendor name with timestamp
 * Format: TEST_VENDOR_PREFIX_<timestamp>
 */
export function generateTestVendorName(prefix: string = 'TEST'): string {
  const timestamp = Date.now();
  return `${prefix}_${timestamp}`;
}

/**
 * Generate a vendor name with a specific suffix
 */
export function generateTestVendorNameWithSuffix(prefix: string, suffix: string): string {
  return `${prefix}_${suffix}`;
}

/**
 * Check if a vendor name is a test vendor
 */
export function isTestVendor(vendorName: string): boolean {
  return vendorName.startsWith('TEST');
}
