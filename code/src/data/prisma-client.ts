/**
 * Prisma Client Singleton
 * 
 * Provides a singleton PrismaClient instance for Azure Functions.
 * Reuses the same client across function invocations to maintain
 * connection pooling and optimize performance in serverless environments.
 * 
 * Features:
 * - Singleton pattern for connection reuse
 * - Automatic retry for transient errors
 * - Logging for debugging
 * - Azure SQL Serverless compatibility
 * 
 * @module data/prisma-client
 */

import { PrismaClient } from '@prisma/client';
import { RETRY_CONFIG } from '../utils/constants.js';
import { isTransientError } from '../utils/typeGuards.js';

// Global singleton instance
let globalPrisma: PrismaClient | null = null;

/**
 * Get or create the Prisma Client singleton.
 * Reuses the same client instance across Azure Function invocations.
 * 
 * Connection pooling is handled internally by Prisma's SQL Server connector.
 * 
 * @returns PrismaClient singleton instance
 */
export function getPrismaClient(): PrismaClient {
  if (globalPrisma) {
    return globalPrisma;
  }

  // Create new Prisma Client with logging and error handling
  globalPrisma = new PrismaClient({
    log: [
      { level: 'warn', emit: 'event' },
      { level: 'error', emit: 'event' },
    ],
    // Connection pool settings for Azure SQL Serverless
    // Prisma manages the pool internally via tedious driver
  });

  // Log warnings
  globalPrisma.$on('warn', (e) => {
    console.warn('[Prisma Warning]', e.message);
  });

  // Log errors
  globalPrisma.$on('error', (e) => {
    console.error('[Prisma Error]', e.message);
  });

  return globalPrisma;
}

/**
 * Execute a Prisma operation with automatic retry for transient errors.
 * Handles Azure SQL Serverless auto-pause reconnection and network issues.
 * 
 * @param operation - Async function that performs Prisma operations
 * @param retries - Number of retry attempts (default: 3)
 * @returns Result from the operation
 * @throws Error if all retries fail or non-transient error occurs
 * 
 * @example
 * ```typescript
 * const document = await withPrismaRetry(async (prisma) => {
 *   return await prisma.document_processing_results.findUnique({
 *     where: { result_id: id }
 *   });
 * });
 * ```
 */
export async function withPrismaRetry<T>(
  operation: (prisma: PrismaClient) => Promise<T>,
  retries: number = RETRY_CONFIG.MAX_RETRIES
): Promise<T> {
  const prisma = getPrismaClient();
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await operation(prisma);
    } catch (error) {
      lastError = error as Error;

      // Check if error is transient and we have retries left
      if (isTransientError(error) && attempt < retries) {
        const delay = RETRY_CONFIG.INITIAL_DELAY_MS * Math.pow(2, attempt - 1);
        console.warn(
          `[Prisma] Transient error on attempt ${attempt}/${retries}. Retrying in ${delay}ms...`,
          lastError.message
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      // Non-transient error or no retries left
      console.error(
        `[Prisma] Operation failed after ${attempt} attempt(s):`,
        lastError.message
      );
      throw lastError;
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError || new Error('Prisma operation failed');
}

/**
 * Disconnect the Prisma Client.
 * Useful for cleanup in tests or shutdown hooks.
 * 
 * Note: Azure Functions typically don't need explicit disconnect
 * as the platform manages process lifecycle.
 */
export async function disconnectPrisma(): Promise<void> {
  if (globalPrisma) {
    await globalPrisma.$disconnect();
    globalPrisma = null;
  }
}

/**
 * Check if Prisma Client is connected.
 * Useful for health checks and diagnostics.
 * 
 * @returns true if client exists and can execute queries
 */
export async function isPrismaConnected(): Promise<boolean> {
  if (!globalPrisma) {
    return false;
  }

  try {
    // Try a simple query to check connection
    await globalPrisma.$queryRaw`SELECT 1 as connected`;
    return true;
  } catch {
    return false;
  }
}
