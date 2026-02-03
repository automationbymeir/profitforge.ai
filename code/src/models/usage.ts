/**
 * Usage Tracking Models
 *
 * Types for rate limiting and usage statistics.
 */

/**
 * Usage statistics
 */
export interface UsageStats {
  /** Total daily uploads */
  dailyUploads: number;

  /** Maximum daily uploads allowed */
  maxDailyUploads: number;

  /** Uploads remaining today */
  uploadsRemaining: number;

  /** Daily usage records count */
  dailyRecords: number;

  /** IP usage records count */
  ipRecords: number;

  /** Reset time (UTC) */
  resetTime: string;
}

/**
 * Rate limit check result
 */
export interface RateLimitCheck {
  /** Whether request is allowed */
  allowed: boolean;

  /** Current usage count */
  current: number;

  /** Maximum allowed */
  limit: number;

  /** Reset time */
  resetTime?: string;

  /** Reason if not allowed */
  reason?: string;
}

/**
 * Cleanup result
 */
export interface CleanupResult {
  /** Number of daily records deleted */
  dailyRecordsDeleted: number;

  /** Number of IP records deleted */
  ipRecordsDeleted: number;

  /** Days retained */
  daysRetained?: number;
}
