/**
 * Test Vendor Name Generator
 *
 * Generates vendor names following the convention:
 * <TEST_TYPE>_TEST_<DESCRIPTION>_MM_YY
 *
 * Examples:
 * - E2E_TEST_UPLOAD_TO_COMPLETION_01_26
 * - INTEGRATION_TEST_ERROR_HANDLING_01_26
 * - UNIT_TEST_API_VALIDATION_01_26
 */

export type TestType = 'E2E' | 'INTEGRATION' | 'UNIT';

/**
 * Generate a test vendor name with current month/year
 */
export function generateTestVendorName(testType: TestType, description: string): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = String(now.getFullYear()).slice(-2);

  // Normalize description: uppercase, replace spaces/hyphens with underscores
  const normalizedDesc = description
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, ''); // Remove leading/trailing underscores

  return `${testType}_TEST_${normalizedDesc}_${month}_${year}`;
}
