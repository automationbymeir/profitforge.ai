import { OpenAI } from 'openai';
import { DocumentRepository } from '../data/repositories/DocumentRepository.js';
import { StorageService } from '../data/storage.js';
import { getStorageConnectionString } from '../utils/config.js';
import {
  DEFAULT_AI_MODEL,
  DEFAULT_AI_PROMPT,
  MODEL_METADATA,
  type ModelMetadata,
} from '../utils/constants.js';

interface TableCell {
  kind: string;
  content?: string;
  rowIndex: number;
  columnIndex: number;
}

interface Table {
  cells: TableCell[];
}

export interface Product {
  name: string;
  sku: string;
  price: number;
  unit?: string;
  description?: string;
}

export interface AIMappingResult {
  documentId: string;
  vendor: string;
  products: Product[];
  productCount: number;
  processingDuration: number;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  cost: number;
  qualityMetrics: {
    completenessScore: number;
    confidenceScore: number;
    productsWithSKU: number;
    productsWithPrice: number;
    productsWithValidPrice: number;
    productsWithName: number;
    productsWithUnit: number;
    productsWithDescription: number;
    emptyFields: number;
  };
}

/**
 * AIService - Business logic for AI-powered product mapping
 *
 * Handles:
 * - OpenAI GPT-4o integration for product extraction
 * - Column mapping analysis
 * - Quality metrics calculation
 * - AI results persisted to database
 * - Database updates
 */
export class AIService {
  private endpoint: string;
  private apiKey: string;
  private openai: OpenAI;
  private documentRepo: DocumentRepository;

  constructor(endpoint: string, apiKey: string, documentRepo: DocumentRepository) {
    this.endpoint = endpoint;
    this.apiKey = apiKey;
    this.documentRepo = documentRepo;
    // Initialize with default model - will be recreated if custom model requested
    this.openai = this.createOpenAIClient(DEFAULT_AI_MODEL);
    // No bronze-layer usage; AI mapping results are stored in DB
  }

  /**
   * Create OpenAI client for specific model deployment
   */
  private createOpenAIClient(model: string): OpenAI {
    return new OpenAI({
      apiKey: this.apiKey,
      baseURL: `${this.endpoint}/openai/deployments/${model}`,
      defaultQuery: { 'api-version': '2024-08-01-preview' },
      defaultHeaders: { 'api-key': this.apiKey },
    });
  }

  /**
   * List available Azure OpenAI deployments with metadata
   *
   * Note: Azure OpenAI doesn't expose a public API to list deployments from the inference endpoint.
   * This method tests each known model by attempting a lightweight operation and returns those that succeed.
   * For true dynamic discovery, Azure Resource Manager API access would be required.
   */
  async listAvailableModels(): Promise<
    Array<ModelMetadata & { deployment: string; status: string }>
  > {
    const availableModels: Array<ModelMetadata & { deployment: string; status: string }> = [];

    // Get list of models to test from metadata
    const modelsToTest = Object.keys(MODEL_METADATA);

    // Test each model by attempting to create a client
    for (const modelName of modelsToTest) {
      try {
        // Try to create a client for this deployment
        const testClient = this.createOpenAIClient(modelName);

        // Attempt a minimal API call to verify deployment exists
        // Use models.list or a lightweight endpoint
        await fetch(
          `${this.endpoint}/openai/deployments/${modelName}/models?api-version=2024-08-01-preview`,
          {
            method: 'GET',
            headers: {
              'api-key': this.apiKey,
            },
            signal: AbortSignal.timeout(2000), // 2 second timeout
          }
        ).then(async (response) => {
          if (response.ok || response.status === 404) {
            // 404 means the deployment endpoint exists but no models list (expected)
            // Any other error means deployment doesn't exist
            const metadata = MODEL_METADATA[modelName];
            availableModels.push({
              ...metadata,
              deployment: modelName,
              status: 'available',
            });
          }
        });
      } catch (error: any) {
        // Model deployment doesn't exist or isn't accessible - skip it
        console.debug(`Model ${modelName} not available:`, error.message);
      }
    }

    // If no models were detected, return all known models as a fallback
    if (availableModels.length === 0) {
      console.warn('No models detected via testing, returning all known models as fallback');
      return modelsToTest.map((modelName) => ({
        ...MODEL_METADATA[modelName],
        deployment: modelName,
        status: 'unknown',
      }));
    }

    return availableModels;
  }

