#!/bin/bash

# Cleanup test data from blob storage and database
# Usage: ./cleanup.sh [all|blobs|db|pattern]
# Default: Cleans both blobs and database without prompts

STORAGE_ACCOUNT="deveitanpvstorage"
CONTAINER="uploads"
CONNECTION_STRING="${STORAGE_CONNECTION_STRING:-$(cat ../../local.settings.json | grep STORAGE_CONNECTION_STRING | cut -d'"' -f4)}"

ACTION="${1:-all}"

cleanup_blobs() {
    echo "🗑️  Cleaning up blob storage..."
    
    if [ "$1" == "pattern" ]; then
        PATTERN="$2"
        echo "Deleting blobs matching pattern: $PATTERN"
        az storage blob delete-batch \
            --connection-string "$CONNECTION_STRING" \
            --source "$CONTAINER" \
            --pattern "$PATTERN" 2>/dev/null
    else
        echo "Deleting ALL blobs in container: $CONTAINER"
        az storage blob delete-batch \
            --connection-string "$CONNECTION_STRING" \
            --source "$CONTAINER" 2>/dev/null
    fi
    
    echo "✅ Blob storage cleaned"
}

cleanup_db() {
    echo "🗑️  Cleaning up database..."
    
    node -e "
        const sql = require('mssql');
        const config = 'Server=tcp:dev-eitan-vvocr-sql0d3c18e3.database.windows.net,1433;Database=dev-eitan-vvocr-db;User ID=sqladmin;Password=MySecurePassword123!;Encrypt=true;TrustServerCertificate=false;Connection Timeout=30;';
        
        (async () => {
            try {
                const pool = new sql.ConnectionPool(config);
                await pool.connect();
                
                // Get counts first
                const docCountResult = await pool.request().query('SELECT COUNT(*) as count FROM vvocr.document_processing_results');
                const vendorProductsCount = await pool.request().query('SELECT COUNT(*) as count FROM vvocr.vendor_products');
                console.log('Document records to delete:', docCountResult.recordset[0].count);
                console.log('Vendor product records to delete:', vendorProductsCount.recordset[0].count);
                
                // Delete vendor_products first (child table with FK constraint)
                await pool.request().query('DELETE FROM vvocr.vendor_products');
                console.log('✅ Vendor products deleted');
                
                // Delete all document_processing_results records
                await pool.request().query('DELETE FROM vvocr.document_processing_results');
                console.log('✅ Document records deleted');
                
                await pool.close();
            } catch (err) {
                console.log('❌ Database cleanup failed:', err.message);
                process.exit(1);
            }
        })();
    "
}

show_usage() {
    echo "Usage: ./cleanup.sh [option]"
    echo ""
    echo "Options:"
    echo "  all                  - Delete everything (blobs + database)"
    echo "  blobs                - Delete all blobs only"
    echo "  db                   - Delete all database records only"
    echo "  pattern <pattern>    - Delete blobs matching pattern (e.g., 'test-vendor-123/*')"
    echo ""
    echo "Examples:"
    echo "  ./cleanup.sh all"
    echo "  ./cleanup.sh blobs"
    echo "  ./cleanup.sh pattern 'test-vendor-123/*'"
}

case "$ACTION" in
    all)
        echo "🗑️  Cleaning ALL test data (blobs + database)..."
        cleanup_blobs
        cleanup_db
        echo "✅ All test data cleaned"
        ;;
    blobs)
        cleanup_blobs
        ;;
    db)
        cleanup_db
        ;;
    pattern)
        if [ -z "$2" ]; then
            echo "❌ Error: Pattern required"
            echo "Example: ./cleanup.sh pattern 'test-vendor-123/*'"
            exit 1
        fi
        cleanup_blobs pattern "$2"
        ;;
    prompt)
        echo "🧹 Cleanup Test Data"
        echo ""
        echo "What would you like to clean?"
        echo "1) Everything (blobs + database)"
        echo "2) Blobs only"
        echo "3) Database only"
        echo "4) Specific pattern"
        echo "5) Cancel"
        echo ""
        read -p "Choose (1-5): " choice
        
        case "$choice" in
            1)
                read -p "⚠️  Delete EVERYTHING? (yes/no): " confirm
                if [ "$confirm" == "yes" ]; then
                    cleanup_blobs
                    cleanup_db
                fi
                ;;
            2)
                cleanup_blobs
                ;;
            3)
                cleanup_db
                ;;
            4)
                read -p "Enter pattern (e.g., test-vendor-123/*): " pattern
                cleanup_blobs pattern "$pattern"
                ;;
            5)
                echo "Cancelled"
                ;;
            *)
                echo "Invalid choice"
                ;;
        esac
        ;;
    help|--help|-h)
        show_usage
        ;;
    *)
        echo "❌ Invalid option: $ACTION"
        echo ""
        show_usage
        exit 1
        ;;
esac
