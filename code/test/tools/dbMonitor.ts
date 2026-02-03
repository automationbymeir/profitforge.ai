/**
 * SQL Database Monitoring Script
 *
 * Provides tools to:
 * - View database logs and query performance
 * - Monitor active connections
 * - Identify slow queries
 * - Track query execution times
 * - Analyze database bottlenecks
 *
 * Usage:
 *   npm run db:monitor          # Real-time monitoring
 *   npm run db:logs             # View recent queries
 *   npm run db:connections      # Show active connections
 *   npm run db:slow-queries     # Find slow queries
 */

import { readFileSync } from 'fs';
import sql from 'mssql';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load connection string
let DB_CONNECTION_STRING = '';
try {
  const localSettings = JSON.parse(
    readFileSync(join(__dirname, '../../local.settings.json'), 'utf-8')
  );
  DB_CONNECTION_STRING = localSettings.Values.SQL_CONNECTION_STRING || '';
} catch (err) {
  console.error('Failed to load local.settings.json:', err);
  process.exit(1);
}

// Shared connection pool (reused across queries to prevent connection leak)
let sharedPool: sql.ConnectionPool | null = null;

async function getPool(): Promise<sql.ConnectionPool> {
  if (!sharedPool) {
    sharedPool = new sql.ConnectionPool(DB_CONNECTION_STRING);
    await sharedPool.connect();
  }
  return sharedPool;
}

async function closePool() {
  if (sharedPool) {
    await sharedPool.close();
    sharedPool = null;
  }
}

interface QueryStat {
  query_text: string;
  execution_count: number;
  total_elapsed_time_ms: number;
  avg_elapsed_time_ms: number;
  last_execution_time: Date;
  total_worker_time_ms: number;
  total_logical_reads: number;
}

interface ConnectionInfo {
  session_id: number;
  login_name: string;
  host_name: string;
  program_name: string;
  status: string;
  last_request_start_time: Date;
  open_transaction_count: number;
}

/**
 * Get active database connections
 */
async function getActiveConnections(): Promise<ConnectionInfo[]> {
  const pool = await getPool();

  const result = await pool.request().query(`
    SELECT 
      session_id,
      login_name,
      host_name,
      program_name,
      status,
      last_request_start_time,
      open_transaction_count,
      DATEDIFF(SECOND, last_request_start_time, GETDATE()) as duration_seconds
    FROM sys.dm_exec_sessions
    WHERE is_user_process = 1
      AND database_id = DB_ID()
    ORDER BY last_request_start_time DESC
  `);

  return result.recordset as ConnectionInfo[];
}

/**
 * Get query performance statistics
 */
async function getQueryStats(topN: number = 20): Promise<QueryStat[]> {
  const pool = await getPool();

  const result = await pool.request().input('topN', sql.Int, topN).query(`
    SELECT TOP (@topN)
      SUBSTRING(
        qt.text,
        (qs.statement_start_offset/2) + 1,
        ((CASE qs.statement_end_offset
          WHEN -1 THEN DATALENGTH(qt.text)
          ELSE qs.statement_end_offset
        END - qs.statement_start_offset)/2) + 1
      ) AS query_text,
      qs.execution_count,
      qs.total_elapsed_time / 1000 as total_elapsed_time_ms,
      (qs.total_elapsed_time / qs.execution_count) / 1000 as avg_elapsed_time_ms,
      qs.last_execution_time,
      qs.total_worker_time / 1000 as total_worker_time_ms,
      qs.total_logical_reads
    FROM sys.dm_exec_query_stats qs
    CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) qt
    WHERE qt.text LIKE '%vvocr.document_processing_results%'
       OR qt.text LIKE '%vvocr.vendor_products%'
    ORDER BY qs.total_elapsed_time DESC
  `);

  return result.recordset as QueryStat[];
}

/**
 * Get slow running queries (currently executing)
 */
