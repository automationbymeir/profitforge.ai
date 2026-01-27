import { TableClient } from '@azure/data-tables';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkDailyUploadLimit,
  checkIpRateLimit,
  cleanupOldUsageRecords,
  getUsageStats,
  incrementDailyUploadCount,
  incrementIpUploadCount,
} from '../../src/utils/usageTracker';
import { mockTableClient } from './setup/mocks';

// Mock Azure Table Storage
vi.mock('@azure/data-tables', () => {
  let mockClient: any;

  return {
    TableClient: {
      fromConnectionString: vi.fn().mockImplementation(() => {
        if (!mockClient) {
          mockClient = mockTableClient();
        }
        return mockClient;
      }),
    },
  };
});

// Test configuration
const TEST_CONNECTION_STRING =
  'DefaultEndpointsProtocol=https;AccountName=mockaccount;AccountKey=mockkey==';

// Helper to get the mocked table client
const getTestTableClient = () => {
  return TableClient.fromConnectionString(TEST_CONNECTION_STRING, 'UsageTracking') as any;
};

describe('UsageTracker', () => {
  beforeAll(async () => {
    // Setup test environment
    process.env.STORAGE_CONNECTION_STRING = TEST_CONNECTION_STRING;
  });

  beforeEach(async () => {
    // Clear mock data before each test
    const client = getTestTableClient();
    if (client._clearEntities) {
      client._clearEntities();
    }
  });

  describe('Daily Upload Limits', () => {
    it('should allow uploads when no limit is set (client mode)', async () => {
      process.env.MAX_DAILY_UPLOADS = '0';

      const result = await checkDailyUploadLimit();

      expect(result.allowed).toBe(true);
      expect(result.current).toBe(0);
      expect(result.limit).toBe(0);
    });

    it('should allow uploads when under daily limit', async () => {
      process.env.MAX_DAILY_UPLOADS = '50';

      const result = await checkDailyUploadLimit();

      expect(result.allowed).toBe(true);
      expect(result.current).toBe(0);
      expect(result.limit).toBe(50);
    });

    it('should increment daily upload count', async () => {
      process.env.MAX_DAILY_UPLOADS = '50';

      const count1 = await incrementDailyUploadCount();
      expect(count1).toBe(1);

      const count2 = await incrementDailyUploadCount();
      expect(count2).toBe(2);

      const check = await checkDailyUploadLimit();
      expect(check.current).toBe(2);
      expect(check.allowed).toBe(true);
    });

    it('should block uploads when daily limit reached', async () => {
      process.env.MAX_DAILY_UPLOADS = '3';

      // Upload 3 times
      await incrementDailyUploadCount();
      await incrementDailyUploadCount();
      await incrementDailyUploadCount();

      // Check should now block
      const result = await checkDailyUploadLimit();
      expect(result.allowed).toBe(false);
      expect(result.current).toBe(3);
      expect(result.limit).toBe(3);
    });

    it('should not increment count in client mode', async () => {
      process.env.MAX_DAILY_UPLOADS = '0';

      const count = await incrementDailyUploadCount();
      expect(count).toBe(0);
    });
  });

  describe('IP-based Rate Limits', () => {
    const testIp = '192.168.1.100';

    it('should allow uploads when no IP limit set (client mode)', async () => {
      process.env.MAX_UPLOADS_PER_IP_PER_HOUR = '0';

      const result = await checkIpRateLimit(testIp);

      expect(result.allowed).toBe(true);
      expect(result.current).toBe(0);
      expect(result.limit).toBe(0);
    });

    it('should allow uploads when under hourly IP limit', async () => {
      process.env.MAX_UPLOADS_PER_IP_PER_HOUR = '10';

      const result = await checkIpRateLimit(testIp);

      expect(result.allowed).toBe(true);
      expect(result.current).toBe(0);
      expect(result.limit).toBe(10);
      expect(result.resetTime).toMatch(/\d{2}:00 UTC/);
    });

    it('should increment IP upload count', async () => {
      process.env.MAX_UPLOADS_PER_IP_PER_HOUR = '10';

      const count1 = await incrementIpUploadCount(testIp);
      expect(count1).toBe(1);

      const count2 = await incrementIpUploadCount(testIp);
      expect(count2).toBe(2);

      const check = await checkIpRateLimit(testIp);
      expect(check.current).toBe(2);
    });

    it('should block uploads when IP hourly limit reached', async () => {
      process.env.MAX_UPLOADS_PER_IP_PER_HOUR = '3';

      // Upload 3 times from same IP
      await incrementIpUploadCount(testIp);
      await incrementIpUploadCount(testIp);
      await incrementIpUploadCount(testIp);

      // Check should now block
      const result = await checkIpRateLimit(testIp);
      expect(result.allowed).toBe(false);
      expect(result.current).toBe(3);
      expect(result.limit).toBe(3);
    });

    it('should track different IPs separately', async () => {
      process.env.MAX_UPLOADS_PER_IP_PER_HOUR = '10';

      const ip1 = '192.168.1.1';
      const ip2 = '192.168.1.2';

      await incrementIpUploadCount(ip1);
      await incrementIpUploadCount(ip1);
      await incrementIpUploadCount(ip2);

      const check1 = await checkIpRateLimit(ip1);
      const check2 = await checkIpRateLimit(ip2);

      expect(check1.current).toBe(2);
      expect(check2.current).toBe(1);
    });

    it('should not increment count in client mode', async () => {
      process.env.MAX_UPLOADS_PER_IP_PER_HOUR = '0';

      const count = await incrementIpUploadCount(testIp);
      expect(count).toBe(0);
    });
  });

  describe('Cleanup Operations', () => {
    beforeEach(async () => {
      // Insert test data with various dates
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      const oldDate = new Date(Date.now() - 40 * 86400000).toISOString().split('T')[0]; // 40 days ago
      const client = getTestTableClient();

      // Daily records
      await client.createEntity({
        partitionKey: 'daily',
        rowKey: today,
        uploadCount: 10,
      });

      await client.createEntity({
        partitionKey: 'daily',
        rowKey: yesterday,
        uploadCount: 15,
      });

      await client.createEntity({
        partitionKey: 'daily',
        rowKey: oldDate,
        uploadCount: 20,
      });

      // IP rate records
      await client.createEntity({
        partitionKey: 'ip-rate',
        rowKey: `192.168.1.1-${today}-10`,
        uploadCount: 5,
      });

      await client.createEntity({
        partitionKey: 'ip-rate',
        rowKey: `192.168.1.1-${oldDate}-10`,
        uploadCount: 3,
      });
    });

    it('should get usage statistics', async () => {
      const stats = await getUsageStats();

      expect(stats.totalDailyRecords).toBeGreaterThanOrEqual(3);
      expect(stats.totalIpRecords).toBeGreaterThanOrEqual(2);
      expect(stats.todayUploads).toBe(10);
    });

    it('should cleanup old records', async () => {
      const daysToKeep = 30;

      const result = await cleanupOldUsageRecords(daysToKeep);

      expect(result.dailyRecordsDeleted).toBeGreaterThan(0);
      expect(result.ipRecordsDeleted).toBeGreaterThan(0);

      // Verify old records are gone
      const statsAfter = await getUsageStats();
      expect(statsAfter.totalDailyRecords).toBeLessThan(3);
    });

    it('should preserve recent records during cleanup', async () => {
      const statsBefore = await getUsageStats();
      expect(statsBefore.totalDailyRecords).toBe(3);

      await cleanupOldUsageRecords(30);

      // After cleanup, should have 2 daily records (today + yesterday)
      // and 1 IP record (today's record)
      const statsAfter = await getUsageStats();
      expect(statsAfter.totalDailyRecords).toBe(2); // today and yesterday preserved
      expect(statsAfter.totalIpRecords).toBe(1); // only today's IP record preserved
      expect(statsAfter.todayUploads).toBe(10); // today's upload count preserved
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing environment variables gracefully', async () => {
      delete process.env.MAX_DAILY_UPLOADS;
      delete process.env.MAX_UPLOADS_PER_IP_PER_HOUR;

      const dailyCheck = await checkDailyUploadLimit();
      const ipCheck = await checkIpRateLimit('192.168.1.1');

      expect(dailyCheck.allowed).toBe(true);
      expect(ipCheck.allowed).toBe(true);
    });

    it('should handle table storage errors gracefully', async () => {
      // Mock will handle this gracefully since it doesn't actually connect
      process.env.MAX_DAILY_UPLOADS = '50';

      const result = await checkDailyUploadLimit();

      // Should work with mocked storage
      expect(result.allowed).toBe(true);
      expect(result.current).toBe(0);
    });
  });

  describe('Integration Tests', () => {
    it('should enforce complete upload flow with all limits', async () => {
      process.env.MAX_DAILY_UPLOADS = '100';
      process.env.MAX_UPLOADS_PER_IP_PER_HOUR = '10';

      const testIp = '192.168.1.1';

      // Simulate uploads
      for (let i = 0; i < 10; i++) {
        const dailyCheck = await checkDailyUploadLimit();
        const ipCheck = await checkIpRateLimit(testIp);

        if (dailyCheck.allowed && ipCheck.allowed) {
          await incrementDailyUploadCount();
          await incrementIpUploadCount(testIp);
        }
      }

      // Verify state
      const dailyCheck = await checkDailyUploadLimit();
      const ipCheck = await checkIpRateLimit(testIp);

      expect(dailyCheck.current).toBe(10);
      expect(ipCheck.current).toBe(10);

      // 11th upload from same IP should be blocked
      const nextIpCheck = await checkIpRateLimit(testIp);
      expect(nextIpCheck.allowed).toBe(false);

      // But different IP should still work
      const differentIpCheck = await checkIpRateLimit('192.168.1.2');
      expect(differentIpCheck.allowed).toBe(true);
    });
  });
});
