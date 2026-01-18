import { readFileSync } from "fs";
import sql from "mssql";
import { join } from "path";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * E2E Tests - Use Real Azure Resources
 *
 * Prerequisites:
 * 1. Azure Functions running locally (npm start)
 * 2. Valid connection strings in local.settings.json
 * 3. Sample documents in test/docs/ directory
 *
 * These tests will:
 * - Upload real files to Azure Blob Storage
 * - Wait for Azure Functions to process them
 * - Verify database records are created correctly
 */

const FUNCTION_BASE_URL = "http://localhost:7071";
const UPLOAD_ENDPOINT = `${FUNCTION_BASE_URL}/api/upload`;

// Read connection string from local.settings.json (not from test setup)
let DB_CONNECTION_STRING = "";
try {
  const localSettings = JSON.parse(
    readFileSync(join(__dirname, "../../local.settings.json"), "utf-8")
  );
  DB_CONNECTION_STRING = localSettings.Values.SQL_CONNECTION_STRING || "";
} catch (err) {
  console.error("Failed to load local.settings.json:", err);
}

// Helper to wait for processing
const waitForProcessing = async (resultId: string, maxWaitMs = 180000): Promise<any> => {
  const startTime = Date.now();
  const pool = new sql.ConnectionPool(DB_CONNECTION_STRING);
  await pool.connect();

  while (Date.now() - startTime < maxWaitMs) {
    const result = await pool.request().input("resultId", sql.NVarChar, resultId).query(`
        SELECT * FROM vvocr.document_processing_results 
        WHERE result_id = @resultId
      `);

    const record = result.recordset[0];

    // Only exit when processing is truly finished (completed or permanently failed)
    // Don't exit on transient 'failed' states during processing
    if (record) {
      if (record.processing_status === "completed") {
        await pool.close();
        return record;
      }

      // Only exit on failed if it's been in failed state for >10 seconds
      // (to avoid exiting on transient errors during retry logic)
      if (record.processing_status === "failed") {
        // Check if there's been any recent update
        const timeSinceUpdate = new Date().getTime() - new Date(record.updated_at).getTime();
        if (timeSinceUpdate > 10000) {
          await pool.close();
          return record;
        }
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second
  }

  await pool.close();
  throw new Error(`Processing timed out for result ID: ${resultId}`);
};

describe("E2E Tests - Upload → Process → Verify", () => {
  beforeAll(() => {
    if (!DB_CONNECTION_STRING) {
      throw new Error("E2E tests require real database connection string in local.settings.json");
    }
  });

  // afterAll(async () => {
  //   // Clean up test data
  //   console.log("\n🧹 Cleaning up test data...");
  //   const pool = new sql.ConnectionPool(DB_CONNECTION_STRING);
  //   await pool.connect();

  //   await pool.request().query(`
  //     DELETE FROM vvocr.document_processing_results
  //     WHERE document_path LIKE 'e2e-test-%' OR document_path LIKE 'concurrent-vendor-%'
  //   `);

  //   await pool.close();
  //   console.log("✅ Test data cleaned up");
  // });

  it("should upload, process PDF, and store results in database", async () => {
    // 1. Upload file
    const testFile = readFileSync(join(__dirname, "../docs/samplePDF.pdf"));
    const formData = new FormData();
    formData.append("file", new Blob([testFile], { type: "application/pdf" }), "samplePDF.pdf");
    formData.append("vendorId", "e2e-test-vendor");

    const uploadResponse = await fetch(UPLOAD_ENDPOINT, {
      method: "POST",
      body: formData,
    });

    expect(uploadResponse.status).toBe(201);
    const uploadResult = await uploadResponse.json();
    expect(uploadResult).toHaveProperty("resultId");
    expect(uploadResult).toHaveProperty("filePath");
    expect(uploadResult.vendorId).toBe("e2e-test-vendor");

    console.log("✅ Upload successful:", uploadResult);

    // 2. Wait for processing to complete
    console.log("⏳ Waiting for document processing...");
    const dbRecord = await waitForProcessing(uploadResult.resultId);
    console.log("✅ Document processed:", { status: dbRecord.processing_status });
    // 3. Verify database record
    // expect(dbRecord.processing_status).toBe("completed");
    expect(dbRecord.document_name).toBe("samplePDF.pdf");
    expect(dbRecord.doc_intel_extracted_text).toBeTruthy();
    expect(dbRecord.doc_intel_page_count).toBeGreaterThan(0);
    // expect(dbRecord.ai_model_analysis).toBeTruthy(); // OpenAI results
    // ai_total_tokens may be null if not tracked
    if (dbRecord.ai_total_tokens) {
      expect(dbRecord.ai_total_tokens).toBeGreaterThan(0);
    }

    console.log("✅ Processing complete:", {
      status: dbRecord.processing_status,
      pages: dbRecord.doc_intel_page_count,
      tables: dbRecord.doc_intel_table_count,
      tokens: dbRecord.ai_total_tokens,
    });

    // 4. Display extracted product mapping and confidence levels
    console.log("\n📊 OCR Confidence Score:", dbRecord.doc_intel_confidence_score || "N/A");
    console.log("🤖 AI Model:", dbRecord.ai_model_used);
    console.log("🎯 AI Confidence Score:", dbRecord.ai_confidence_score || "N/A");

    if (dbRecord.ai_model_analysis) {
      try {
        const extractedData = JSON.parse(dbRecord.ai_model_analysis);
        console.log("\n📦 Extracted Product Data:");
        console.log(`   Vendor: ${extractedData.vendor || "N/A"}`);
        console.log(`   Total Products: ${extractedData.products?.length || 0}`);

        if (extractedData.products && extractedData.products.length > 0) {
          console.log("\n   Sample Products (first 3):");
          extractedData.products.slice(0, 3).forEach((product: any, idx: number) => {
            console.log(`   ${idx + 1}. ${product.name || product.sku}`);
            console.log(`      SKU: ${product.sku || "N/A"}`);
            console.log(`      Price: $${product.price || "N/A"}`);
            console.log(`      Unit: ${product.unit || "N/A"}`);
          });

          if (extractedData.products.length > 3) {
            console.log(`   ... and ${extractedData.products.length - 3} more products`);
          }
        }
      } catch (err: any) {
        console.error("⚠️  Failed to parse AI model analysis JSON:", err.message);
        console.log("   JSON length:", dbRecord.ai_model_analysis.length);
        console.log("   JSON preview:", dbRecord.ai_model_analysis.substring(0, 200));
      }
    }
  }, 90000); // 90 second timeout - Document Intelligence OCR + GPT-4o takes ~60s

  it.skip("should handle Excel file upload and processing (SKIPPED: Document Intelligence doesn't support Excel)", async () => {
    const testFile = readFileSync(join(__dirname, "../docs/sampleXLSX.xlsx"));
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([testFile], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      "products.xlsx"
    );
    formData.append("vendorId", "e2e-test-vendor-excel");

    const uploadResponse = await fetch(UPLOAD_ENDPOINT, {
      method: "POST",
      body: formData,
    });

    expect(uploadResponse.status).toBe(201);
    const uploadResult = await uploadResponse.json();

    console.log("✅ Excel upload successful:", uploadResult);

    const dbRecord = await waitForProcessing(uploadResult.resultId);
    expect(dbRecord.processing_status).toBe("completed");
    expect(dbRecord.document_name).toBe("products.xlsx");

    console.log("✅ Excel processing complete");
  }, 60000);

  it.skip("should reject unsupported file types", async () => {
    const testFile = Buffer.from("This is a plain text file");
    const formData = new FormData();
    formData.append("file", new Blob([testFile], { type: "text/plain" }), "test.txt");
    formData.append("vendorId", "e2e-test-vendor");

    const uploadResponse = await fetch(UPLOAD_ENDPOINT, {
      method: "POST",
      body: formData,
    });

    expect(uploadResponse.status).toBe(400);
    const errorText = await uploadResponse.text();
    expect(errorText).toContain("Unsupported file type");
  });

  it.skip("should handle multiple concurrent uploads", async () => {
    const testFile = readFileSync(join(__dirname, "../docs/samplePDF.pdf"));

    const uploads = Array.from({ length: 3 }, (_, i) => {
      const formData = new FormData();
      formData.append(
        "file",
        new Blob([testFile], { type: "application/pdf" }),
        `samplePDF-${i}.pdf`
      );
      formData.append("vendorId", `concurrent-vendor-${i}`);

      return fetch(UPLOAD_ENDPOINT, {
        method: "POST",
        body: formData,
      });
    });

    const responses = await Promise.all(uploads);
    const results = await Promise.all(responses.map((r) => r.json()));

    expect(results).toHaveLength(3);
    results.forEach((result) => {
      expect(result).toHaveProperty("resultId");
      expect(result.filePath).toMatch(/concurrent-vendor-\d\//);
    });

    console.log("✅ Concurrent uploads successful:", results.length);
  }, 60000);
});
