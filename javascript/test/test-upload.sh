#!/bin/bash

# Test the upload function locally
# Usage: ./test-upload.sh [file] [vendorId]
# Make sure your functions are running with: npm start

echo "Testing upload handler..."
echo ""

# Get file and vendor from arguments or use defaults
FILE="${1:-tools/test-invoice.txt}"
VENDOR_ID="${2:-test-vendor-123}"

# Check if file exists
if [ ! -f "$FILE" ]; then
    echo "Error: File '$FILE' not found!"
    echo "Usage: ./test-upload.sh [file] [vendorId]"
    echo "Example: ./test-upload.sh tools/test-invoice.txt vendor-acme"
    echo "Example: ./test-upload.sh docs/sample.pdf vendor-xyz"
    exit 1
fi

echo "Uploading: $FILE"
echo "Vendor ID: $VENDOR_ID"
echo ""

# Upload the file
curl -X POST http://localhost:7071/api/upload \
  -F "file=@$FILE" \
  -F "vendorId=$VENDOR_ID" \
  -v

echo ""
echo "Upload test complete!"
