#!/usr/bin/env tsx
/**
 * AI Service Testing Script
 *
 * Tests AI normalization in isolation with saved OCR data
 *
 * Usage:
 *   npx tsx test/tools/test-ai-service.ts <ocr-json-file> [custom-prompt-file]
 *   npx tsx test/tools/test-ai-service.ts test/outputs/ocr-azure-doc-intelligence-sample.json
 *   npx tsx test/tools/test-ai-service.ts test/outputs/ocr-azure-doc-intelligence-sample.json prompts/custom.txt
 *
 * Output:
 *   - Saves AI results to: test/outputs/ai-mapping-result-<filename>.json
 *   - Saves detailed analysis to: test/outputs/ai-mapping-analysis-<filename>.json
 *   - Displays merge statistics, quality metrics, and extracted products
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, dirname, extname, join } from 'path';
import { fileURLToPath } from 'url';
import { AIService } from '../../src/services/ai-service.js';
import { type MappingResultJson } from '../../src/utils/ai-service-helper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface DetailedAnalysis {
  mergeAnalysis: {
    rawTableCount: number;
    mergedTableCount: number;
    compressionRatio: string;
    mergedTables: Array<{
      index: number;
      rowCount: number;
      columnCount: number;
      cellCount: number;
      pages: number[];
    }>;
  };
  aiProcessing: {
    tableResults: MappingResultJson[];
    aggregatedResult: MappingResultJson;
    totalProcessingTime: number;
  };
  qualityAnalysis: {
    overallCompleteness: number;
    overallConfidence: number;
    productCount: number;
    avgFieldsPerProduct: number;
    topIssues: string[];
  };
}

/**
 * Display merge statistics
 */
function displayMergeStats(
  rawCount: number,
  mergedCount: number,
  mergedTables: Array<{
    rowCount: number;
    columnCount: number;
    cells: unknown[];
    boundingRegions?: Array<{ pageNumber: number }>;
  }>
) {
  console.log('\n' + '='.repeat(60));
  console.log('🔗 TABLE MERGE ANALYSIS');
  console.log('='.repeat(60));
  console.log(`Raw tables from OCR:    ${rawCount}`);
  console.log(`Merged logical tables:  ${mergedCount}`);
  console.log(
    `Compression ratio:      ${rawCount}:${mergedCount} (${((rawCount / mergedCount) * 100).toFixed(0)}%)`
  );

  console.log('\n📊 Merged Table Details:');
  mergedTables.forEach((table, idx) => {
    const pages = table.boundingRegions?.map((r) => r.pageNumber) || [];
    const uniquePages = [...new Set(pages)].sort((a, b) => (a as number) - (b as number));
    console.log(`\n  Table ${idx + 1}:`);
    console.log(`    Dimensions: ${table.rowCount} rows × ${table.columnCount} cols`);
    console.log(`    Cells:      ${table.cells.length}`);
    console.log(`    Pages:      ${uniquePages.join(', ')}`);
  });
}

/**
 * Display AI processing results
 */
