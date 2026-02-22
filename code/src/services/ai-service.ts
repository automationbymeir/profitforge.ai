import { OpenAI } from 'openai';
import { DocumentRepository } from '../data/repositories/DocumentRepository.prisma.js';
import { StorageService } from '../data/storage.js';

import {
  calculateJsonResult,
  extractTableHeaders,
  MappingResultJson,
} from '../utils/ai-service-helper.js';
import { getStorageConnectionString } from '../utils/config.js';
import { buildColumnNormalizationPrompt } from '../utils/default-ai-prompt.js';
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
  private openai: OpenAI;
  private documentRepo: DocumentRepository;
  private storageService: StorageService;

  constructor(
    endpoint: string,
    apiKey: string,
    documentRepo: DocumentRepository,
    storageService: StorageService
  ) {
    this.documentRepo = documentRepo;
    this.storageService = storageService;
    this.openai = new OpenAI({
      apiKey,
      baseURL: `${endpoint}/openai/deployments/gpt-4o`,
      defaultQuery: { 'api-version': '2024-08-01-preview' },
      defaultHeaders: { 'api-key': apiKey },
    });
    // No bronze-layer usage; AI mapping results are stored in DB
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
    const requestedModel = document.ai_model_requested || 'gpt-4o';

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
    const tables = ocrData.ocrResponse?.tables || ocrData.tables || [];

    // Analyze ALL table headers
    const allHeaders = extractTableHeaders(tables);
    // merge common headers?
    const prompt = customPrompt ? customPrompt : buildColumnNormalizationPrompt(allHeaders);
    const startTime = Date.now();
    // Call OpenAI for column normalization
    const aiResponse = await this.openai.chat.completions.create({
      model: requestedModel, // Use requested model
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 1000,
      temperature: 0,
    });
    const processingTime = Date.now() - startTime;
    const mappingResultJson = calculateJsonResult(aiResponse, tables);

    // Update database with AI mapping results
    await this.documentRepo.updateAiMapping({
      result_id: documentId,
      ai_mapping_result: JSON.stringify(mappingResultJson),
      ai_model_used: requestedModel, // Store actual model used
      ai_prompt_used: prompt,
      ai_model_cost_usd: mappingResultJson.usage.cost,
      ai_confidence_score: mappingResultJson.qualityMetrics.confidenceScore,
      ai_completeness_score: mappingResultJson.qualityMetrics.completenessScore,
      ai_prompt_tokens: mappingResultJson.usage.promptTokens,
      ai_completion_tokens: mappingResultJson.usage.completionTokens,
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
      mappingResultJson,
      processingTime,
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

  const { createDocumentRepository } =
    await import('../data/repositories/DocumentRepository.prisma.js');
  const documentRepo = await createDocumentRepository();
  const storageService = new StorageService(getStorageConnectionString());
  return new AIService(endpoint, apiKey, documentRepo, storageService);
}