  /**
   * Build column mapping prompt for AI
   */
  private buildColumnMappingPrompt(
    allHeaders: Array<{ tableIdx: number; colIdx: number; header: string }>,
    fullText: string
  ): string {
    return `You are analyzing product catalog tables. Extract products with the following MINIMAL REQUIRED SCHEMA:
- name (product name/description) - REQUIRED
- SKU (item code/product code) - REQUIRED  
- price (MSRP/cost) - REQUIRED
- unit (dimensions/size/packaging) - OPTIONAL
- description (additional details) - OPTIONAL

Here are ALL the column headers found:
${allHeaders.map((h) => `Table ${h.tableIdx}, Column ${h.colIdx}: "${h.header}"`).join('\n')}

These tables have a CONSISTENT structure. Identify the column pattern:
- Which column index is SKU? (look for "SKU", "Item Code", "Item #", etc.)
- Which column index is Product Name? (look for product descriptions, NOT category headers)
- Which column index is Price? (look for "MSRP", "Price", "Cost", "List Price", etc.)
- Which column index is Unit/Dimensions? (look for "Dimensions", "Size", "Unit", "Pack", etc.)
- Which column index is Description? (look for additional product details)

IMPORTANT: 
- Category headers (e.g., "QUILTED HAMMOCKS") are NOT column headers for product names
- The actual product name is in the first data column with descriptive text
- Ignore header-only rows or separator rows

Return JSON:
{
  "vendor": "detected vendor name",
  "columnMapping": {
    "sku": column_index_number or null,
    "name": column_index_number,
    "price": column_index_number or null,
    "unit": column_index_number or null,
    "description": column_index_number or null
  }
}

Context: ${fullText.substring(0, 2000)}`;
  }

  /**
   * Calculate quality metrics for extracted products
   */
  private calculateQualityMetrics(products: Product[]): {
    completenessScore: number;
    confidenceScore: number;
    metrics: {
      productsWithSKU: number;
      productsWithPrice: number;
      productsWithValidPrice: number;
      productsWithName: number;
      productsWithUnit: number;
      productsWithDescription: number;
      emptyFields: number;
    };
  } {
    const metrics = {
      productsWithSKU: 0,
      productsWithPrice: 0,
      productsWithValidPrice: 0,
      productsWithName: 0,
      productsWithUnit: 0,
      productsWithDescription: 0,
      emptyFields: 0,
    };

    products.forEach((p) => {
      if (p.sku && p.sku.trim()) metrics.productsWithSKU++;
      if (p.name && p.name.trim()) metrics.productsWithName++;
      if (p.price !== undefined && p.price !== null) {
        metrics.productsWithPrice++;
        if (p.price > 0 && p.price < 100000) metrics.productsWithValidPrice++;
      }
      if (p.unit && p.unit.trim()) metrics.productsWithUnit++;
      if (p.description && p.description.trim()) metrics.productsWithDescription++;

      // Count empty/missing fields
      if (!p.sku || !p.sku.trim()) metrics.emptyFields++;
      if (!p.name || !p.name.trim()) metrics.emptyFields++;
      if (p.price === undefined || p.price === null || p.price <= 0) metrics.emptyFields++;
    });

    // Completeness score: % of required fields populated (SKU, name, price)
    const requiredFieldCount = products.length * 3; // 3 required fields per product
    const populatedRequiredFields =
      metrics.productsWithSKU + metrics.productsWithName + metrics.productsWithPrice;
    const completenessScore =
      requiredFieldCount > 0 ? (populatedRequiredFields / requiredFieldCount) * 100 : 0;

    // Confidence score: weighted by data quality indicators
    const skuScore = products.length > 0 ? (metrics.productsWithSKU / products.length) * 30 : 0;
    const priceScore =
      products.length > 0 ? (metrics.productsWithValidPrice / products.length) * 40 : 0;
    const nameScore = products.length > 0 ? (metrics.productsWithName / products.length) * 30 : 0;
    const confidenceScore = Math.min(100, skuScore + priceScore + nameScore);

    return {
      completenessScore: Math.round(completenessScore * 100) / 100,
      confidenceScore: Math.round(confidenceScore * 100) / 100,
      metrics,
    };
  }

