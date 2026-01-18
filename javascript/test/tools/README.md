# Testing Tools

Quick reference for testing and monitoring your Azure Functions locally.

## 📁 Files in this folder

- `test-invoice.txt` - Sample invoice for testing uploads
- `test-upload.sh` - Upload files to the function
- `monitor.sh` - Live monitoring of blobs and database
- `cleanup.sh` - Clean up test data
- `query.js` - Quick database queries
- `test-client.html` - Web-based upload client

## 🚀 Quick Start

### 1. Start Functions

```bash
cd /home/eitanick/code/profitforge.ai/javascript
npm start
```

### 2. Monitor in Real-Time

```bash
cd test/tools
./monitor.sh
```

Refreshes every 3 seconds. Press `Ctrl+C` to stop.

### 3. Upload Test Files

```bash
# Go back to test folder
cd ..

# Upload default test-invoice.txt from tools folder
./test-upload.sh tools/test-invoice.txt vendor-acme

# Upload PDF from docs folder
./test-upload.sh docs/sample.pdf vendor-xyz
```

### 4. Query Database

```bash
# Show recent uploads
node query.js

# Custom query
node query.js "SELECT COUNT(*) as total FROM vvocr.document_processing_results"

# Show processing statistics
node query.js "SELECT processing_status, COUNT(*) as count FROM vvocr.document_processing_results GROUP BY processing_status"
```

### 5. Cleanup Test Data

```bash
# Interactive menu
./cleanup.sh

# Delete everything
./cleanup.sh all

# Delete blobs only
./cleanup.sh blobs

# Delete database records only
./cleanup.sh db

# Delete specific vendor's files
./cleanup.sh pattern 'test-vendor-123/*'
```

## 🔍 Monitoring Tools Recommendations

### For Database:

1. **Azure Data Studio** (Recommended) - Free, cross-platform

   ```bash
   # Download from: https://aka.ms/azuredatastudio
   # Or install via snap on Linux:
   sudo snap install azuredatastudio
   ```

2. **VS Code Extension: "SQL Server (mssql)"**

   - Install from VS Code marketplace
   - Connect to: `dev-eitan-vvocr-sql0d3c18e3.database.windows.net`

3. **Our monitoring script** - Simple, terminal-based
   ```bash
   ./monitor.sh
   ```

### For Blob Storage:

1. **Azure Storage Explorer** - Free GUI tool

   - Download: https://azure.microsoft.com/features/storage-explorer/

2. **VS Code Extension: "Azure Storage"**

   - Browse containers directly in VS Code

3. **Azure CLI with watch**
   ```bash
   watch -n 3 'az storage blob list --connection-string "$STORAGE_CONNECTION_STRING" --container-name uploads --output table'
   ```

## 📊 Useful Queries

### Count uploads by vendor

```bash
node query.js "SELECT LEFT(document_path, CHARINDEX('/', document_path) - 1) as vendor, COUNT(*) as count FROM vvocr.document_processing_results GROUP BY LEFT(document_path, CHARINDEX('/', document_path) - 1)"
```

### Show failed uploads

```bash
node query.js "SELECT document_name, error_message, uploaded_at FROM vvocr.document_processing_results WHERE processing_status = 'failed'"
```

### Total cost by day

```bash
node query.js "SELECT CAST(uploaded_at AS DATE) as date, SUM(total_cost_usd) as total_cost FROM vvocr.document_processing_results GROUP BY CAST(uploaded_at AS DATE)"
```

## 🎯 Tips

- **Keep monitor.sh running** in a separate terminal while testing
- **Use test-client.html** to test uploads from a browser (open in browser after starting functions)
- **Clean up regularly** to avoid confusion with old test data
- Set `STORAGE_CONNECTION_STRING` environment variable to avoid connection string lookup in scripts

## 🔧 Troubleshooting

### "Could not fetch database data"

- Check if SQL server firewall allows your IP
- Verify credentials in local.settings.json

### "Could not fetch blob storage data"

- Check STORAGE_CONNECTION_STRING in local.settings.json
- Make sure Azure CLI is logged in: `az login`

### Monitor script not updating

- Press `Ctrl+C` and restart it
- Check if Node.js mssql package is installed: `cd ../.. && npm install`
