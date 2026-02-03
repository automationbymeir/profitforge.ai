#!/bin/bash

# Live monitoring of uploads - refreshes every 3 seconds
# Usage: ./monitor.sh

STORAGE_ACCOUNT="deveitanpvstorage"
CONTAINER="uploads"
CONNECTION_STRING="${STORAGE_CONNECTION_STRING:-$(cat ../../local.settings.json | grep STORAGE_CONNECTION_STRING | cut -d'"' -f4)}"

echo "🔍 Monitoring Uploads - Press Ctrl+C to stop"
echo "Refreshing every 15 seconds..."
echo ""

while true; do
    clear
    echo "🔍 Monitoring Uploads - Press Ctrl+C to stop | Last update: $(date '+%H:%M:%S')"
    echo ""
    
    echo "📦 BLOB STORAGE (${CONTAINER}):"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    az storage blob list \
        --connection-string "$CONNECTION_STRING" \
        --container-name "$CONTAINER" \
        --query "[].{Name:name, Size:properties.contentLength, Modified:properties.lastModified}" \
        --output table 2>/dev/null || echo "⚠️  Could not fetch blob storage data"
    
    echo ""
    echo "📊 DATABASE (Recent 5 uploads):"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    node -e "
        const sql = require('mssql');
        const config = 'Server=tcp:dev-eitan-vvocr-sql0d3c18e3.database.windows.net,1433;Database=dev-eitan-vvocr-db;User ID=sqladmin;Password=MySecurePassword123!;Encrypt=true;TrustServerCertificate=false;Connection Timeout=30;';
        
        (async () => {
            try {
                const pool = new sql.ConnectionPool(config);
                await pool.connect();
                const result = await pool.request().query(\`
                    SELECT TOP 5
                        document_name,
                        processing_status,
                        FORMAT(uploaded_at, 'yyyy-MM-dd HH:mm:ss') as uploaded,
                        ISNULL(CAST(total_cost_usd AS VARCHAR), 'N/A') as cost
                    FROM vvocr.document_processing_results
                    ORDER BY uploaded_at DESC
                \`);
                
                console.log('Document Name                                  Status        Uploaded             Cost');
                console.log('─────────────────────────────────────────────  ───────────   ──────────────────   ────');
                result.recordset.forEach(row => {
                    const name = row.document_name.padEnd(45).substring(0, 45);
                    const status = row.processing_status.padEnd(12);
                    const uploaded = row.uploaded.padEnd(19);
                    const cost = (row.cost || 'N/A').padStart(4);
                    console.log(\`\${name}  \${status}  \${uploaded}  \${cost}\`);
                });
                await pool.close();
            } catch (err) {
                console.log('⚠️  Database connection failed');
            }
        })();
    " 2>/dev/null
    
    echo ""
    echo "📦 VENDOR PRODUCTS (Total count):"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    node -e "
        const sql = require('mssql');
        const config = 'Server=tcp:dev-eitan-vvocr-sql0d3c18e3.database.windows.net,1433;Database=dev-eitan-vvocr-db;User ID=sqladmin;Password=MySecurePassword123!;Encrypt=true;TrustServerCertificate=false;Connection Timeout=30;';
        
        (async () => {
            try {
                const pool = new sql.ConnectionPool(config);
                await pool.connect();
                const result = await pool.request().query(\`
                    SELECT 
                        COUNT(*) as total_products,
                        COUNT(DISTINCT vendor_id) as unique_vendors,
                        COUNT(DISTINCT source_document_id) as source_documents
                    FROM vvocr.vendor_products
                \`);
                
                const row = result.recordset[0];
                console.log(\`Total Products: \${row.total_products} | Unique Vendors: \${row.unique_vendors} | Source Documents: \${row.source_documents}\`);
                await pool.close();
            } catch (err) {
                console.log('⚠️  Could not fetch vendor products data');
            }
        })();
    " 2>/dev/null
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    sleep 15
done
