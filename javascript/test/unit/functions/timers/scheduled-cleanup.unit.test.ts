/**
 * Unit Test - Scheduled Cleanup Timer Trigger
 *
 * Tests the scheduled cleanup timer trigger handler logic.
 * Mocks database operations and focuses on handler behavior.
 */

import { InvocationContext, Timer } from '@azure/functions';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { scheduledCleanupHandler } from '../../../../src/functions/timers/scheduled-cleanup';
import * as usageTracker from '../../../../src/utils/usageTracker';

// Mock the usageTracker module
vi.mock('../../../../src/utils/usageTracker', () => ({
  cleanupOldUsageRecords: vi.fn(),
  getUsageStats: vi.fn(),
}));

describe('Scheduled Cleanup Timer Trigger - Unit Tests', () => {
  let mockContext: InvocationContext;
  let mockTimer: Timer;

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Create mock InvocationContext
    mockContext = {
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      invocationId: 'test-invocation-id',
      functionName: 'scheduledCleanup',
      extraInputs: {
        get: vi.fn(),
        set: vi.fn(),
      },
      extraOutputs: {
        get: vi.fn(),
        set: vi.fn(),
      },
      options: {},
      traceContext: {
        traceparent: 'test-traceparent',
        tracestate: 'test-tracestate',
        attributes: {},
      },
    } as unknown as InvocationContext;

    // Create mock Timer
    mockTimer = {
      scheduleStatus: {
        last: new Date('2026-02-01T02:00:00Z'),
        next: new Date('2026-02-02T02:00:00Z'),
        lastUpdated: new Date('2026-02-01T02:00:00Z'),
      },
      isPastDue: false,
    };

    // Set default environment variable
    process.env.USAGE_RETENTION_DAYS = '30';
  });

  it('should cleanup old usage records successfully', async () => {
    // Arrange
    const mockStatsBefore = {
      totalDailyRecords: 100,
      totalIpRecords: 50,
      todayUploads: 15,
      oldestRecord: '2025-01-01',
    };

    const mockStatsAfter = {
      totalDailyRecords: 60,
      totalIpRecords: 30,
      todayUploads: 15,
      oldestRecord: '2026-01-01',
    };

    const mockCleanupResult = {
      dailyRecordsDeleted: 40,
      ipRecordsDeleted: 20,
    };

    vi.mocked(usageTracker.getUsageStats).mockResolvedValueOnce(mockStatsBefore);
    vi.mocked(usageTracker.getUsageStats).mockResolvedValueOnce(mockStatsAfter);
    vi.mocked(usageTracker.cleanupOldUsageRecords).mockResolvedValue(mockCleanupResult);

    // Act
    await scheduledCleanupHandler(mockTimer, mockContext);

    // Assert
    expect(usageTracker.getUsageStats).toHaveBeenCalledTimes(2);
    expect(usageTracker.cleanupOldUsageRecords).toHaveBeenCalledWith(30);
    expect(mockContext.log).toHaveBeenCalledWith('🧹 Starting scheduled cleanup...');
    expect(mockContext.log).toHaveBeenCalledWith('✅ Cleanup complete:');
    expect(mockContext.log).toHaveBeenCalledWith('   - Daily records deleted: 40');
    expect(mockContext.log).toHaveBeenCalledWith('   - IP records deleted: 20');
  });

  it('should use custom retention days from environment variable', async () => {
    // Arrange
    process.env.USAGE_RETENTION_DAYS = '60';

    const mockStats = {
      totalDailyRecords: 100,
      totalIpRecords: 50,
      todayUploads: 8,
      oldestRecord: '2025-01-01',
    };

    const mockCleanupResult = {
      dailyRecordsDeleted: 20,
      ipRecordsDeleted: 10,
    };

    vi.mocked(usageTracker.getUsageStats).mockResolvedValue(mockStats);
    vi.mocked(usageTracker.cleanupOldUsageRecords).mockResolvedValue(mockCleanupResult);

    // Act
    await scheduledCleanupHandler(mockTimer, mockContext);

    // Assert
    expect(usageTracker.cleanupOldUsageRecords).toHaveBeenCalledWith(60);
    expect(mockContext.log).toHaveBeenCalledWith('   - Retention policy: 60 days');
  });

  it('should default to 30 days if USAGE_RETENTION_DAYS is not set', async () => {
    // Arrange
    delete process.env.USAGE_RETENTION_DAYS;

    const mockStats = {
      totalDailyRecords: 100,
      totalIpRecords: 50,
      todayUploads: 12,
      oldestRecord: '2025-01-01',
    };

    const mockCleanupResult = {
      dailyRecordsDeleted: 40,
      ipRecordsDeleted: 20,
    };

    vi.mocked(usageTracker.getUsageStats).mockResolvedValue(mockStats);
    vi.mocked(usageTracker.cleanupOldUsageRecords).mockResolvedValue(mockCleanupResult);

    // Act
    await scheduledCleanupHandler(mockTimer, mockContext);

    // Assert
    expect(usageTracker.cleanupOldUsageRecords).toHaveBeenCalledWith(30);
  });

  it('should handle cleanup errors gracefully and throw', async () => {
    // Arrange
    const mockStats = {
      totalDailyRecords: 100,
      totalIpRecords: 50,
      todayUploads: 5,
      oldestRecord: '2025-01-01',
    };

    const cleanupError = new Error('Database connection failed');

    vi.mocked(usageTracker.getUsageStats).mockResolvedValue(mockStats);
    vi.mocked(usageTracker.cleanupOldUsageRecords).mockRejectedValue(cleanupError);

    // Act & Assert
    await expect(scheduledCleanupHandler(mockTimer, mockContext)).rejects.toThrow(
      'Database connection failed'
    );
    expect(mockContext.error).toHaveBeenCalledWith('❌ Cleanup failed:', cleanupError);
  });

  it('should log stats before and after cleanup', async () => {
    // Arrange
    const mockStatsBefore = {
      totalDailyRecords: 100,
      totalIpRecords: 50,
      todayUploads: 15,
      oldestRecord: '2025-01-01',
    };

    const mockStatsAfter = {
      totalDailyRecords: 60,
      totalIpRecords: 30,
      todayUploads: 15,
      oldestRecord: '2026-01-01',
    };

    const mockCleanupResult = {
      dailyRecordsDeleted: 40,
      ipRecordsDeleted: 20,
    };

    vi.mocked(usageTracker.getUsageStats).mockResolvedValueOnce(mockStatsBefore);
    vi.mocked(usageTracker.getUsageStats).mockResolvedValueOnce(mockStatsAfter);
    vi.mocked(usageTracker.cleanupOldUsageRecords).mockResolvedValue(mockCleanupResult);

    // Act
    await scheduledCleanupHandler(mockTimer, mockContext);

    // Assert
    expect(mockContext.log).toHaveBeenCalledWith('📊 Before cleanup:', mockStatsBefore);
    expect(mockContext.log).toHaveBeenCalledWith('📊 After cleanup:', mockStatsAfter);
  });

  it('should handle zero records deleted', async () => {
    // Arrange
    const mockStats = {
      totalDailyRecords: 100,
      totalIpRecords: 50,
      todayUploads: 20,
      oldestRecord: '2026-01-15',
    };

    const mockCleanupResult = {
      dailyRecordsDeleted: 0,
      ipRecordsDeleted: 0,
    };

    vi.mocked(usageTracker.getUsageStats).mockResolvedValue(mockStats);
    vi.mocked(usageTracker.cleanupOldUsageRecords).mockResolvedValue(mockCleanupResult);

    // Act
    await scheduledCleanupHandler(mockTimer, mockContext);

    // Assert
    expect(mockContext.log).toHaveBeenCalledWith('   - Daily records deleted: 0');
    expect(mockContext.log).toHaveBeenCalledWith('   - IP records deleted: 0');
  });

  it('should handle invalid retention days environment variable', async () => {
    // Arrange
    process.env.USAGE_RETENTION_DAYS = 'invalid';

    const mockStats = {
      totalDailyRecords: 100,
      totalIpRecords: 50,
      todayUploads: 10,
      oldestRecord: '2025-01-01',
    };

    const mockCleanupResult = {
      dailyRecordsDeleted: 40,
      ipRecordsDeleted: 20,
    };

    vi.mocked(usageTracker.getUsageStats).mockResolvedValue(mockStats);
    vi.mocked(usageTracker.cleanupOldUsageRecords).mockResolvedValue(mockCleanupResult);

    // Act
    await scheduledCleanupHandler(mockTimer, mockContext);

    // Assert
    // parseInt('invalid') returns NaN, which should be handled
    expect(usageTracker.cleanupOldUsageRecords).toHaveBeenCalled();
  });
});
