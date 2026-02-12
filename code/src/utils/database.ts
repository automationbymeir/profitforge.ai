import sql from 'mssql';
import { getSqlConnectionString } from './config.js';
import { RETRY_CONFIG } from './constants.js';
import { isTransientError } from './typeGuards.js';

// Singleton connection pool
let globalPool: sql.ConnectionPool | null = null;

/**
 * Get or create a shared connection pool.
 * Uses singleton pattern to reuse connections across function invocations.
 */
export async function getConnectionPool(): Promise<sql.ConnectionPool> {
  // Return existing connected pool
  if (globalPool?.connected) {
    return globalPool;
  }

  // Create pool if needed
  if (!globalPool) {
    const connectionString = getSqlConnectionString();
    globalPool = new sql.ConnectionPool(connectionString);

    globalPool.on('error', (err) => {
      console.error('[DB Pool Error]', err.message);
    });
  }

  // Connect if not already connected
  if (!globalPool.connected) {
    try {
      await globalPool.connect();
    } catch (error) {
      // Reset on failure so next call can retry
      globalPool = null;
      throw error;
    }
  }

  return globalPool;
}

/**
 * Execute a database operation with automatic retry and connection management.
 * Handles transient errors gracefully.
 */
export async function withDatabase<T>(
  operation: (pool: sql.ConnectionPool) => Promise<T>,
  retries: number = RETRY_CONFIG.MAX_RETRIES
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const pool = await getConnectionPool();
      return await operation(pool);
    } catch (error: unknown) {
      lastError = error as Error;

      // Check if error is transient (should retry)
      if (isTransientError(error) && attempt < retries) {
        const delay = Math.min(
          RETRY_CONFIG.BASE_DELAY_MS * Math.pow(2, attempt - 1),
          RETRY_CONFIG.MAX_DELAY_MS
        );
        await new Promise((resolve) => setTimeout(resolve, delay));

        // Reset pool on connection errors
        if (globalPool && !globalPool.connected) {
          try {
            await globalPool.close();
          } catch {
            // Ignore errors when closing disconnected pool
          }
          globalPool = null;
        }

        continue;
      }

      // Non-transient error or out of retries
      throw error;
    }
  }

  throw lastError || new Error('Database operation failed after retries');
}

/**
 * Gracefully close the connection pool (for cleanup/testing)
 */
export async function closeConnectionPool(): Promise<void> {
  if (globalPool) {
    try {
      await globalPool.close();
    } catch (error) {
      console.error('[DB] Error closing pool:', error);
    } finally {
      globalPool = null;
    }
  }
}
