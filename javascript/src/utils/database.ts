import sql from "mssql";

const SQL_CONNECTION_STRING = process.env.SQL_CONNECTION_STRING;

if (!SQL_CONNECTION_STRING) {
  throw new Error("SQL_CONNECTION_STRING environment variable is required");
}

// Singleton connection pool
let globalPool: sql.ConnectionPool | null = null;
let poolPromise: Promise<sql.ConnectionPool> | null = null;

/**
 * Get or create a shared connection pool.
 * Uses singleton pattern to reuse connections across function invocations.
 * Automatically handles connection failures with retry logic.
 */
export async function getConnectionPool(): Promise<sql.ConnectionPool> {
  // If pool is already connected, return it
  if (globalPool?.connected) {
    return globalPool;
  }

  // If connection is in progress, wait for it
  if (poolPromise) {
    return poolPromise;
  }

  // Create new connection pool
  poolPromise = (async () => {
    try {
      // Create pool if it doesn't exist - mssql accepts connection string directly
      if (!globalPool) {
        globalPool = new sql.ConnectionPool(SQL_CONNECTION_STRING!);

        // Handle connection errors
        globalPool.on("error", (err) => {
          console.error("[DB Pool Error]", err.message);
          // Don't destroy pool on error - let retry logic handle it
        });
      }

      // Connect with automatic retry logic
      await globalPool.connect();
      console.log("[DB] Connection pool ready");
      return globalPool;
    } catch (error) {
      console.error("[DB] Failed to create connection pool:", error);
      // Reset pool promise so next attempt can try again
      poolPromise = null;
      globalPool = null;
      throw error;
    }
  })();

  return poolPromise;
}

/**
 * Execute a database operation with automatic retry and connection management.
 * Handles transient errors gracefully.
 */
export async function withDatabase<T>(
  operation: (pool: sql.ConnectionPool) => Promise<T>,
  retries = 3
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const pool = await getConnectionPool();
      return await operation(pool);
    } catch (error: any) {
      lastError = error;

      // Check if error is transient (should retry)
      const isTransient =
        error.code === "ESOCKET" ||
        error.code === "ETIMEDOUT" ||
        error.code === "ECONNRESET" ||
        error.code === "EAI_AGAIN" ||
        error.message?.includes("timeout") ||
        error.message?.includes("connection");

      if (isTransient && attempt < retries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff, max 5s
        console.log(
          `[DB] Transient error on attempt ${attempt}/${retries}, retrying in ${delay}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));

        // Reset pool on connection errors
        if (globalPool && !globalPool.connected) {
          console.log("[DB] Resetting disconnected pool...");
          try {
            await globalPool.close();
          } catch {}
          globalPool = null;
          poolPromise = null;
        }

        continue;
      }

      // Non-transient error or out of retries
      throw error;
    }
  }

  throw lastError || new Error("Database operation failed after retries");
}

/**
 * Gracefully close the connection pool (for cleanup/testing)
 */
export async function closeConnectionPool(): Promise<void> {
  if (globalPool) {
    try {
      await globalPool.close();
      console.log("[DB] Connection pool closed");
    } catch (error) {
      console.error("[DB] Error closing pool:", error);
    } finally {
      globalPool = null;
      poolPromise = null;
    }
  }
}
