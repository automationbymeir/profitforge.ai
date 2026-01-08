# Azure AI Foundry Deployment Summary
**Date**: December 31, 2025  
**Environment**: Development  
**Deployment Script**: `setup-aifoundry-infrastructure.sh`

## Deployed Resources

### Resource Group
- **Name**: `dragonfruit-dev-3P-Meir-rg`
- **Location**: East US
- **Tags**: Environment=dev, ManagedBy=third-party, Purpose=ai-foundry

### Service Principal
- **Name**: `sp-dragonfruit-3P-Meir-dev`
- **App ID**: `9f48fda1-ebda-459e-a595-d05660e06152`
- **Role Assignments**:
  - Contributor on `dragonfruit-dev-3P-Meir-rg`
  - Azure AI Developer on AI Hub
  - Cognitive Services User on Document Intelligence
  - Key Vault Secrets User on `dragonfruitdevkv`
  - Storage Blob Data Reader on `dragonfruitdevsa`

### Azure AI Foundry
- **Hub**: `dragonfruit-dev-3P-Meir-aihub`
- **Project**: `dragonfruit-dev-3P-Meir-project`
- **Discovery URL**: `https://eastus.api.azureml.ms/discovery`
- **Portal**: https://ai.azure.com
- **Features**:
  - Model catalog access (OpenAI, Meta, Mistral, Cohere)
  - No TPM quota limits (pay-per-use models)
  - Visual prompt flow designer
  - Built-in evaluation and comparison tools

### Supporting Resources (Auto-Created by AI Hub)
- **Key Vault**: `dragonfrkeyvaulte9dc603b`
- **Storage Account**: `dragonfrstorage593005773`
- **Purpose**: Managed by AI Hub for connections, secrets, and artifacts

### Azure Document Intelligence
- **Name**: `dragonfruit-dev-3P-Meir-docintel`
- **SKU**: S0 (Standard)
- **Endpoint**: `https://eastus.api.cognitive.microsoft.com/`

### Budget Alerts
- **Name**: `3P-Meir-dev-budget`
- **Amount**: $500/month
- **Thresholds**: 80% and 100%

## Key Vault Secrets (dragonfruitdevkv)
All secrets stored with prefix `vvocr-3P-Meir-*`:
1. `sp-client-id`
2. `sp-client-secret`
3. `sp-tenant-id`
4. `document-intelligence-endpoint`
5. `document-intelligence-key`
6. `ai-project-endpoint`
7. `sql-connection-string`

## Database Setup
**Schema**: `vvocr` (isolated from customer data)  
**Setup Script**: `setup-vvocr-database.sh dev`  
**Status**: Pending execution

**Tables**:
- `vvocr.document_processing_results`
- `vvocr.execution_log`
- `vvocr.manual_review_queue`
- `vvocr.cost_tracking`

## Deployment Timeline
1. Resource Group created
2. Service Principal created/reset (new credentials)
3. RBAC permissions granted
4. Document Intelligence deployed (~30 seconds)
5. AI Hub created (~40 seconds, includes Key Vault + Storage)
6. AI Project created (~17 seconds)
7. Budget alerts configured
8. Secrets stored in Key Vault

**Total Deployment Time**: ~2 minutes

## Access Testing
 Service principal authentication verified  
 Resource group access confirmed  
 AI Foundry workspace access confirmed  
   Database setup pending  
   Model deployment pending (developer task)

## Next Steps for Developer (Meir)
1. Receive credentials file: `vvocr-3P-Meir-credentials-dev.env`
2. Access AI Foundry Portal: https://ai.azure.com
3. Deploy models from catalog (GPT-4o, Llama 3.1, etc.)
4. Test model endpoints with sample documents
5. Deploy containerized services to resource group
6. Run end-to-end validation

## Advantages Over Previous Azure OpenAI Deployment
- ✅ **No TPM Quota Limits**: Pay-per-use models scale with demand
- ✅ **Multi-Model Access**: Test multiple providers without new deployments
- ✅ **Built-in Evaluation**: Compare models with native tools
- ✅ **Easier Model Switching**: Change models via portal, no code changes
- ✅ **Prompt Flow Designer**: Visual pipeline builder for complex workflows
- ✅ **Better Cost Control**: See per-model costs, optimize selections

## Cost Estimates
- **Document Intelligence**: ~$1.50 per 1,000 pages
- **AI Models**: 
  - GPT-4o: $2.50/1M input, $10/1M output tokens
  - GPT-3.5-Turbo: $0.50/1M input, $1.50/1M output tokens
  - Llama 3.1: $0.75/1M input, $1.00/1M output tokens
  - Mistral Large: $4/1M input, $12/1M output tokens
- **Storage**: <$1/month for document staging
- **Estimated POC Total**: $50-200/month depending on volume

## Infrastructure Management
- **Current**: Bash script deployment
- **Future**: Terraform module (after POC validation)
- **Cleanup**: Run `cleanup-docintel-infrastructure.sh dev` to remove all resources
- **Revocation**: `az ad sp delete --id 9f48fda1-ebda-459e-a595-d05660e06152`

---
**Last Updated**: December 31, 2025