function displayAiResults(results: MappingResultJson[], aggregated: MappingResultJson) {
  console.log('\n' + '='.repeat(60));
  console.log('🤖 AI PROCESSING RESULTS');
  console.log('='.repeat(60));

  // Individual table results
  console.log(`\n📋 Individual Table Results (${results.length} tables processed):`);
  results.forEach((result, idx) => {
    console.log(`\n  Table ${idx + 1}:`);
    console.log(`    Products extracted:  ${result.productCount}`);
    console.log(`    Completeness score:  ${result.qualityMetrics.completenessScore.toFixed(2)}%`);
    console.log(`    Confidence score:    ${result.qualityMetrics.confidenceScore.toFixed(2)}%`);
    console.log(`    Processing time:     ${result.processingTime || 0}ms`);
    console.log(`    Cost:                $${result.usage.cost.toFixed(4)}`);
  });

  // Aggregated results
  console.log('\n' + '-'.repeat(60));
  console.log('📊 AGGREGATED RESULTS');
  console.log('-'.repeat(60));
  console.log(`Total products:         ${aggregated.productCount}`);
  console.log(`Avg completeness:       ${aggregated.qualityMetrics.completenessScore.toFixed(2)}%`);
  console.log(`Avg confidence:         ${aggregated.qualityMetrics.confidenceScore.toFixed(2)}%`);
  console.log(
    `Total tokens:           ${aggregated.usage.promptTokens + aggregated.usage.completionTokens}`
  );
  console.log(`  - Prompt:             ${aggregated.usage.promptTokens}`);
  console.log(`  - Completion:         ${aggregated.usage.completionTokens}`);
  console.log(`Total cost:             $${aggregated.usage.cost.toFixed(4)}`);

  // Quality metrics
  console.log('\n📈 Quality Metrics:');
  console.log(`  Total fields:         ${aggregated.qualityMetrics.totalFields}`);
  console.log(`  Populated:            ${aggregated.qualityMetrics.populatedFields}`);
  console.log(`  Empty:                ${aggregated.qualityMetrics.emptyFields}`);
  console.log(`  Products with all:    ${aggregated.qualityMetrics.productsWithAllFields}`);

  // Completeness distribution
  console.log('\n📊 Completeness Distribution:');
  const dist = aggregated.qualityMetrics.completenessDistribution;
  console.log(`  100%:       ${dist['100%']} products`);
  console.log(`  90-99%:     ${dist['90-99%']} products`);
  console.log(`  75-89%:     ${dist['75-89%']} products`);
  console.log(`  50-74%:     ${dist['50-74%']} products`);
  console.log(`  <50%:       ${dist['<50%']} products`);

  // Data quality issues
  const issues = aggregated.qualityMetrics.dataQualityIssues;
  if (issues.fieldsWithHighMissingRate.length > 0 || issues.fieldsWithAllSameValue.length > 0) {
    console.log('\n⚠️  Data Quality Issues:');
    if (issues.fieldsWithHighMissingRate.length > 0) {
      console.log(`  Fields with >50% missing: ${issues.fieldsWithHighMissingRate.join(', ')}`);
    }
    if (issues.fieldsWithAllSameValue.length > 0) {
      console.log(`  Fields with same value:   ${issues.fieldsWithAllSameValue.join(', ')}`);
    }
  }

  // Sample products
  if (aggregated.products.length > 0) {
    console.log('\n📦 Sample Products (first 3):');
    aggregated.products.slice(0, 3).forEach((product, idx) => {
      console.log(`\n  Product ${idx + 1}:`);
      Object.entries(product).forEach(([key, value]) => {
        console.log(`    ${key}: ${value}`);
      });
    });
  }
}

/**
 * Run AI test on OCR data
 */
