#!/bin/bash
# Entrypoint script for Azure SQL Edge test database
# Starts SQL Server and initializes the schema automatically

# Start SQL Server in the background
/opt/mssql/bin/sqlservr &

# Wait for SQL Server to be ready (max 30 seconds)
echo "Waiting for SQL Server to start..."
for i in {1..30}; do
    /opt/mssql-tools/bin/sqlcmd -S localhost -U sa -P "${MSSQL_SA_PASSWORD}" -Q "SELECT 1" > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        echo "SQL Server is ready!"
        break
    fi
    echo "Waiting... ($i/30)"
    sleep 1
done

# Initialize schema if it doesn't exist
echo "Initializing database schema..."
/opt/mssql-tools/bin/sqlcmd -S localhost -U sa -P "${MSSQL_SA_PASSWORD}" -i /tmp/vvocr-schema.sql

if [ $? -eq 0 ]; then
    echo "✓ Database schema initialized successfully!"
else
    echo "⚠ Schema initialization failed (may already exist)"
fi

# Keep container running
wait
