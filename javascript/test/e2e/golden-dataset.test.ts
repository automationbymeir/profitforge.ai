import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as xlsx from "xlsx";

/**
 * Golden Dataset Validation Test Suite
 *
 * PURPOSE:
 * - Test AI product mapping accuracy against known benchmark data
 * - Compare extracted products with expected results from XLSX files
 * - Calculate precision, recall, and F1 scores for each vendor
 * - Identify accuracy issues before production deployment
 *
 * TEST STRUCTURE:
 * 1. Load 5 vendor folders from javascript/test/docs/
 * 2. For each folder:
 *    - Upload PDF file via API
 *    - Wait for OCR processing (status: 'ocr_complete')
 *    - Trigger AI mapping
 *    - Wait for completion (status: 'completed')
 *    - Parse XLSX benchmark file
 *    - Compare products (SKU, name, price)
 *    - Calculate accuracy metrics
 *
 * ACCURACY METRICS:
 * - Precision: % of extracted products that match benchmark
 * - Recall: % of benchmark products found in extraction
 * - F1 Score: Harmonic mean of precision and recall
 * - Field-level accuracy: SKU match %, price match %, name similarity %
 *
 * FUZZY MATCHING:
 * - SKU: Exact match (case-insensitive)
 * - Price: Within 1% tolerance
 * - Name: Levenshtein distance similarity > 80%
 *
 * ENVIRONMENT:
 * - Requires running Azure Functions app
 * - Requires valid connection strings
 * - Test data: javascript/test/docs/[VENDOR]/
 *
 * GOLDEN DATASET FOLDERS:
 * 1. BETTER LIVING - Structured catalog with pricing
 * 2. BLENKO - Multi-table catalog
 * 3. FRIELING - Dense product listings
 * 4. GCD - Varied schema
 * 5. JOKARI - Different field naming
 */

// Test configuration
const API_BASE_URL = process.env.FUNCTION_APP_URL || "http://localhost:7071/api";
const DOCS_DIR = path.join(__dirname, "../docs");
const TIMEOUT = 180000; // 3 minutes per test

// Vendor folders (golden dataset)
const VENDORS = [
  "BETTER LIVING",
  "BLENKO",
  "FRIELING",
  "GCD",
  "JOKARI",
];

interface BenchmarkProduct {
  sku: string;
  name: string;
  price: number;
  unit?: string;
  description?: string;
}

interface ExtractedProduct {
  sku: string;
  name: string;
  price: number;
  unit?: string;
  description?: string;
}

interface AccuracyMetrics {
  vendor: string;
  totalBenchmark: number;
  totalExtracted: number;
  matchedProducts: number;
  precision: number;
  recall: number;
  f1Score: number;
  skuAccuracy: number;
  priceAccuracy: number;
  nameAccuracy: number;
}

/**
 * Calculate Levenshtein distance for string similarity
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate string similarity (0-100%)
 */
function stringSimilarity(a: string, b: string): number {
  const distance = levenshteinDistance(a.toLowerCase(), b.toLowerCase());
  const maxLength = Math.max(a.length, b.length);
  return ((maxLength - distance) / maxLength) * 100;
}

/**
 * Parse XLSX benchmark file
 */
function parseBenchmarkXLSX(filePath: string): BenchmarkProduct[] {
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(worksheet);

  // Try to detect column names (flexible schema)
  const products: BenchmarkProduct[] = [];

  for (const row of data as any[]) {
    // Flexible field name detection
    const sku = row.SKU || row.sku || row["Item Code"] || row["Item #"] || row.ItemCode || "";
    const name = row.Name || row.name || row["Product Name"] || row.ProductName || row.Description || "";
    const price = parseFloat(String(row.Price || row.price || row.MSRP || row.Cost || "0").replace(/[^0-9.]/g, ""));
    const unit = row.Unit || row.unit || row.Dimensions || row.Size || "";
    const description = row.Description || row.description || row.Details || "";

    // Only include rows with at least SKU or name
    if (sku || name) {
      products.push({
        sku: String(sku).trim(),
        name: String(name).trim(),
        price: price || 0,
        unit: String(unit || "").trim(),
        description: String(description || "").trim(),
      });
    }
  }

  return products;
}

/**
 * Compare extracted products with benchmark
 */
