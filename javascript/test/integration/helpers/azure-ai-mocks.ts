/**
 * Azure AI Service Mocks
 *
 * Pre-recorded fixtures for Document Intelligence and OpenAI
 * Used in integration tests to avoid real API calls
 */

import { vi } from 'vitest';
import corruptedDocument from './fixtures/document-intelligence/corrupted-document.json';
import sampleOcrResult from './fixtures/document-intelligence/sample-ocr-result.json';
import errorResponse from './fixtures/openai/error-response.json';
import sampleProductMapping from './fixtures/openai/sample-product-mapping.json';

export type MockScenario = 'success' | 'corrupted-ocr' | 'openai-error' | 'custom';

/**
 * Mock Azure Document Intelligence client
 */
export function mockDocumentIntelligence(scenario: MockScenario = 'success', customResult?: any) {
  const result =
    scenario === 'corrupted-ocr'
      ? corruptedDocument
      : scenario === 'custom'
        ? customResult
        : sampleOcrResult;

  return {
    beginAnalyzeDocument: vi.fn().mockResolvedValue({
      pollUntilDone: vi.fn().mockResolvedValue(result),
    }),
  };
}

/**
 * Mock Azure OpenAI client
 */
export function mockOpenAI(scenario: MockScenario = 'success', customResult?: any) {
  const result =
    scenario === 'openai-error'
      ? errorResponse
      : scenario === 'custom'
        ? customResult
        : sampleProductMapping;

  return {
    getChatCompletions: vi.fn().mockResolvedValue(result),
  };
}

/**
 * Create a custom OpenAI response with specific products
 */
export function createCustomOpenAIResponse(
  products: Array<{
    code: string;
    description: string;
    price: number;
    casePack: number;
    uom: string;
  }>
) {
  const productsJson = JSON.stringify(products, null, 2);

  return {
    id: 'chatcmpl-custom',
    object: 'chat.completion',
    created: Date.now(),
    model: 'gpt-4o',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: `\`\`\`json\n${productsJson}\n\`\`\``,
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 1000,
      completion_tokens: 200,
      total_tokens: 1200,
    },
  };
}

/**
 * Create a custom Document Intelligence OCR response
 */
export function createCustomOCRResponse(textContent: string, confidence: number = 0.95) {
  return {
    status: 'succeeded',
    createdDateTime: new Date().toISOString(),
    lastUpdatedDateTime: new Date().toISOString(),
    analyzeResult: {
      apiVersion: '2023-07-31',
      modelId: 'prebuilt-layout',
      stringIndexType: 'textElements',
      content: textContent,
      pages: [
        {
          pageNumber: 1,
          angle: 0,
          width: 8.5,
          height: 11,
          unit: 'inch',
          words: textContent.split(' ').map((word, i) => ({
            content: word,
            boundingBox: [i * 0.5, 1.0, (i + 1) * 0.5, 1.0, (i + 1) * 0.5, 1.5, i * 0.5, 1.5],
            confidence,
          })),
        },
      ],
    },
  };
}

/**
 * Mock environment variables for integration tests
 */
export function mockAIEnvironmentVariables() {
  process.env.DOCUMENT_INTELLIGENCE_ENDPOINT = 'https://test-doc-intel.cognitiveservices.azure.com';
  process.env.DOCUMENT_INTELLIGENCE_KEY = 'test-key-12345';
  process.env.AI_PROJECT_ENDPOINT = 'https://test-openai.openai.azure.com';
  process.env.AI_PROJECT_KEY = 'test-openai-key-67890';
  process.env.AI_MODEL_NAME = 'gpt-4o';
}
