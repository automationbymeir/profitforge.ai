#!/usr/bin/env node

// Quick database query tool
// Usage: node query.js [sql]

import sql from "mssql";

const config =
  "Server=tcp:dev-eitan-vvocr-sql0d3c18e3.database.windows.net,1433;Database=dev-eitan-vvocr-db;User ID=sqladmin;Password=MySecurePassword123!;Encrypt=true;TrustServerCertificate=false;Connection Timeout=30;";

const query =
  process.argv[2] ||
  `
    SELECT TOP 10
        result_id,
        document_name,
        processing_status,
        FORMAT(uploaded_at, 'yyyy-MM-dd HH:mm:ss') as uploaded_at,
        ISNULL(CAST(total_cost_usd AS VARCHAR), 'N/A') as cost_usd
    FROM vvocr.document_processing_results
    ORDER BY uploaded_at DESC
`;

(async () => {
  try {
    const pool = new sql.ConnectionPool(config);
    await pool.connect();

    const result = await pool.request().query(query);

    if (result.recordset.length === 0) {
      console.log("No results found");
    } else {
      console.table(result.recordset);
      console.log(`\nRows: ${result.recordset.length}`);
    }

    await pool.close();
  } catch (err) {
    console.error("❌ Query failed:", err.message);
    process.exit(1);
  }
})();
