#!/bin/bash

# Live monitoring of uploads - refreshes every 15 seconds
# Usage: ./monitor.sh

CONTAINER="${STORAGE_CONTAINER_DOCUMENTS}"
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
    echo "Structure: uploads/<vendorName>/<fileName>.pdf | uploads/<vendorName>/ocr-azure-doc-intelligence.json"
    echo ""
    
    BLOB_COUNT=$(az storage blob list \
        --connection-string "$CONNECTION_STRING" \
        --container-name "$CONTAINER" \
        --query "length(@)" \
        --output tsv 2>/dev/null || echo "0")
    
    if [ "$BLOB_COUNT" -eq "0" ]; then
        echo "📭 No files in blob storage"
    else
        echo "All Files ($BLOB_COUNT total):"
        az storage blob list \
            --connection-string "$CONNECTION_STRING" \
            --container-name "$CONTAINER" \
            --query "[].{Path:name, Size:properties.contentLength, Modified:properties.lastModified}" \
            --output table 2>/dev/null || echo "⚠️  Could not fetch blob storage data"
    fi
    
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
                
                if (result.recordset.length === 0) {
                    console.log('📭 No documents in database');
                } else {
                    console.log('Document Name                                  Status        Uploaded             Cost');
                    console.log('─────────────────────────────────────────────  ───────────   ──────────────────   ────');
                    result.recordset.forEach(row => {
                        const name = row.document_name.padEnd(45).substring(0, 45);
                        const status = row.processing_status.padEnd(12);
                        const uploaded = row.uploaded.padEnd(19);
                        const cost = (row.cost || 'N/A').padStart(4);
                        console.log(\`\${name}  \${status}  \${uploaded}  \${cost}\`);
                    });
                }
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
                if (row.total_products === 0) {
                    console.log('📭 No vendor products exported');
                } else {
                    console.log(\`Total Products: \${row.total_products} | Unique Vendors: \${row.unique_vendors} | Source Documents: \${row.source_documents}\`);
                }
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