function compareProducts(
  extracted: ExtractedProduct[],
  benchmark: BenchmarkProduct[]
): AccuracyMetrics & { matches: Array<{ extracted: ExtractedProduct; benchmark: BenchmarkProduct }> } {
  const matches: Array<{ extracted: ExtractedProduct; benchmark: BenchmarkProduct }> = [];
  let skuMatches = 0;
  let priceMatches = 0;
  let nameMatches = 0;

  // For each benchmark product, find best match in extracted
  for (const benchProd of benchmark) {
    let bestMatch: ExtractedProduct | null = null;
    let bestScore = 0;

    for (const extProd of extracted) {
      let score = 0;

      // SKU match (highest priority)
      if (
        benchProd.sku &&
        extProd.sku &&
        benchProd.sku.toLowerCase() === extProd.sku.toLowerCase()
      ) {
        score += 50;
      }

      // Name similarity
      const nameSim = stringSimilarity(benchProd.name, extProd.name);
      score += nameSim * 0.3;

      // Price tolerance (within 1%)
      if (benchProd.price && extProd.price) {
        const priceDiff = Math.abs(benchProd.price - extProd.price) / benchProd.price;
        if (priceDiff < 0.01) {
          score += 20;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = extProd;
      }
    }

    // Accept match if score > 60%
    if (bestMatch && bestScore > 60) {
      matches.push({ extracted: bestMatch, benchmark: benchProd });

      // Track field-level accuracy
      if (
        benchProd.sku &&
        bestMatch.sku &&
        benchProd.sku.toLowerCase() === bestMatch.sku.toLowerCase()
      ) {
        skuMatches++;
      }

      if (benchProd.price && bestMatch.price) {
        const priceDiff = Math.abs(benchProd.price - bestMatch.price) / benchProd.price;
        if (priceDiff < 0.01) {
          priceMatches++;
        }
      }

      const nameSim = stringSimilarity(benchProd.name, bestMatch.name);
      if (nameSim > 80) {
        nameMatches++;
      }
    }
  }

  const matchedCount = matches.length;
  const precision = extracted.length > 0 ? matchedCount / extracted.length : 0;
  const recall = benchmark.length > 0 ? matchedCount / benchmark.length : 0;
  const f1Score = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return {
    vendor: "",
    totalBenchmark: benchmark.length,
    totalExtracted: extracted.length,
    matchedProducts: matchedCount,
    precision: precision * 100,
    recall: recall * 100,
    f1Score: f1Score * 100,
    skuAccuracy: matchedCount > 0 ? (skuMatches / matchedCount) * 100 : 0,
    priceAccuracy: matchedCount > 0 ? (priceMatches / matchedCount) * 100 : 0,
    nameAccuracy: matchedCount > 0 ? (nameMatches / matchedCount) * 100 : 0,
    matches,
  };
}

/**
 * Wait for document processing to complete
 */
async function waitForProcessing(
  documentId: string,
  expectedStatus: string,
  maxWaitMs: number = 180000
): Promise<any> {
  const startTime = Date.now();
  const pollInterval = 2000; // 2 seconds

  while (Date.now() - startTime < maxWaitMs) {
    const response = await fetch(
      `${API_BASE_URL}/getResults?documentId=${documentId}`
    );

    if (!response.ok) {
      throw new Error(`Failed to get results: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.processing_status === expectedStatus || data.processing_status === "failed") {
      return data;
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error(`Timeout waiting for status ${expectedStatus}`);
}

describe("Golden Dataset Validation", () => {
  const results: AccuracyMetrics[] = [];

  for (const vendor of VENDORS) {
    it(
      `should accurately extract products from ${vendor} catalog`,
      async () => {
        const vendorDir = path.join(DOCS_DIR, vendor);

        // Find PDF and XLSX files
        const files = fs.readdirSync(vendorDir);
        const pdfFile = files.find((f) => f.endsWith(".pdf"));
        const xlsxFile = files.find((f) => f.endsWith(".xlsx"));

        if (!pdfFile || !xlsxFile) {
          throw new Error(`Missing PDF or XLSX in ${vendor} folder`);
        }

        console.log(`\n📄 Testing ${vendor}:`);
        console.log(`   PDF: ${pdfFile}`);
        console.log(`   XLSX: ${xlsxFile}`);

        // 1. Load benchmark
        const benchmarkPath = path.join(vendorDir, xlsxFile);
        const benchmark = parseBenchmarkXLSX(benchmarkPath);
        console.log(`   Benchmark products: ${benchmark.length}`);

        // 2. Upload PDF
        const pdfPath = path.join(vendorDir, pdfFile);
        const pdfBuffer = fs.readFileSync(pdfPath);
        const formData = new FormData();
        formData.append("file", new Blob([pdfBuffer], { type: "application/pdf" }), pdfFile);
        formData.append("vendorId", vendor);

        const uploadResponse = await fetch(`${API_BASE_URL}/upload`, {
          method: "POST",
          body: formData,
        });

        expect(uploadResponse.ok).toBe(true);
        const uploadData = await uploadResponse.json();
        const documentId = uploadData.resultId;
        console.log(`   ✅ Uploaded (${documentId})`);

        // 3. Wait for OCR completion
        console.log(`   ⏳ Waiting for OCR...`);
        const ocrResult = await waitForProcessing(documentId, "ocr_complete", TIMEOUT);
        expect(ocrResult.processing_status).toBe("ocr_complete");
        console.log(`   ✅ OCR complete (${ocrResult.doc_intel_page_count} pages)`);

        // 4. Trigger AI mapping
        console.log(`   ⏳ Running AI mapping...`);
        const mapResponse = await fetch(`${API_BASE_URL}/aiProductMapper`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentId }),
        });

        expect(mapResponse.ok).toBe(true);
        console.log(`   ✅ AI mapping complete`);

        // 5. Get final results
        const finalResult = await waitForProcessing(documentId, "completed", TIMEOUT);
        expect(finalResult.processing_status).toBe("completed");

        const mappingData = JSON.parse(finalResult.llm_mapping_result);
        const extracted: ExtractedProduct[] = mappingData.products || [];
        console.log(`   Extracted products: ${extracted.length}`);

        // 6. Compare with benchmark
        const comparison = compareProducts(extracted, benchmark);
        const metrics: AccuracyMetrics = {
          ...comparison,
          vendor,
        };

        results.push(metrics);

        // Log metrics
        console.log(`\n   📊 Accuracy Metrics:`);
        console.log(`      Precision: ${metrics.precision.toFixed(1)}%`);
        console.log(`      Recall: ${metrics.recall.toFixed(1)}%`);
        console.log(`      F1 Score: ${metrics.f1Score.toFixed(1)}%`);
        console.log(`      SKU Match: ${metrics.skuAccuracy.toFixed(1)}%`);
        console.log(`      Price Match: ${metrics.priceAccuracy.toFixed(1)}%`);
        console.log(`      Name Similarity: ${metrics.nameAccuracy.toFixed(1)}%`);

        // Assertions (adjust thresholds based on requirements)
        expect(metrics.recall).toBeGreaterThan(70); // At least 70% recall
        expect(metrics.precision).toBeGreaterThan(70); // At least 70% precision
        expect(metrics.f1Score).toBeGreaterThan(70); // At least 70% F1
      },
      TIMEOUT
    );
  }

  it("should display aggregate metrics across all vendors", () => {
    if (results.length === 0) {
      console.log("No results to aggregate (tests may have been skipped)");
      return;
    }

    console.log("\n\n═══════════════════════════════════════════");
    console.log("📊 AGGREGATE METRICS ACROSS ALL VENDORS");
    console.log("═══════════════════════════════════════════\n");

    const avgPrecision = results.reduce((sum, r) => sum + r.precision, 0) / results.length;
    const avgRecall = results.reduce((sum, r) => sum + r.recall, 0) / results.length;
    const avgF1 = results.reduce((sum, r) => sum + r.f1Score, 0) / results.length;
    const avgSKU = results.reduce((sum, r) => sum + r.skuAccuracy, 0) / results.length;
    const avgPrice = results.reduce((sum, r) => sum + r.priceAccuracy, 0) / results.length;
    const avgName = results.reduce((sum, r) => sum + r.nameAccuracy, 0) / results.length;

    console.log(`Average Precision: ${avgPrecision.toFixed(1)}%`);
    console.log(`Average Recall: ${avgRecall.toFixed(1)}%`);
    console.log(`Average F1 Score: ${avgF1.toFixed(1)}%`);
    console.log(`Average SKU Accuracy: ${avgSKU.toFixed(1)}%`);
    console.log(`Average Price Accuracy: ${avgPrice.toFixed(1)}%`);
    console.log(`Average Name Accuracy: ${avgName.toFixed(1)}%`);

    console.log("\n\nPer-Vendor Summary:");
    console.log("─────────────────────────────────────────\n");
    for (const result of results) {
      console.log(`${result.vendor}:`);
      console.log(`  Benchmark: ${result.totalBenchmark} | Extracted: ${result.totalExtracted} | Matched: ${result.matchedProducts}`);
      console.log(`  P: ${result.precision.toFixed(1)}% | R: ${result.recall.toFixed(1)}% | F1: ${result.f1Score.toFixed(1)}%`);
      console.log();
    }
  });
});
