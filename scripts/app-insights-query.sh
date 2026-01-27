#!/bin/bash
# Application Insights Query Helper
# Usage: ./scripts/app-insights-query.sh [query-type]

set -e

# Get Application Insights resource name from Pulumi
export PULUMI_CONFIG_PASSPHRASE=""
APP_INSIGHTS_NAME=$(pulumi stack output appInsightsName 2>/dev/null)
RESOURCE_GROUP="dragonfruit-dev-3P-Meir-rg"

if [ -z "$APP_INSIGHTS_NAME" ]; then
  echo "Error: Could not get Application Insights name from Pulumi stack"
  exit 1
fi

# Get App Insights App ID
APP_ID=$(az monitor app-insights component show \
  --app "$APP_INSIGHTS_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query "appId" -o tsv)

echo "📊 Querying Application Insights: $APP_INSIGHTS_NAME"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

QUERY_TYPE=${1:-recent-requests}

case $QUERY_TYPE in
  recent-requests)
    echo "📍 Last 20 HTTP Requests:"
    az monitor app-insights query \
      --app "$APP_ID" \
      --analytics-query "requests 
        | where timestamp > ago(24h) 
        | project timestamp, name, url, resultCode, duration, success 
        | order by timestamp desc 
        | take 20" \
      --output table
    ;;

  errors)
    echo "❌ Recent Errors (Last 24h):"
    az monitor app-insights query \
      --app "$APP_ID" \
      --analytics-query "exceptions 
        | where timestamp > ago(24h) 
        | project timestamp, type, outerMessage, method, operation_Name 
        | order by timestamp desc 
        | take 20" \
      --output table
    ;;

  performance)
    echo "⚡ Function Performance (Last 24h):"
    az monitor app-insights query \
      --app "$APP_ID" \
      --analytics-query "requests 
        | where timestamp > ago(24h) 
        | summarize 
            Count=count(), 
            AvgDuration=avg(duration), 
            P95Duration=percentile(duration, 95),
            FailureRate=100.0*countif(success == false)/count()
          by name 
        | order by Count desc" \
      --output table
    ;;

  dependencies)
    echo "🔗 External Dependencies (SQL, AI APIs, Storage):"
    az monitor app-insights query \
      --app "$APP_ID" \
      --analytics-query "dependencies 
        | where timestamp > ago(24h) 
        | summarize Count=count(), AvgDuration=avg(duration) by type, name 
        | order by Count desc" \
      --output table
    ;;

  traces)
    echo "📝 Recent Traces/Logs (Last 50):"
    az monitor app-insights query \
      --app "$APP_ID" \
      --analytics-query "traces 
        | where timestamp > ago(1h) 
        | project timestamp, severityLevel, message 
        | order by timestamp desc 
        | take 50" \
      --output table
    ;;

  live)
    echo "🔴 Opening Live Metrics Stream..."
    echo "Go to: https://portal.azure.com/#@/resource/subscriptions/$(az account show --query id -o tsv)/resourceGroups/$RESOURCE_GROUP/providers/Microsoft.Insights/components/$APP_INSIGHTS_NAME/overview"
    ;;

  *)
    echo "Usage: $0 [query-type]"
    echo ""
    echo "Available query types:"
    echo "  recent-requests  - Last 20 HTTP requests (default)"
    echo "  errors          - Recent exceptions and errors"
    echo "  performance     - Function execution performance metrics"
    echo "  dependencies    - SQL, AI API, Storage call stats"
    echo "  traces          - Application logs and traces"
    echo "  live            - Open live metrics in browser"
    echo ""
    echo "Example: $0 errors"
    ;;
esac
