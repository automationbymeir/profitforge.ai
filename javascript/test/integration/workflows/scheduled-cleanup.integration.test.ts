/**
 * Integration Test - Scheduled Cleanup Timer Trigger
 *
 * Tests the scheduled cleanup timer trigger with real database.
 * Verifies that old usage records are actually deleted from the database.
 *
 * SKIPPED: These tests require Azure Table Storage, not SQL Server.
 * The usageTracker implementation uses Azure Table Storage for tracking data.
 * TODO: Update tests to use Azurite (Table Storage emulator) or mock the TableClient
 */

import sql from 'mssql';
import { beforeEach, describe, expect, it } from 'vitest';
import { getConnectionPool } from '../../../src/utils/database';
import { cleanupOldUsageRecords, getUsageStats } from '../../../src/utils/usageTracker';

describe.skip('Integration: Scheduled Cleanup Timer Trigger', () => {
  beforeEach(async () => {
    // Clean up usage tracking tables before each test
    const pool = await getConnectionPool();
    await pool.request().query('DELETE FROM usage_tracking_daily');
    await pool.request().query('DELETE FROM usage_tracking_ip');
  });

  it('should cleanup records older than retention period', async () => {
    // Arrange - Insert test records with various dates
    const pool = await getConnectionPool();
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);
    const sixtyDaysAgo = new Date(today);
    sixtyDaysAgo.setDate(today.getDate() - 60);

    // Insert old records (should be deleted)
    await pool
      .request()
      .input('date', sql.Date, sixtyDaysAgo)
      .input('count', sql.Int, 5)
      .query(
        'INSERT INTO usage_tracking_daily (tracking_date, upload_count) VALUES (@date, @count)'
      );

    await pool
      .request()
      .input('ip', sql.VarChar(45), '192.168.1.1')
      .input('date', sql.Date, sixtyDaysAgo)
      .input('count', sql.Int, 3)
      .query(
        'INSERT INTO usage_tracking_ip (ip_address, tracking_date, upload_count) VALUES (@ip, @date, @count)'
      );

    // Insert recent records (should be kept)
    await pool
      .request()
      .input('date', sql.Date, today)
      .input('count', sql.Int, 10)
      .query(
        'INSERT INTO usage_tracking_daily (tracking_date, upload_count) VALUES (@date, @count)'
      );

    await pool
      .request()
      .input('ip', sql.VarChar(45), '192.168.1.2')
      .input('date', sql.Date, today)
      .input('count', sql.Int, 7)
      .query(
        'INSERT INTO usage_tracking_ip (ip_address, tracking_date, upload_count) VALUES (@ip, @date, @count)'
      );

    // Act
    const result = await cleanupOldUsageRecords(30);

    // Assert
    expect(result.dailyRecordsDeleted).toBe(1);
    expect(result.ipRecordsDeleted).toBe(1);

    // Verify records are actually deleted
    const dailyCount = await pool
      .request()
      .query('SELECT COUNT(*) as count FROM usage_tracking_daily');
    const ipCount = await pool.request().query('SELECT COUNT(*) as count FROM usage_tracking_ip');

    expect(dailyCount.recordset[0].count).toBe(1); // Only recent record remains
    expect(ipCount.recordset[0].count).toBe(1); // Only recent record remains
  });

  it('should preserve records within retention period', async () => {
    // Arrange - Insert records within retention period
    const pool = await getConnectionPool();
    const today = new Date();
    const fifteenDaysAgo = new Date(today);
    fifteenDaysAgo.setDate(today.getDate() - 15);

    await pool
      .request()
      .input('date', sql.Date, fifteenDaysAgo)
      .input('count', sql.Int, 5)
      .query(
        'INSERT INTO usage_tracking_daily (tracking_date, upload_count) VALUES (@date, @count)'
      );

    await pool
      .request()
      .input('ip', sql.VarChar(45), '192.168.1.1')
      .input('date', sql.Date, fifteenDaysAgo)
      .input('count', sql.Int, 3)
      .query(
        'INSERT INTO usage_tracking_ip (ip_address, tracking_date, upload_count) VALUES (@ip, @date, @count)'
      );

    // Act
    const result = await cleanupOldUsageRecords(30);

    // Assert
    expect(result.dailyRecordsDeleted).toBe(0);
    expect(result.ipRecordsDeleted).toBe(0);

    // Verify records still exist
    const dailyCount = await pool
      .request()
      .query('SELECT COUNT(*) as count FROM usage_tracking_daily');
    const ipCount = await pool.request().query('SELECT COUNT(*) as count FROM usage_tracking_ip');

    expect(dailyCount.recordset[0].count).toBe(1);
    expect(ipCount.recordset[0].count).toBe(1);
  });

  it('should handle cleanup with no records to delete', async () => {
    // Arrange - No records in database
    // Act
    const result = await cleanupOldUsageRecords(30);

    // Assert
    expect(result.dailyRecordsDeleted).toBe(0);
    expect(result.ipRecordsDeleted).toBe(0);
  });

  it('should get accurate usage stats before and after cleanup', async () => {
    // Arrange
    const pool = await getConnectionPool();
    const today = new Date();
    const sixtyDaysAgo = new Date(today);
    sixtyDaysAgo.setDate(today.getDate() - 60);

    // Insert old and new records
    await pool
      .request()
      .input('date', sql.Date, sixtyDaysAgo)
      .input('count', sql.Int, 5)
      .query(
        'INSERT INTO usage_tracking_daily (tracking_date, upload_count) VALUES (@date, @count)'
      );

    await pool
      .request()
      .input('date', sql.Date, today)
      .input('count', sql.Int, 10)
      .query(
        'INSERT INTO usage_tracking_daily (tracking_date, upload_count) VALUES (@date, @count)'
      );

    // Act - Get stats before cleanup
    const statsBefore = await getUsageStats();
    expect(statsBefore.totalDailyRecords).toBe(2);

    // Cleanup
    await cleanupOldUsageRecords(30);

    // Get stats after cleanup
    const statsAfter = await getUsageStats();

    // Assert
    expect(statsAfter.totalDailyRecords).toBe(1);
    expect(statsAfter.totalDailyRecords).toBeLessThan(statsBefore.totalDailyRecords);
  });

  it('should work with custom retention period', async () => {
    // Arrange
    const pool = await getConnectionPool();
    const today = new Date();
    const fortyFiveDaysAgo = new Date(today);
    fortyFiveDaysAgo.setDate(today.getDate() - 45);
    const fifteenDaysAgo = new Date(today);
    fifteenDaysAgo.setDate(today.getDate() - 15);

    // Insert records: 45 days old and 15 days old
    await pool
      .request()
      .input('date', sql.Date, fortyFiveDaysAgo)
      .input('count', sql.Int, 5)
      .query(
        'INSERT INTO usage_tracking_daily (tracking_date, upload_count) VALUES (@date, @count)'
      );

    await pool
      .request()
      .input('date', sql.Date, fifteenDaysAgo)
      .input('count', sql.Int, 10)
      .query(
        'INSERT INTO usage_tracking_daily (tracking_date, upload_count) VALUES (@date, @count)'
      );

    // Act - Cleanup with 60-day retention (both should be kept)
    const result60Days = await cleanupOldUsageRecords(60);
    expect(result60Days.dailyRecordsDeleted).toBe(0);

    // Act - Cleanup with 30-day retention (45-day-old should be deleted)
    const result30Days = await cleanupOldUsageRecords(30);
    expect(result30Days.dailyRecordsDeleted).toBe(1);

    // Assert
    const dailyCount = await pool
      .request()
      .query('SELECT COUNT(*) as count FROM usage_tracking_daily');
    expect(dailyCount.recordset[0].count).toBe(1); // Only 15-day-old record remains
  });

  it('should handle database errors gracefully', async () => {
    // This test verifies error handling when database operations fail
    // Note: This requires intentionally breaking the database connection
    // For now, we'll just verify that the function doesn't crash with valid inputs

    // Act & Assert
    await expect(cleanupOldUsageRecords(30)).resolves.not.toThrow();
  });
});
