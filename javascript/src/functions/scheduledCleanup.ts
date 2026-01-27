import { app, InvocationContext, Timer } from "@azure/functions";
import { cleanupOldUsageRecords, getUsageStats } from "../utils/usageTracker.js";

/**
 * Scheduled cleanup function
 * Runs daily at 2 AM UTC to clean up old usage tracking records
 *
 * Cron format: {second} {minute} {hour} {day} {month} {day-of-week}
 * "0 0 2 * * *" = Every day at 2:00 AM UTC
 *
 * Only runs in demo mode (when MAX_DAILY_UPLOADS > 0)
 */
export async function scheduledCleanupHandler(
  timer: Timer,
  context: InvocationContext
): Promise<void> {
  context.log("🧹 Starting scheduled cleanup...");

  try {
    // Get stats before cleanup
    const statsBefore = await getUsageStats();
    context.log(`📊 Before cleanup:`, statsBefore);

    // Clean up records older than 30 days
    const daysToKeep = parseInt(process.env.USAGE_RETENTION_DAYS || "30");
    const result = await cleanupOldUsageRecords(daysToKeep);

    context.log(`✅ Cleanup complete:`);
    context.log(`   - Daily records deleted: ${result.dailyRecordsDeleted}`);
    context.log(`   - IP records deleted: ${result.ipRecordsDeleted}`);
    context.log(`   - Retention policy: ${daysToKeep} days`);

    // Get stats after cleanup
    const statsAfter = await getUsageStats();
    context.log(`📊 After cleanup:`, statsAfter);
  } catch (error) {
    context.error("❌ Cleanup failed:", error);
    throw error;
  }
}

// Register timer trigger
// Runs every day at 2:00 AM UTC
app.timer("scheduledCleanup", {
  schedule: "0 0 2 * * *", // Cron: every day at 2 AM
  handler: scheduledCleanupHandler,
});