  /**
   * Extract products from tables using column mapping
   */
  private extractProductsFromTables(
    tables: Table[],
    columnMapping: {
      sku?: number;
      name?: number;
      price?: number;
      unit?: number;
      description?: number;
    }
  ): Product[] {
    const products: Product[] = [];

    for (const table of tables) {
      const contentCells = table.cells.filter((c: TableCell) => c.kind === 'content');
      if (contentCells.length === 0) continue;

      const rowCount = Math.max(...contentCells.map((c: TableCell) => c.rowIndex)) + 1;

      for (let rowIdx = 1; rowIdx < rowCount; rowIdx++) {
        const rowCells = contentCells.filter((c: TableCell) => c.rowIndex === rowIdx);

        const sku = rowCells
          .find((c: TableCell) => c.columnIndex === columnMapping.sku)
          ?.content?.trim();
        const name = rowCells
          .find((c: TableCell) => c.columnIndex === columnMapping.name)
          ?.content?.trim();
        const priceStr = rowCells
          .find((c: TableCell) => c.columnIndex === columnMapping.price)
          ?.content?.trim();
        const unit = rowCells
          .find((c: TableCell) => c.columnIndex === columnMapping.unit)
          ?.content?.trim();
        const description = rowCells
          .find((c: TableCell) => c.columnIndex === columnMapping.description)
          ?.content?.trim();

        // Validate required fields
        if (sku && name) {
          // Parse price - remove currency symbols, commas
          const priceMatch = priceStr?.match(/[\d,]+\.?\d*/);
          const price = priceMatch ? parseFloat(priceMatch[0].replace(/,/g, '')) : 0;

          const product: Product = {
            name,
            sku,
            price,
          };

          if (unit) product.unit = unit;
          if (description) product.description = description;

          products.push(product);
        }
      }
    }

    return products;
  }

