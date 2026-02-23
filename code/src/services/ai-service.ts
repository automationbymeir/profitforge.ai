import { OpenAI } from 'openai';
import { DocumentRepository } from '../data/repositories/DocumentRepository.prisma.js';
import { StorageService } from '../data/storage.js';

import {
  calculateJsonResult,
  MappingResultJson,
  mergeSplitTables,
  type Table,
} from '../utils/ai-service-helper.js';
import { getStorageConnectionString } from '../utils/config.js';
import { systemPrompt, userPrompt } from '../utils/default-ai-prompt.js';
import { calculateGrade, GradingResult } from '../utils/grading-helper.js';
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
  private documentRepo: DocumentRepository;
  private storageService: StorageService;
  private defaultModel: string;

  constructor(
    endpoint: string,
    apiKey: string,
    documentRepo: DocumentRepository,
    storageService: StorageService,
    defaultModel: string = 'gpt-4o'
  ) {
    this.endpoint = endpoint;
    this.apiKey = apiKey;
    this.documentRepo = documentRepo;
    this.storageService = storageService;
    this.defaultModel = defaultModel;
  }

  /**
   * Get OpenAI client configured for specific model/deployment
   * @param deploymentName - Name of the Azure OpenAI deployment (must match what's deployed in Azure)
   */
  private getOpenAIClient(deploymentName: string): OpenAI {
    return new OpenAI({
      apiKey: this.apiKey,
      baseURL: `${this.endpoint}/openai/deployments/${deploymentName}`,
      defaultQuery: { 'api-version': '2024-08-01-preview' },
      defaultHeaders: { 'api-key': this.apiKey },
    });
  }

  /**
   * Process tables through AI and aggregate results
   *
   * Core logic shared by mapProducts() and processTablesFromOcrData()
   *
   * @param tables - Merged logical tables to process
   * @param rawTableCount - Number of raw tables before merging
   * @param model - Model/deployment name to use
   * @param customPrompt - Optional custom prompt template
   * @returns Aggregated mapping result with all products and last prompt used
   */
  private async processTables(
    tables: Table[],
    rawTableCount: number,
    model: string,
    customPrompt?: string
  ): Promise<{
    aggregatedResult: MappingResultJson;
    lastPromptUsed: string;
    totalProcessingTime: number;
  }> {
    const mappingResults: MappingResultJson[] = [];
    let lastPromptUsed = '';
    let totalProcessingTime = 0;

    console.log(
      `Processing ${tables.length} logical tables (merged from ${rawTableCount} raw tables)`
    );

    for (let i = 0; i < tables.length; i++) {
      const table = tables[i];
      const tableData = JSON.stringify(table);

      const prompt = customPrompt
        ? customPrompt.includes('{{TABLE_DATA}}')
          ? customPrompt.replace('{{TABLE_DATA}}', tableData)
          : `${customPrompt}\n\nRaw table:\n\`\`\`\n${tableData}\n\`\`\``
        : userPrompt(tableData);

      lastPromptUsed = prompt;
      const startTime = Date.now();

      const openai = this.getOpenAIClient(model);

      const aiResponse = await openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 4096,
        temperature: 0,
      });
      const processingTime = Date.now() - startTime;

      const mappingResult = calculateJsonResult(aiResponse, [table]);
      mappingResult.processingTime = processingTime;
      totalProcessingTime += processingTime;

      mappingResults.push(mappingResult);

      if (tables.length > 1) {
        console.log(
          `  ✓ Table ${i + 1}/${tables.length}: ${mappingResult.productCount} products in ${processingTime}ms`
        );
      }
    }

    const aggregatedResult: MappingResultJson = {
      timestamp: new Date().toISOString(),
      products: mappingResults.flatMap((r) => r.products),
      productCount: mappingResults.reduce((acc, r) => acc + r.productCount, 0),
      canonicalHeaders: mappingResults[0]?.canonicalHeaders || [],
      tableStructure: {
        mergedTableCount: mappingResults.length,
        rawTableCount,
        ...mappingResults[0]?.tableStructure,
      },
      qualityMetrics: {
        completenessScore:
          mappingResults.reduce((acc, r) => acc + r.qualityMetrics.completenessScore, 0) /
          mappingResults.length,
        confidenceScore:
          mappingResults.reduce((acc, r) => acc + r.qualityMetrics.confidenceScore, 0) /
          mappingResults.length,
        totalFields: mappingResults.reduce((acc, r) => acc + r.qualityMetrics.totalFields, 0),
        populatedFields: mappingResults.reduce(
          (acc, r) => acc + r.qualityMetrics.populatedFields,
          0
        ),
        emptyFields: mappingResults.reduce((acc, r) => acc + r.qualityMetrics.emptyFields, 0),
        productsWithAllFields: mappingResults.reduce(
          (acc, r) => acc + r.qualityMetrics.productsWithAllFields,
          0
        ),
        averageFieldsPerProduct:
          mappingResults.reduce((acc, r) => acc + r.qualityMetrics.averageFieldsPerProduct, 0) /
          mappingResults.length,
        fieldPopulationRates: mappingResults[0]?.qualityMetrics.fieldPopulationRates || {},
        completenessDistribution: mappingResults[0]?.qualityMetrics.completenessDistribution || {
          '100%': 0,
          '90-99%': 0,
          '75-89%': 0,
          '50-74%': 0,
          '<50%': 0,
        },
        dataQualityIssues: mappingResults[0]?.qualityMetrics.dataQualityIssues || {
          emptyOrNearlyEmptyProducts: 0,
          fieldsWithHighMissingRate: [],
          fieldsWithAllSameValue: [],
        },
      },
      usage: {
        promptTokens: mappingResults.reduce((acc, r) => acc + r.usage.promptTokens, 0),
        completionTokens: mappingResults.reduce((acc, r) => acc + r.usage.completionTokens, 0),
        cost: mappingResults.reduce((acc, r) => acc + r.usage.cost, 0),
      },
    };

    return { aggregatedResult, lastPromptUsed, totalProcessingTime };
  }

  /**
   * Map products from OCR data using AI
   */
  async mapProducts(documentId: string): Promise<{
    mappingResultJson: MappingResultJson;
    processingTime: number;
  }> {
    // Retrieve document metadata from database
    const document = await this.documentRepo.findById(documentId);

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

    // Get custom prompt and model if requested
    const customPrompt = document.ai_prompt_requested || undefined;
    const requestedModel = document.ai_model_requested || this.defaultModel;

    console.log(
      `AI Mapping with model: ${requestedModel}, custom prompt: ${customPrompt ? 'YES' : 'NO'}`
    );

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
    const rawTables = ocrData.ocrResponse.tables || [];

    // Merge split tables before sending to AI
    const tables = mergeSplitTables(rawTables);
    // Process tables through AI using shared logic
    const { aggregatedResult, lastPromptUsed, totalProcessingTime } = await this.processTables(
      tables,
      rawTables.length,
      requestedModel,
      customPrompt
    );

    // Update database with AI mapping results
    await this.documentRepo.updateAiMapping({
      result_id: documentId,
      ai_mapping_result: JSON.stringify(aggregatedResult),
      ai_model_used: requestedModel,
      ai_prompt_used: lastPromptUsed,
      ai_model_cost_usd: aggregatedResult.usage.cost,
      ai_confidence_score: aggregatedResult.qualityMetrics.confidenceScore,
      ai_completeness_score: aggregatedResult.qualityMetrics.completenessScore,
      ai_prompt_tokens: aggregatedResult.usage.promptTokens,
      ai_completion_tokens: aggregatedResult.usage.completionTokens,
    });

    const benchmarkPath = `${document.vendor_name}/benchmark.json`;
    const benchmarkBlob = await this.storageService.downloadBlob(documentsContainer, benchmarkPath); // returns null if not found
    if (!benchmarkBlob) {
      console.log(
        `No benchmark found for vendor ${document.vendor_name} at ${benchmarkPath}. Skipping grading.`
      );
    } else {
      const result: GradingResult = calculateGrade(benchmarkBlob, document);

      await this.documentRepo.updateGradingResults({
        result_id: documentId,
        grading_results: JSON.stringify(result.metrics),
        grading_analysis: JSON.stringify(result.analysis),
        graded_at: result.gradedAt,
      });
    }

    return {
      mappingResultJson: aggregatedResult,
      processingTime: totalProcessingTime,
    };
  }

  /**
   * Process tables from OCR file (for testing)
   *
   * @param ocrData - OCR response with tables array
   * @param customPrompt - Optional custom prompt
   * @param requestedModel - Model to use (defaults to instance's defaultModel)
   * @returns Aggregated mapping result with all products
   */
  async processTablesFromOcrData(
    ocrData: { ocrResponse: { tables: Table[] } },
    customPrompt?: string,
    requestedModel?: string
  ): Promise<{
    mappingResultJson: MappingResultJson;
    processingTime: number;
    mergeStats: { rawTableCount: number; mergedTableCount: number };
  }> {
    const rawTables = ocrData.ocrResponse.tables || [];
    const modelToUse = requestedModel || this.defaultModel;

    // Merge split tables before sending to AI
    const tables = mergeSplitTables(rawTables);

    // Process tables through AI using shared logic
    const { aggregatedResult, totalProcessingTime } = await this.processTables(
      tables,
      rawTables.length,
      modelToUse,
      customPrompt
    );

    return {
      mappingResultJson: aggregatedResult,
      processingTime: totalProcessingTime,
      mergeStats: {
        rawTableCount: rawTables.length,
        mergedTableCount: tables.length,
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
export async function createAIService(defaultModel?: string): Promise<AIService> {
  const endpoint = process.env.AI_PROJECT_ENDPOINT;
  const apiKey = process.env.AI_PROJECT_KEY;
  const model = defaultModel || process.env.AI_MODEL || 'gpt-4o';

  if (!endpoint || !apiKey) {
    throw new Error('Missing AI project configuration (AI_PROJECT_ENDPOINT or AI_PROJECT_KEY)');
  }

  const { createDocumentRepository } =
    await import('../data/repositories/DocumentRepository.prisma.js');
  const documentRepo = await createDocumentRepository();
  const storageService = new StorageService(getStorageConnectionString());
  return new AIService(endpoint, apiKey, documentRepo, storageService, model);
}
