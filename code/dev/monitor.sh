#!/bin/bash

# Live monitoring of uploads - refreshes every 15 seconds
# Usage: ./monitor.sh

# Load environment variables from .env file and strip quotes
if [ -f "../.env" ]; then
    set -a
    source ../.env
    set +a
fi

STORAGE_ACCOUNT="devpvstorage"
CONTAINER="uploads"
CONNECTION_STRING="${STORAGE_CONNECTION_STRING}"

echo "🔍 Monitoring Uploads - Press Ctrl+C to stop"
echo "Refreshing every 15 seconds..."
echo ""

while true; do
    clear
    echo "🔍 Monitoring Uploads - Press Ctrl+C to stop | Last update: $(date '+%H:%M:%S')"
    echo ""
    
    echo "📦 BLOB STORAGE (${CONTAINER}):"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Documents:"
    az storage blob list \
        --connection-string "$CONNECTION_STRING" \
        --container-name "$CONTAINER" \
        --query "[?ends_with(name, '.pdf')].{Name:name, Size:properties.contentLength, Modified:properties.lastModified}" \
        --output table 2>/dev/null || echo "⚠️  Could not fetch blob storage data"
    
    echo ""
    echo "OCR Results:"
    az storage blob list \
        --connection-string "$CONNECTION_STRING" \
        --container-name "$CONTAINER" \
        --query "[?ends_with(name, '.json')].{Name:name, Size:properties.contentLength, Modified:properties.lastModified}" \
        --output table 2>/dev/null || echo "⚠️  No OCR results found"
    
    echo ""
    echo "📊 DATABASE (Recent 5 uploads):"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    SQL_CONNECTION_STRING="${SQL_CONNECTION_STRING}" node -e "
        const sql = require('mssql');
        const config = process.env.SQL_CONNECTION_STRING;
        
        (async () => {
            try {
                const pool = new sql.ConnectionPool(config);
                await pool.connect();
                const result = await pool.request().query(\`
                    SELECT TOP 5
                        document_name,
                        processing_status,
                        FORMAT(uploaded_at, 'yyyy-MM-dd HH:mm:ss') as uploaded,
                        ISNULL(CAST((ISNULL(doc_intel_cost_usd, 0) + ISNULL(ai_model_cost_usd, 0)) AS VARCHAR), 'N/A') as cost
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
                console.error('⚠️  Database connection failed:', err.message);
            }
        })();
    " 2>&1
    
    echo ""
    echo "📦 VENDOR PRODUCTS (Total count):"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    SQL_CONNECTION_STRING="${SQL_CONNECTION_STRING}" node -e "
        const sql = require('mssql');
        const config = process.env.SQL_CONNECTION_STRING;
        
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
                console.error('⚠️  Could not fetch vendor products data:', err.message);
            }
        })();
    " 2>&1
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    sleep 15
done
