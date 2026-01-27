import { TableClient } from "@azure/data-tables";

let tableClient: TableClient | null = null;

function getTableClient(): TableClient {
  if (!tableClient) {
    tableClient = TableClient.fromConnectionString(
      process.env.STORAGE_CONNECTION_STRING!,
      "DemoUsageTracking"
    );
  }
  return tableClient;
}

export async function initializeUsageTable(): Promise<void> {
  try {
    await getTableClient().createTable();
  } catch (error: any) {
    if (error.statusCode !== 409) throw error; // 409 = already exists
  }
}

export async function checkDailyUploadLimit(): Promise<{
  allowed: boolean;
  current: number;
  limit: number;
}> {
  const today = new Date().toISOString().split("T")[0];
  const MAX_DAILY_UPLOADS = parseInt(process.env.MAX_DAILY_UPLOADS || "0"); // 0 = no limit (client mode)

  if (MAX_DAILY_UPLOADS === 0) {
    return { allowed: true, current: 0, limit: 0 }; // Client mode: no limits
  }

  try {
    const entity = await getTableClient().getEntity("daily", today);
    const currentCount = (entity.uploadCount as number) || 0;

    return {
      allowed: currentCount < MAX_DAILY_UPLOADS,
      current: currentCount,
      limit: MAX_DAILY_UPLOADS,
    };
  } catch (error: any) {
    if (error.statusCode === 404) {
      return { allowed: true, current: 0, limit: MAX_DAILY_UPLOADS };
    }
    // Fail open if Table Storage unavailable
    console.error("Usage check failed, allowing upload:", error);
    return { allowed: true, current: 0, limit: MAX_DAILY_UPLOADS };
  }
}

export async function incrementDailyUploadCount(): Promise<number> {
  if (parseInt(process.env.MAX_DAILY_UPLOADS || "0") === 0) {
    return 0; // Client mode: don't track
  }

  const today = new Date().toISOString().split("T")[0];

  try {
    let currentCount = 0;
    try {
      const entity = await getTableClient().getEntity("daily", today);
      currentCount = (entity.uploadCount as number) || 0;
    } catch (error: any) {
      if (error.statusCode !== 404) throw error;
    }

    const newCount = currentCount + 1;
    await getTableClient().upsertEntity(
      {
        partitionKey: "daily",
        rowKey: today,
        uploadCount: newCount,
        lastUpdated: new Date(),
      },
      "Replace"
    );

    return newCount;
  } catch (error) {
    console.error("Error incrementing count:", error);
    return 0;
  }
}

/**
 * Check IP-based rate limit (hourly)
 * Uses Azure Table Storage with PartitionKey='ip-rate' and RowKey='{ip}-{hour}'
 *
 * @param clientIp - IP address to check
 * @returns allowed status and current count
 */
export async function checkIpRateLimit(clientIp: string): Promise<{
  allowed: boolean;
  current: number;
  limit: number;
  resetTime: string;
}> {
  const MAX_UPLOADS_PER_IP_PER_HOUR = parseInt(process.env.MAX_UPLOADS_PER_IP_PER_HOUR || "0");

  // 0 = no IP rate limit (client mode)
  if (MAX_UPLOADS_PER_IP_PER_HOUR === 0) {
    return { allowed: true, current: 0, limit: 0, resetTime: "" };
  }

  // Create hourly window: "2026-01-20-14" for 2PM
  const now = new Date();
  const hourKey = `${now.toISOString().split("T")[0]}-${now.getUTCHours().toString().padStart(2, "0")}`;
  const rowKey = `${clientIp}-${hourKey}`;
  const nextHour = new Date(now.getTime() + 3600000);
  const resetTime = `${nextHour.getUTCHours().toString().padStart(2, "0")}:00 UTC`;

  try {
    const entity = await getTableClient().getEntity("ip-rate", rowKey);
    const currentCount = (entity.uploadCount as number) || 0;

    return {
      allowed: currentCount < MAX_UPLOADS_PER_IP_PER_HOUR,
      current: currentCount,
      limit: MAX_UPLOADS_PER_IP_PER_HOUR,
      resetTime,
    };
  } catch (error: any) {
    if (error.statusCode === 404) {
      // First upload this hour from this IP
      return {
        allowed: true,
        current: 0,
        limit: MAX_UPLOADS_PER_IP_PER_HOUR,
        resetTime,
      };
    }

    // Fail open if Table Storage unavailable
    console.error("IP rate check failed, allowing upload:", error);
    return {
      allowed: true,
      current: 0,
      limit: MAX_UPLOADS_PER_IP_PER_HOUR,
      resetTime,
    };
  }
}

