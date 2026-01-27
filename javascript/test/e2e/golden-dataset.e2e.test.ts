/**
 * E2E Processing Test - Golden Dataset Validation
 *
 * Tests AI product mapping accuracy against known benchmark data.
 * Uses REAL Azure AI services to verify extraction quality.
 * Critical for catching AI regression before production.
 *
 * GOLDEN DATASET FOLDERS:
 * 1. BETTER LIVING - Structured catalog with pricing
 * 2. BLENKO - Multi-table catalog
 * 3. FRIELING - Dense product listings
 * 4. GCD - Varied schema
 * 5. JOKARI - Different field naming
 */

import { readFileSync, readdirSync } from "fs";
import sql from "mssql";
import { join } from "path";
import { describe, expect, it } from "vitest";
import * as xlsx from "xlsx";
import { generateTestVendorName } from "../helpers/testVendorNames";

const FUNCTION_BASE_URL = process.env.FUNCTION_APP_URL || "http://localhost:7071";
// const API_BASE_URL = `${FUNCTION_BASE_URL}/api`;
const DOCS_DIR = join(__dirname, "../docs");
const TIMEOUT = 180000; // 3 minutes per test

// Test only 1 vendor for critical path (add more if needed)
const VENDORS = ["BETTER LIVING"];
// const VENDORS = ['BETTER LIVING', 'BLENKO', 'FRIELING', 'GCD', 'JOKARI'];

// Read connection string from environment (E2E tests use production resources)
const DB_CONNECTION_STRING = process.env.SQL_CONNECTION_STRING || "";

if (!DB_CONNECTION_STRING) {
  throw new Error("SQL_CONNECTION_STRING environment variable is required for E2E tests");
}

interface BenchmarkProduct {
  sku: string;
  name: string;
  price: number;
  unit?: string;
  description?: string;
}

