/**
 * Integration Test - Delete Vendor Endpoint Error Handling
 *
 * Tests error scenarios for the delete vendor endpoint.
 * Focuses on not-found scenarios and authorization.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { cleanTestDatabase } from '../utils/helpers';

const FUNCTION_BASE_URL = 'http://localhost:7071';

describe('Integration: Delete Vendor Endpoint Errors', () => {
  beforeEach(async () => {
    await cleanTestDatabase();
  });

  it('should return 404 for non-existent vendor', async () => {
    const response = await fetch(`${FUNCTION_BASE_URL}/api/vendors/NONEXISTENT_99_99`, {
      method: 'DELETE',
    });

    expect(response.status).toBe(404);
  });

  it('should reject delete with malformed vendor name', async () => {
    const response = await fetch(`${FUNCTION_BASE_URL}/api/vendors/`, {
      method: 'DELETE',
    });

    expect(response.status).toBe(404);
  });

  it('should handle SQL injection attempts in vendor name', async () => {
    const maliciousVendor = "'; DROP TABLE vendors; --";
    const response = await fetch(
      `${FUNCTION_BASE_URL}/api/vendors/${encodeURIComponent(maliciousVendor)}`,
      {
        method: 'DELETE',
      }
    );

    // Should handle safely - either 404 or sanitize
    expect([404, 400]).toContain(response.status);
  });

  it('should reject delete with special characters in vendor name', async () => {
    const specialChars = '<script>alert("xss")</script>';
    const response = await fetch(
      `${FUNCTION_BASE_URL}/api/vendors/${encodeURIComponent(specialChars)}`,
      {
        method: 'DELETE',
      }
    );

    // Should handle safely
    expect([404, 400]).toContain(response.status);
  });

  it('should handle very long vendor names', async () => {
    const longVendorName = 'A'.repeat(1000);
    const response = await fetch(
      `${FUNCTION_BASE_URL}/api/vendors/${encodeURIComponent(longVendorName)}`,
      {
        method: 'DELETE',
      }
    );

    // Should handle gracefully
    expect([404, 400, 414]).toContain(response.status);
  });
});