async function runAiTest(ocrFilePath: string, customPromptPath?: string) {
  // Validate inputs
  if (!existsSync(ocrFilePath)) {
    console.error(`❌ Error: OCR file not found: ${ocrFilePath}`);
    process.exit(1);
  }

  let customPrompt: string | undefined;
  if (customPromptPath) {
    if (!existsSync(customPromptPath)) {
      console.error(`❌ Error: Custom prompt file not found: ${customPromptPath}`);
      process.exit(1);
    }
    customPrompt = readFileSync(customPromptPath, 'utf-8');
    console.log(`📝 Using custom prompt from: ${customPromptPath}`);
  }

  // Get credentials
  const endpoint = process.env.AI_PROJECT_ENDPOINT;
  const apiKey = process.env.AI_PROJECT_KEY;
  const model = process.env.AI_MODEL || 'gpt-4o';

  if (!endpoint || !apiKey) {
    console.error('❌ Error: Missing environment variables');
    console.error('   Required: AI_PROJECT_ENDPOINT, AI_PROJECT_KEY');
    process.exit(1);
  }

  console.log(`\n🔍 Processing OCR file: ${ocrFilePath}`);
  console.log(`📡 AI Endpoint: ${endpoint}`);
  console.log(`🤖 Model: ${model}`);

  // Load OCR data
  const ocrData = JSON.parse(readFileSync(ocrFilePath, 'utf-8'));

  // Create AIService instance (no database dependency for testing)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aiService = new AIService(endpoint, apiKey, null as any, null as any, model);

  // Use actual service logic with merge logging
  const {
    mappingResultJson: aggregatedResult,
    processingTime: totalProcessingTime,
    mergeStats,
  } = await aiService.processTablesFromOcrData(ocrData, customPrompt);

  console.log(`\n✅ All tables processed in ${totalProcessingTime}ms`);

  // Display merge statistics
  displayMergeStats(mergeStats.rawTableCount, mergeStats.mergedTableCount, []);

  // Display results
  displayAiResults([], aggregatedResult);

  // Prepare outputs
  const outputDir = join(__dirname, '../outputs');
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const baseFilename = basename(ocrFilePath, extname(ocrFilePath)).replace(
    'ocr-azure-doc-intelligence-',
    ''
  );

  // Save aggregated result
  const resultPath = join(outputDir, `ai-mapping-result-${baseFilename}.json`);
  writeFileSync(resultPath, JSON.stringify(aggregatedResult, null, 2));
  console.log(`\n💾 Saved aggregated result to: ${resultPath}`);

  // Save detailed analysis
  const detailedAnalysis: DetailedAnalysis = {
    mergeAnalysis: {
      rawTableCount: mergeStats.rawTableCount,
      mergedTableCount: mergeStats.mergedTableCount,
      compressionRatio: `${mergeStats.rawTableCount}:${mergeStats.mergedTableCount}`,
      mergedTables: [], // Table details already logged by service
    },
    aiProcessing: {
      tableResults: [], // Individual table results not exposed (use aggregated metrics)
      aggregatedResult,
      totalProcessingTime,
    },
    qualityAnalysis: {
      overallCompleteness: aggregatedResult.qualityMetrics.completenessScore,
      overallConfidence: aggregatedResult.qualityMetrics.confidenceScore,
      productCount: aggregatedResult.productCount,
      avgFieldsPerProduct: aggregatedResult.qualityMetrics.averageFieldsPerProduct,
      topIssues: [
        ...aggregatedResult.qualityMetrics.dataQualityIssues.fieldsWithHighMissingRate.map(
          (f) => `High missing rate: ${f}`
        ),
        ...aggregatedResult.qualityMetrics.dataQualityIssues.fieldsWithAllSameValue.map(
          (f) => `Same value: ${f}`
        ),
      ],
    },
  };

  const analysisPath = join(outputDir, `ai-mapping-analysis-${baseFilename}.json`);
  writeFileSync(analysisPath, JSON.stringify(detailedAnalysis, null, 2));
  console.log(`💾 Saved detailed analysis to: ${analysisPath}`);

  console.log(`\n✅ Test complete!\n`);
}

// Main execution
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log(`
Usage: npx tsx test/tools/test-ai-service.ts <ocr-json-file> [custom-prompt-file]

Examples:
  npx tsx test/tools/test-ai-service.ts test/outputs/ocr-azure-doc-intelligence-sample.json
  npx tsx test/tools/test-ai-service.ts test/outputs/ocr-azure-doc-intelligence-sample.json prompts/custom.txt

This script:
  1. Loads saved OCR results from test-ocr-service.ts
  2. Merges split tables and shows statistics
  3. Processes each table through AI normalization
  4. Aggregates results and calculates quality metrics
  5. Saves detailed results and analysis
  6. Displays comprehensive output summary

Custom prompts can use {{TABLE_DATA}} placeholder for table insertion.
  `);
  process.exit(1);
}

const ocrFilePath = args[0];
const customPromptPath = args[1];

runAiTest(ocrFilePath, customPromptPath).catch((error) => {
  console.error(`\n❌ Error: ${error.message}`);
  if (error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