interface ExtractedProduct {
  code?: string;
  sku?: string;
  description?: string;
  name?: string;
  price: number;
  unit?: string;
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
 * Calculate string similarity (0-1 scale)
 */
function stringSimilarity(a: string, b: string): number {
  const distance = levenshteinDistance(a.toLowerCase(), b.toLowerCase());
  const maxLength = Math.max(a.length, b.length);
  return maxLength === 0 ? 1 : 1 - distance / maxLength;
}

/**
 * Wait for document to complete processing with better status handling
 */
async function waitForCompletion(resultId: string, maxWaitMs: number = 180000): Promise<any> {
  const startTime = Date.now();
  const pool = new sql.ConnectionPool(DB_CONNECTION_STRING);
  await pool.connect();

  while (Date.now() - startTime < maxWaitMs) {
    const result = await pool
      .request()
      .input("resultId", sql.NVarChar, resultId)
      .query("SELECT * FROM vvocr.document_processing_results WHERE result_id = @resultId");

    const record = result.recordset[0];

    if (record) {
      if (record.processing_status === "completed") {
        await pool.close();
        return record;
      }

      // Only exit on failed if it's been in failed state for >10 seconds
      // (to avoid exiting on transient errors during retry logic)
      if (record.processing_status === "failed") {
        const timeSinceUpdate = new Date().getTime() - new Date(record.updated_at).getTime();
        if (timeSinceUpdate > 10000) {
          await pool.close();
          return record;
        }
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  await pool.close();
  throw new Error(`Processing timeout for ${resultId}`);
}

/**
 * Parse XLSX benchmark file with flexible schema detection
 */
function loadBenchmarkData(vendorDir: string): BenchmarkProduct[] {
  const files = readdirSync(vendorDir);
  const xlsxFile = files.find((f) => f.endsWith(".xlsx"));

  if (!xlsxFile) {
    throw new Error(`No XLSX benchmark file found in ${vendorDir}`);
  }

  const workbook = xlsx.readFile(join(vendorDir, xlsxFile));
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(worksheet);

  const products: BenchmarkProduct[] = [];

  for (const row of data as any[]) {
    // Flexible field name detection
    const sku = row.SKU || row.sku || row["Item Code"] || row["Item #"] || row.ItemCode || "";
    const name =
      row.Name || row.name || row["Product Name"] || row.ProductName || row.Description || "";
    const price = parseFloat(
      String(row.Price || row.price || row.MSRP || row.Cost || "0").replace(/[^0-9.]/g, "")
    );
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

describe("E2E Processing: Golden Dataset Validation", () => {
  const results: AccuracyMetrics[] = [];

  VENDORS.forEach((vendor) => {
    it(`should accurately extract products from ${vendor} catalog`, async () => {
      // Arrange
      const vendorDir = join(DOCS_DIR, vendor);
      const files = readdirSync(vendorDir);
      const pdfFile = files.find((f) => f.endsWith(".pdf"));

      if (!pdfFile) {
        throw new Error(`No PDF file found for ${vendor}`);
      }

      const benchmark = loadBenchmarkData(vendorDir);
      expect(benchmark.length).toBeGreaterThan(0);

      console.log(`\n📋 Vendor: ${vendor}`);
      console.log(`📄 PDF: ${pdfFile}`);
      console.log(`🎯 Benchmark: ${benchmark.length} products`);

      // Upload and process
      const testFile = readFileSync(join(vendorDir, pdfFile));
      const vendorName = generateTestVendorName("E2E", `${vendor.replace(/[^A-Z0-9]+/g, "_")}`);
      const formData = new FormData();
      formData.append("file", new Blob([testFile], { type: "application/pdf" }), pdfFile);
      formData.append("vendorName", vendorName);

      console.log("📤 Uploading...");
      console.log(`   Vendor name: ${vendorName}`);
      const uploadResponse = await fetch(`${FUNCTION_BASE_URL}/api/upload`, {
        method: "POST",
        body: formData,
      });

      if (uploadResponse.status !== 201) {
        const errorBody = await uploadResponse.text();
        console.error(`Upload failed (${uploadResponse.status}):`, errorBody);
      }

      expect(uploadResponse.status).toBe(201);
      const uploadData = await uploadResponse.json();
      const resultId = uploadData.resultId;

      // Wait for completion
      console.log("⏳ Processing...");
      const completed = await waitForCompletion(resultId, 300000);

      // Handle both column name formats (processing_status vs status)
      const status = completed.processing_status || completed.status;
      expect(status).toBe("completed");

      // Parse extracted products - handle both ai_mapping_result and extracted_products
      const rawResult = completed.ai_mapping_result || completed.extracted_products;
      let extracted: ExtractedProduct[] = [];

      if (typeof rawResult === "string") {
        const parsed = JSON.parse(rawResult);
        extracted = parsed.products || parsed || [];
      } else if (rawResult) {
        extracted = rawResult.products || rawResult || [];
      }

      console.log(`✓ Extracted: ${extracted.length} products`);

      // Compare with benchmark
      let matches = 0;
      let skuMatches = 0;
      let priceMatches = 0;
      let nameMatches = 0;

      benchmark.forEach((benchProduct) => {
        const found = extracted.find((extProduct) => {
          const extSku = (extProduct.code || extProduct.sku || "").toString().trim().toLowerCase();
          const benchSku = benchProduct.sku.toLowerCase();

          // SKU exact match
          if (extSku === benchSku) {
            return true;
          }

          // Fuzzy name match
          const extName = (extProduct.description || extProduct.name || "").toLowerCase();
          const benchName = benchProduct.name.toLowerCase();
          const similarity = stringSimilarity(extName, benchName);

          return similarity > 0.8;
        });

        if (found) {
          matches++;

          // Check field accuracy
          const extSku = (found.code || found.sku || "").toString().toLowerCase();
          if (extSku === benchProduct.sku.toLowerCase()) {
            skuMatches++;
          }

          const priceDiff = Math.abs(found.price - benchProduct.price);
          const priceTolerance = benchProduct.price * 0.01; // 1% tolerance
          if (priceDiff <= priceTolerance) {
            priceMatches++;
          }

          const extName = (found.description || found.name || "").toLowerCase();
          const benchName = benchProduct.name.toLowerCase();
          if (stringSimilarity(extName, benchName) > 0.9) {
            nameMatches++;
          }
        }
      });

      // Calculate metrics
      const precision = matches / extracted.length;
      const recall = matches / benchmark.length;
      const f1Score = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
      const skuAccuracy = skuMatches / matches;
      const priceAccuracy = priceMatches / matches;
      const nameAccuracy = nameMatches / matches;

      const metrics: AccuracyMetrics = {
        vendor,
        totalBenchmark: benchmark.length,
        totalExtracted: extracted.length,
        matchedProducts: matches,
        precision: precision * 100,
        recall: recall * 100,
        f1Score: f1Score * 100,
        skuAccuracy: skuAccuracy * 100,
        priceAccuracy: priceAccuracy * 100,
        nameAccuracy: nameAccuracy * 100,
      };

      results.push(metrics);

      console.log("\n📊 Accuracy Metrics:");
      console.log(`  Precision: ${metrics.precision.toFixed(1)}%`);
      console.log(`  Recall: ${metrics.recall.toFixed(1)}%`);
      console.log(`  F1 Score: ${metrics.f1Score.toFixed(1)}%`);
      console.log(`  SKU Accuracy: ${metrics.skuAccuracy.toFixed(1)}%`);
      console.log(`  Price Accuracy: ${metrics.priceAccuracy.toFixed(1)}%`);
      console.log(`  Name Accuracy: ${metrics.nameAccuracy.toFixed(1)}%`);

      // Assert minimum quality thresholds (relaxed for POC)
      expect(recall).toBeGreaterThanOrEqual(0.15); // Find at least 15% of products
      expect(precision).toBeGreaterThanOrEqual(0.1); // 10% of extractions are correct
      expect(f1Score).toBeGreaterThanOrEqual(0.12); // Overall quality score

      // Log warning if below production thresholds
      if (recall < 0.7 || precision < 0.8 || f1Score < 0.7) {
        console.warn(
          "⚠️  Warning: Quality metrics below production thresholds (70% recall, 80% precision, 70% F1)"
        );
      }

      console.log("✅ Accuracy validation passed\n");
    }, 600000); // 10 minute timeout for golden dataset
  });

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
      console.log(
        `  Benchmark: ${result.totalBenchmark} | Extracted: ${result.totalExtracted} | Matched: ${result.matchedProducts}`
      );
      console.log(
        `  P: ${result.precision.toFixed(1)}% | R: ${result.recall.toFixed(1)}% | F1: ${result.f1Score.toFixed(1)}%`
      );
      console.log();
    }
  });
});