/**
 * Increment IP-based upload counter
 */
export async function incrementIpUploadCount(clientIp: string): Promise<number> {
  if (parseInt(process.env.MAX_UPLOADS_PER_IP_PER_HOUR || "0") === 0) {
    return 0; // Client mode: don't track
  }

  const now = new Date();
  const hourKey = `${now.toISOString().split("T")[0]}-${now.getUTCHours().toString().padStart(2, "0")}`;
  const rowKey = `${clientIp}-${hourKey}`;

  try {
    let currentCount = 0;
    try {
      const entity = await getTableClient().getEntity("ip-rate", rowKey);
      currentCount = (entity.uploadCount as number) || 0;
    } catch (error: any) {
      if (error.statusCode !== 404) throw error;
    }

    const newCount = currentCount + 1;
    await getTableClient().upsertEntity(
      {
        partitionKey: "ip-rate",
        rowKey,
        uploadCount: newCount,
        clientIp,
        hour: hourKey,
        lastUpdated: new Date(),
      },
      "Replace"
    );

    return newCount;
  } catch (error) {
    console.error("Error incrementing IP count:", error);
    return 0;
  }
}

/**
 * Clean up old usage tracking records
 * @param daysToKeep - Number of days of history to retain (default: 30)
 * @returns Number of records deleted
 */
export async function cleanupOldUsageRecords(daysToKeep: number = 30): Promise<{
  dailyRecordsDeleted: number;
  ipRecordsDeleted: number;
}> {
  const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
  const cutoffDateStr = cutoffDate.toISOString().split("T")[0];

  let dailyDeleted = 0;
  let ipDeleted = 0;

  try {
    const client = getTableClient();

    // Clean up daily records
    const dailyEntities = client.listEntities({
      queryOptions: {
        filter: `PartitionKey eq 'daily' and RowKey lt '${cutoffDateStr}'`,
      },
    });

    for await (const entity of dailyEntities) {
      await client.deleteEntity("daily", entity.rowKey as string);
      dailyDeleted++;
    }

    // Clean up IP rate limit records (older than cutoff date)
    // RowKey format: {ip}-{YYYY-MM-DD}-{HH}
    const ipEntities = client.listEntities({
      queryOptions: {
        filter: `PartitionKey eq 'ip-rate'`,
      },
    });

    for await (const entity of ipEntities) {
      const rowKey = entity.rowKey as string;
      // Extract date from rowKey by removing last 3 chars (-HH) and taking last 10 chars (YYYY-MM-DD)
      const withoutHour = rowKey.slice(0, -3); // Remove -HH
      const recordDate = withoutHour.slice(-10); // Get last 10 chars (YYYY-MM-DD)

      if (recordDate < cutoffDateStr) {
        await client.deleteEntity("ip-rate", rowKey);
        ipDeleted++;
      }
    }

    console.log(`Cleanup complete: ${dailyDeleted} daily records, ${ipDeleted} IP records deleted`);
    return { dailyRecordsDeleted: dailyDeleted, ipRecordsDeleted: ipDeleted };
  } catch (error) {
    console.error("Error during cleanup:", error);
    throw error;
  }
}

/**
 * Get usage statistics for monitoring
 */
export async function getUsageStats(): Promise<{
  totalDailyRecords: number;
  totalIpRecords: number;
  todayUploads: number;
  oldestRecord: string;
}> {
  try {
    const client = getTableClient();
    const today = new Date().toISOString().split("T")[0];

    let dailyCount = 0;
    let ipCount = 0;
    let oldestDate = today;
    let todayUploads = 0;

    // Count daily records
    const dailyEntities = client.listEntities({
      queryOptions: { filter: `PartitionKey eq 'daily'` },
    });

    for await (const entity of dailyEntities) {
      dailyCount++;
      const date = entity.rowKey as string;
      if (date < oldestDate) oldestDate = date;
      if (date === today) todayUploads = (entity.uploadCount as number) || 0;
    }

    // Count IP records
    const ipEntities = client.listEntities({
      queryOptions: { filter: `PartitionKey eq 'ip-rate'` },
    });

    for await (const entity of ipEntities) {
      ipCount++;
    }

    return {
      totalDailyRecords: dailyCount,
      totalIpRecords: ipCount,
      todayUploads,
      oldestRecord: oldestDate,
    };
  } catch (error) {
    console.error("Error fetching stats:", error);
    throw error;
  }
}