async function getSlowRunningQueries(): Promise<any[]> {
  const pool = await getPool();

  const result = await pool.request().query(`
    SELECT 
      r.session_id,
      r.status,
      r.command,
      r.blocking_session_id,
      r.wait_type,
      r.wait_time,
      r.total_elapsed_time / 1000 as elapsed_time_ms,
      SUBSTRING(
        qt.text,
        (r.statement_start_offset/2) + 1,
        ((CASE r.statement_end_offset
          WHEN -1 THEN DATALENGTH(qt.text)
          ELSE r.statement_end_offset
        END - r.statement_start_offset)/2) + 1
      ) AS query_text,
      s.login_name,
      s.host_name,
      s.program_name
    FROM sys.dm_exec_requests r
    CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) qt
    INNER JOIN sys.dm_exec_sessions s ON r.session_id = s.session_id
    WHERE r.database_id = DB_ID()
      AND s.is_user_process = 1
      AND r.total_elapsed_time > 5000 -- Queries running longer than 5 seconds
    ORDER BY r.total_elapsed_time DESC
  `);

  return result.recordset;
}

/**
 * Get database wait statistics (bottlenecks)
 */
async function getWaitStats(): Promise<any[]> {
  const pool = await getPool();

  const result = await pool.request().query(`
    SELECT TOP 10
      wait_type,
      waiting_tasks_count,
      wait_time_ms,
      max_wait_time_ms,
      signal_wait_time_ms,
      CASE 
        WHEN waiting_tasks_count > 0 THEN wait_time_ms / waiting_tasks_count
        ELSE 0
      END as avg_wait_time_ms
    FROM sys.dm_os_wait_stats
    WHERE wait_type NOT LIKE '%SLEEP%'
      AND wait_type NOT LIKE '%IDLE%'
      AND wait_type NOT LIKE '%QUEUE%'
      AND waiting_tasks_count > 0
    ORDER BY wait_time_ms DESC
  `);

  return result.recordset;
}

/**
 * Get table size and row counts
 */
async function getTableStats(): Promise<any[]> {
  const pool = await getPool();

  const result = await pool.request().query(`
    SELECT 
      t.name AS table_name,
      s.name AS schema_name,
      p.rows AS row_count,
      CAST(ROUND((SUM(a.total_pages) * 8) / 1024.00, 2) AS NUMERIC(36, 2)) AS total_space_mb,
      CAST(ROUND((SUM(a.used_pages) * 8) / 1024.00, 2) AS NUMERIC(36, 2)) AS used_space_mb
    FROM sys.tables t
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.indexes i ON t.object_id = i.object_id
    INNER JOIN sys.partitions p ON i.object_id = p.object_id AND i.index_id = p.index_id
    INNER JOIN sys.allocation_units a ON p.partition_id = a.container_id
    WHERE s.name = 'vvocr'
    GROUP BY t.name, s.name, p.rows
    ORDER BY used_space_mb DESC
  `);

  return result.recordset;
}

/**
 * Monitor database in real-time
 */
async function monitorRealTime(intervalSeconds: number = 5) {
  console.log('🔍 Starting real-time database monitoring...\n');
  console.log(`Refresh interval: ${intervalSeconds} seconds`);
  console.log('Press Ctrl+C to stop\n');

  const monitor = async () => {
    console.clear();
    console.log('='.repeat(80));
    console.log(`📊 Database Monitor - ${new Date().toLocaleString()}`);
    console.log('='.repeat(80));

    try {
      // Active connections
      const connections = await getActiveConnections();
      console.log(`\n🔌 Active Connections: ${connections.length}`);
      connections.slice(0, 5).forEach((conn) => {
        console.log(
          `  Session ${conn.session_id}: ${conn.login_name}@${conn.host_name} - ${conn.status} - ${conn.program_name}`
        );
      });

      // Slow running queries
      const slowQueries = await getSlowRunningQueries();
      if (slowQueries.length > 0) {
        console.log(`\n⚠️  Slow Running Queries: ${slowQueries.length}`);
        slowQueries.forEach((query) => {
          console.log(`  Session ${query.session_id}: ${query.elapsed_time_ms}ms`);
          console.log(`    Query: ${query.query_text.substring(0, 100)}...`);
          console.log(`    Wait: ${query.wait_type} (${query.wait_time}ms)`);
        });
      }

      // Top wait types
      const waits = await getWaitStats();
      console.log(`\n⏱️  Top Wait Types:`);
      waits.slice(0, 5).forEach((wait) => {
        console.log(
          `  ${wait.wait_type}: ${wait.wait_time_ms}ms total, ${wait.avg_wait_time_ms}ms avg (${wait.waiting_tasks_count} tasks)`
        );
      });

      // Table stats
      const tables = await getTableStats();
      console.log(`\n📁 Table Statistics:`);
      tables.forEach((table) => {
        console.log(
          `  ${table.schema_name}.${table.table_name}: ${table.row_count} rows, ${table.used_space_mb} MB`
        );
      });
    } catch (error: any) {
      console.error(`\n❌ Monitoring error: ${error.message}`);
    }

    console.log('\n' + '='.repeat(80));
  };

  // Initial run
  await monitor();

  // Schedule periodic updates
  setInterval(monitor, intervalSeconds * 1000);
}

