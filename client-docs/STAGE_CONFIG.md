# Stage Configuration Guide

This project supports two deployment stages:

## 🟢 Stage: `dev` (Your Personal Azure Account)

**Use for**: Testing, learning, development before getting client credentials

**What it does**:
- Creates ALL resources in your personal Azure subscription
- Matches client infrastructure design exactly
- Full isolation - your own playground

**Resources created**:
```
profitforge-dev-rg/
├── Document Intelligence API
├── Azure AI Foundry Hub + Project
├── Azure SQL Database (with vvocr schema)
├── Data Lake Gen2 Storage
├── Blob Storage
├── Key Vault
├── Azure Functions
└── Application Insights
```

**Deploy**:
```bash
# Set SQL password
pulumi config set sqlAdminPassword --secret

# Deploy to your personal Azure
sst deploy --stage dev
```

**Estimated cost**: $50-200/month depending on usage

---

## 🔵 Stage: `client` (Client's Azure Resources)

**Use for**: POC deployment once you receive credentials

**What it does**:
- Uses client's EXISTING resources
- Only deploys your Functions code
- Connects to their SQL, Storage, Document Intelligence, AI Foundry

**Resources used** (existing):
```
dragonfruit-dev-3P-Meir-rg/
├── Document Intelligence (existing)
├── Azure AI Foundry Hub + Project (existing)
├── Azure SQL: dfdev-sql-main.vvocr schema (existing)
├── Storage: dragonfruitdevsa (existing)
├── Key Vault (existing)
├── Functions (YOUR CODE deployed here)
└── Application Insights (existing)
```

**Setup**:
```bash
# 1. Load client credentials
source vvocr-3P-Meir-credentials-dev.env

# 2. Authenticate with service principal
az login --service-principal \
  -u "$AZURE_CLIENT_ID" \
  -p "$AZURE_CLIENT_SECRET" \
  --tenant "$AZURE_TENANT_ID"

# 3. Deploy (no new infrastructure, just your code)
sst deploy --stage client
```

**Cost**: Covered by client's $500/month budget

---

## Switching Between Stages

The code is **identical** - only the stage parameter changes:

```bash
# Test on your account
sst deploy --stage dev

# Deploy to client (when ready)
sst deploy --stage client
```

**What changes automatically**:
- Resource group names (`profitforge-dev-rg` vs `dragonfruit-dev-3P-Meir-rg`)
- SQL connection (your DB vs client's `dfdev-sql-main.vvocr`)
- Storage accounts (your storage vs client's `dragonfruitdevsa`)
- AI Foundry (your hub/project vs client's existing)

**What stays the same**:
- All application code
- Database schema (vvocr.*)
- API contracts
- Processing logic

---

## Current Status

✅ SST config is stage-aware  
✅ SQL schema matches client expectations (vvocr.*)  
✅ Azure AI Foundry support added  
⏳ Waiting for client credentials  
⏳ Need to deploy to `dev` stage for testing  

---

## Next Steps

### Now (Without Client Credentials):
1. Deploy to `dev` stage on your personal Azure
2. Test Document Intelligence + AI Foundry locally
3. Process sample catalog files from Dropbox
4. Validate schema, costs, accuracy

### Later (With Client Credentials):
1. Receive credentials file from client
2. Authenticate with service principal
3. Deploy to `client` stage
4. No infrastructure changes needed - just swap config!