  /**
   * Map products from OCR data using AI
   */
  async mapProducts(documentId: string): Promise<AIMappingResult> {
    const startTime = Date.now();

    // Retrieve document metadata from database
    const document = await this.documentRepo.getRunByID(documentId);

    if (!document) {
      const error = new Error('Document not found') as Error & { statusCode: number };
      error.statusCode = 404;
      throw error;
    }

    if (
      document.processing_status !== 'ocr_complete' &&
      document.processing_status !== 'completed'
    ) {
      const error = new Error(
        `Document status is '${document.processing_status}'. Must be 'ocr_complete' to run AI mapping.`
      ) as Error & { statusCode: number };
      error.statusCode = 400;
      throw error;
    }

    // Get requested AI parameters from database (or use defaults)
    const requestedModel = (document.ai_model_requested as string) || DEFAULT_AI_MODEL;
    const requestedPrompt = (document.ai_prompt_requested as string) || null;

    // Create OpenAI client for the requested model
    let openaiClient: OpenAI;
    try {
      openaiClient = this.createOpenAIClient(requestedModel);
    } catch (error) {
      const err = new Error(
        `Failed to initialize AI client for model '${requestedModel}'`
      ) as Error & { statusCode: number };
      err.statusCode = 500;
      throw err;
    }

    // Retrieve OCR data from blob storage
    const storageService = new StorageService(getStorageConnectionString());
    const documentsContainer = process.env.STORAGE_CONTAINER_DOCUMENTS || 'uploads';

    // OCR data is stored at <vendorName>/ocr-azure-doc-intelligence.json
    const ocrBlobPath = `${document.vendor_name}/ocr-azure-doc-intelligence.json`;

    const ocrBlob = await storageService.downloadBlob(documentsContainer, ocrBlobPath);
    if (!ocrBlob) {
      const error = new Error('OCR data not found in storage') as Error & { statusCode: number };
      error.statusCode = 404;
      throw error;
    }

    const ocrData = JSON.parse(ocrBlob.toString('utf-8'));
    const tables = ocrData.ocrResponse?.tables || ocrData.tables || [];

    // Analyze ALL table headers
    const allHeaders: Array<{ tableIdx: number; colIdx: number; header: string }> = [];
    tables.forEach((table: Table, tableIdx: number) => {
      const headerCells = table.cells.filter((c: TableCell) => c.kind === 'columnHeader');
      headerCells.forEach((cell: TableCell) => {
        allHeaders.push({
          tableIdx,
          colIdx: cell.columnIndex,
          header: cell.content || '',
        });
      });
    });

    // Build prompt - use custom if provided, otherwise use default
    let headerMappingPrompt: string;
    if (requestedPrompt) {
      // User provided custom prompt - use it directly
      headerMappingPrompt = requestedPrompt;
    } else {
      // Use default prompt template with header/context substitution
      const headersText = allHeaders
        .map((h) => `Table ${h.tableIdx}, Column ${h.colIdx}: "${h.header}"`)
        .join('\n');
      headerMappingPrompt = DEFAULT_AI_PROMPT.replace('{HEADERS}', headersText).replace(
        '{CONTEXT}',
        ''
      );
    }

    // Call OpenAI for column mapping
    let mappingResponse;
    try {
      mappingResponse = await openaiClient.chat.completions.create({
        model: requestedModel,
        messages: [{ role: 'user', content: headerMappingPrompt }],
        response_format: { type: 'json_object' },
        max_tokens: 500,
        temperature: 0,
      });
    } catch (error: any) {
      // Gracefully handle model deployment errors
      const errorMessage = error?.message || 'Unknown error during AI processing';

      // Update run status to 'failed' in database before throwing
      await this.documentRepo.updateStatus(documentId, 'failed', errorMessage);

      const err = new Error(
        `AI model '${requestedModel}' failed: ${errorMessage}. The deployment may not exist or may be unavailable.`
      ) as Error & { statusCode: number };
      err.statusCode = 503;
      throw err;
    }

    const mappingResult = JSON.parse(mappingResponse.choices[0].message.content || '{}');
    const columnMapping = mappingResult.columnMapping || {};

    // Extract products using column mapping
    const products = this.extractProductsFromTables(tables, columnMapping);

    // Calculate quality metrics
    const { completenessScore, confidenceScore, metrics } = this.calculateQualityMetrics(products);

    // Calculate costs
    const promptTokens = mappingResponse.usage?.prompt_tokens || 0;
    const completionTokens = mappingResponse.usage?.completion_tokens || 0;
    const totalTokens = promptTokens + completionTokens;

    // GPT-4o pricing: $2.50/1M input, $10.00/1M output
    const aiCost = (promptTokens * 0.0025 + completionTokens * 0.01) / 1000;

    const processingDuration = Date.now() - startTime;

    const mappingResultJson = {
      documentId,
      timestamp: new Date().toISOString(),
      vendor: mappingResult.vendor || document.vendor_name || 'Unknown',
      products,
      productCount: products.length,
      columnMapping,
      qualityMetrics: {
        completenessScore,
        confidenceScore,
        ...metrics,
      },
      usage: {
        promptTokens,
        completionTokens,
        totalTokens,
        cost: aiCost,
      },
    };

    // Previously we stored AI mapping artifacts in a bronze-layer container.
    // This project no longer uses a bronze-layer; artifacts are persisted in the database only.

    // Update database with AI mapping results
    await this.documentRepo.updateAiMapping({
      result_id: documentId,
      ai_mapping_result: JSON.stringify(mappingResultJson),
      ai_model_used: requestedModel,
      ai_prompt_used: headerMappingPrompt,
      ai_model_cost_usd: aiCost,
      ai_confidence_score: confidenceScore,
      ai_completeness_score: completenessScore,
      ai_prompt_tokens: promptTokens,
      ai_completion_tokens: completionTokens,
    });

    return {
      documentId,
      vendor: mappingResult.vendor || document.vendor_name,
      products,
      productCount: products.length,
      processingDuration,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens,
      },
      cost: aiCost,
      qualityMetrics: {
        completenessScore,
        confidenceScore,
        ...metrics,
      },
    };
  }
}

/**
 * Create an AIService instance
 *
 * For testing: inject dependencies via constructor
 * For production: use this factory to create with real dependencies
 */
export async function createAIService(): Promise<AIService> {
  const endpoint = process.env.AI_PROJECT_ENDPOINT;
  const apiKey = process.env.AI_PROJECT_KEY;
  if (!endpoint || !apiKey) {
    throw new Error('Missing AI project configuration (AI_PROJECT_ENDPOINT or AI_PROJECT_KEY)');
  }

  const { createDocumentRepository } = await import('../data/repositories/DocumentRepository.js');
  const documentRepo = await createDocumentRepository();

  return new AIService(endpoint, apiKey, documentRepo);
}