/**
 * Show query logs (cached query stats)
 */
async function showQueryLogs() {
  console.log('📋 Query Performance Statistics\n');

  const stats = await getQueryStats(50);

  console.log(`Found ${stats.length} queries\n`);

  stats.forEach((stat, i) => {
    console.log(
      `${i + 1}. Executions: ${stat.execution_count}, Avg: ${stat.avg_elapsed_time_ms}ms, Total: ${stat.total_elapsed_time_ms}ms`
    );
    console.log(`   Last run: ${stat.last_execution_time}`);
    console.log(`   Query: ${stat.query_text.substring(0, 200).replace(/\s+/g, ' ')}...`);
    console.log();
  });
}

/**
 * Show connection summary
 */
async function showConnections() {
  console.log('🔌 Active Database Connections\n');

  const connections = await getActiveConnections();

  console.log(`Total connections: ${connections.length}\n`);

  connections.forEach((conn) => {
    console.log(`Session ${conn.session_id}:`);
    console.log(`  User: ${conn.login_name}`);
    console.log(`  Host: ${conn.host_name}`);
    console.log(`  Program: ${conn.program_name}`);
    console.log(`  Status: ${conn.status}`);
    console.log(`  Last request: ${conn.last_request_start_time}`);
    console.log(`  Open transactions: ${conn.open_transaction_count}`);
    console.log();
  });
}

/**
 * Show slow queries report
 */
async function showSlowQueries() {
  console.log('🐌 Slow Query Report\n');

  const stats = await getQueryStats(20);
  const slowQueries = stats.filter((s) => s.avg_elapsed_time_ms > 1000); // Slower than 1 second

  if (slowQueries.length === 0) {
    console.log('✅ No slow queries found (all queries < 1 second average)');
    return;
  }

  console.log(`Found ${slowQueries.length} slow queries:\n`);

  slowQueries.forEach((stat, i) => {
    console.log(`${i + 1}. ⚠️  Average: ${stat.avg_elapsed_time_ms}ms`);
    console.log(`   Executions: ${stat.execution_count}`);
    console.log(`   Total time: ${stat.total_elapsed_time_ms}ms`);
    console.log(`   Logical reads: ${stat.total_logical_reads}`);
    console.log(`   Query: ${stat.query_text.substring(0, 300).replace(/\s+/g, ' ')}...`);
    console.log();
  });
}

// CLI interface
const command = process.argv[2] || 'monitor';

// Cleanup on exit
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Shutting down...');
  await closePool();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n\n🛑 Shutting down...');
  await closePool();
  process.exit(0);
});

(async () => {
  try {
    switch (command) {
      case 'monitor':
        await monitorRealTime(5);
        break;
      case 'logs':
        await showQueryLogs();
        await closePool();
        break;
      case 'connections':
        await showConnections();
        await closePool();
        break;
      case 'slow':
      case 'slow-queries':
        await showSlowQueries();
        await closePool();
        break;
      default:
        console.log('Usage: npm run db:monitor [command]');
        console.log('\nCommands:');
        console.log('  monitor       - Real-time monitoring (default)');
        console.log('  logs          - View query performance logs');
        console.log('  connections   - Show active connections');
        console.log('  slow-queries  - Find slow queries');
        await closePool();
        break;
    }
  } catch (error: any) {
    console.error('Error:', error.message);
    await closePool();
    process.exit(1);
  }
})();
