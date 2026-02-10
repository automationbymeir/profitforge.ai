import * as XLSX from 'xlsx';
import type { DocumentRepository } from '../data/repositories/DocumentRepository.js';
import type { StorageService } from '../data/storage.js';

/**
 * Benchmark product structure matching expected export columns
 */
export interface BenchmarkProduct {
  product_name: string;
  sku: string;
  price: number;
  unit?: string;
  description?: string;
}

/**
 * Stored benchmark data structure
 */
export interface BenchmarkData {
  vendorName: string;
  uploadedAt: string;
  products: BenchmarkProduct[];
}

/**
 * Grading result with scoring metrics
 */
export interface GradeResult {
  runId: string;
  vendorName: string;
  benchmarkProductCount: number;
  extractedProductCount: number;
  matchedProductCount: number;
  precision: number; // matched / extracted
  recall: number; // matched / expected
  f1Score: number; // harmonic mean of precision and recall
  fieldAccuracy: {
    sku: number;
    name: number;
    price: number;
    unit: number;
    description: number;
  };
  missingSkus: string[]; // Expected but not extracted
  extraSkus: string[]; // Extracted but not in benchmark
}

/**
 * Service for managing benchmark data and grading runs
 */
export class BenchmarkService {
  private readonly CONTAINER = 'uploads';

  constructor(
    private storageService: StorageService,
    private documentRepo: DocumentRepository
  ) {}

  /**
   * Upload and store benchmark Excel file as JSON
   *
   * No column validation - benchmark is for grading OCR accuracy, not enforcing schema.
   * Flexibly maps common column name variations to standard fields.
   * Missing fields are allowed and stored as empty values.
   */
  async uploadBenchmark(
    file: File,
    vendorName: string
  ): Promise<{ vendorName: string; productCount: number; path: string }> {
    // Parse Excel file
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

    if (workbook.SheetNames.length === 0) {
      throw Object.assign(new Error('Excel file contains no sheets'), {
        statusCode: 400,
        details: { message: 'The uploaded Excel file is empty or invalid' },
      });
    }

    const worksheet = workbook.Sheets[workbook.SheetNames[0]];

    // Parse Excel - first row is automatically treated as column headers
    // Column names can be anything - we'll flexibly match them below
    const rawProducts = XLSX.utils.sheet_to_json<Record<string, string | number>>(worksheet, {
      defval: '', // Default value for empty cells
    });

    if (rawProducts.length === 0) {
      throw Object.assign(new Error('Excel file contains no data rows'), {
        statusCode: 400,
        details: { message: 'The uploaded Excel file has no product data (only headers or empty)' },
      });
    }

    // Normalize column names to handle variations in real vendor files
    const normalizeColumnName = (columnName: string): string => {
      return String(columnName)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_');
    };

    // Map common column name variations to standard names
    const findColumn = (row: Record<string, any>, ...variations: string[]): any => {
      for (const key of Object.keys(row)) {
        const normalizedKey = normalizeColumnName(key);
        for (const variation of variations) {
          if (
            normalizedKey === normalizeColumnName(variation) ||
            normalizedKey.includes(normalizeColumnName(variation))
          ) {
            return row[key];
          }
        }
      }
    };

    // Validate required columns and transform to benchmark format
    const products: BenchmarkProduct[] = rawProducts.map((row, _index) => {
      // Try to find product name using common variations
      const productName = findColumn(
        row,
        'product_name',
        'product name',
        'name',
        'item',
        'item name',
        'description',
        'product'
      );

      // Try to find SKU using common variations
      const sku = findColumn(
        row,
        'sku',
        'item_number',
        'item number',
        'item#',
        'part_number',
        'part number',
        'catalog_number',
        'catalog number',
        'code',
        'item_code'
      );

      // Try to find price using common variations
      const priceValue = findColumn(
        row,
        'price',
        'unit_price',
        'unit price',
        'list_price',
        'list price',
        'cost',
        'amount',
        'wholesale',
        'retail'
      );

      const product: BenchmarkProduct = {
        product_name: String(productName || '').trim(),
        sku: String(sku || '').trim(),
        price: Number(priceValue) || 0,
        unit: findColumn(row, 'unit', 'uom', 'size', 'dimensions')
          ? String(findColumn(row, 'unit', 'uom', 'size', 'dimensions')).trim()
          : undefined,
        description: findColumn(row, 'description', 'notes', 'comments')
          ? String(findColumn(row, 'description', 'notes', 'comments')).trim()
          : undefined,
      };

      return product;
    });

    // Create benchmark data structure
    const benchmarkData: BenchmarkData = {
      vendorName,
      uploadedAt: new Date().toISOString(),
      products,
    };

    // Store as JSON blob
    const jsonBuffer = Buffer.from(JSON.stringify(benchmarkData, null, 2));
    const blobPath = `${vendorName}/benchmark.json`;
    await this.storageService.uploadBlob(this.CONTAINER, blobPath, jsonBuffer, 'application/json');

    return {
      vendorName,
      productCount: products.length,
      path: blobPath,
    };
  }

  /**
   * Get benchmark data for a vendor
   */
  async getBenchmark(vendorName: string): Promise<BenchmarkData | null> {
    const blobPath = `${vendorName}/benchmark.json`;
    const benchmarkBuffer = await this.storageService.downloadBlob(this.CONTAINER, blobPath);

    if (!benchmarkBuffer) {
      return null;
    }

    return JSON.parse(benchmarkBuffer.toString('utf-8'));
  }

  /**
   * Grade a run against its vendor's benchmark
   */
  async gradeBenchmark(runId: string): Promise<GradeResult> {
    // Fetch run document
    const document = await this.documentRepo.findById(runId);
    if (!document) {
      throw Object.assign(new Error('Run not found'), {
        statusCode: 404,
        details: { runId },
      });
    }

    // Parse ai_mapping_result
    if (!document.ai_mapping_result) {
      throw Object.assign(new Error('Run has no AI mapping results'), {
        statusCode: 400,
        details: { runId, status: document.processing_status },
      });
    }

    const aiMapping = JSON.parse(document.ai_mapping_result);
    const extractedProducts = aiMapping.products || [];

    // Load benchmark
    const blobPath = `${document.vendor_name}/benchmark.json`;
    const benchmarkBuffer = await this.storageService.downloadBlob(this.CONTAINER, blobPath);

    if (!benchmarkBuffer) {
      throw Object.assign(new Error('No benchmark found for vendor'), {
        statusCode: 404,
        details: { vendorName: document.vendor_name, expectedPath: blobPath },
      });
    }

    const benchmark: BenchmarkData = JSON.parse(benchmarkBuffer.toString('utf-8'));

    // Perform comparison
    return this.compareProducts(runId, document.vendor_name, benchmark.products, extractedProducts);
  }

  /**
   * Compare benchmark products against extracted products
   * Matching strategy: Match by SKU (primary key)
   */
  private compareProducts(
    runId: string,
    vendorName: string,
    expectedProducts: BenchmarkProduct[],
    extractedProducts: Array<{
      sku?: string;
      name?: string;
      price?: number;
      unit?: string;
      description?: string;
    }>
  ): GradeResult {
    // Create SKU-indexed maps for efficient lookup
    const expectedMap = new Map(expectedProducts.map((p) => [p.sku.toLowerCase(), p]));
    const extractedMap = new Map(
      extractedProducts.map((p) => [String(p.sku || '').toLowerCase(), p])
    );

    // Find matches and calculate metrics
    let matchedCount = 0;
    let skuMatches = 0;
    let nameMatches = 0;
    let priceMatches = 0;
    let unitMatches = 0;
    let descriptionMatches = 0;
    let unitComparisons = 0; // Only count when both have unit
    let descriptionComparisons = 0; // Only count when both have description

    const missingSkus: string[] = [];
    const extraSkus: string[] = [];

    // Check each expected product
    for (const [sku, expectedProduct] of expectedMap.entries()) {
      const extractedProduct = extractedMap.get(sku);

      if (!extractedProduct) {
        missingSkus.push(expectedProduct.sku);
        continue;
      }

      matchedCount++;
      skuMatches++; // SKU matched by definition

      // Compare name
      if (
        String(extractedProduct.name || '')
          .trim()
          .toLowerCase() === expectedProduct.product_name.toLowerCase()
      ) {
        nameMatches++;
      }

      // Compare price (with small tolerance for floating point)
      const expectedPrice = expectedProduct.price;
      const extractedPrice = Number(extractedProduct.price);
      if (!isNaN(extractedPrice) && Math.abs(extractedPrice - expectedPrice) < 0.01) {
        priceMatches++;
      }

      // Compare unit (only if both exist)
      if (expectedProduct.unit || extractedProduct.unit) {
        unitComparisons++;
        const expectedUnit = (expectedProduct.unit || '').trim().toLowerCase();
        const extractedUnit = String(extractedProduct.unit || '')
          .trim()
          .toLowerCase();
        if (expectedUnit === extractedUnit) {
          unitMatches++;
        }
      }

      // Compare description (only if both exist)
      if (expectedProduct.description || extractedProduct.description) {
        descriptionComparisons++;
        const expectedDesc = (expectedProduct.description || '').trim().toLowerCase();
        const extractedDesc = String(extractedProduct.description || '')
          .trim()
          .toLowerCase();
        if (expectedDesc === extractedDesc) {
          descriptionMatches++;
        }
      }
    }

    // Find extra products (extracted but not in benchmark)
    for (const [sku, extractedProduct] of extractedMap.entries()) {
      if (!expectedMap.has(sku)) {
        extraSkus.push(String(extractedProduct.sku || ''));
      }
    }

    // Calculate scores
    const precision = extractedProducts.length > 0 ? matchedCount / extractedProducts.length : 0;
    const recall = expectedProducts.length > 0 ? matchedCount / expectedProducts.length : 0;
    const f1Score = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    return {
      runId,
      vendorName,
      benchmarkProductCount: expectedProducts.length,
      extractedProductCount: extractedProducts.length,
      matchedProductCount: matchedCount,
      precision: Math.round(precision * 10000) / 100, // Convert to percentage with 2 decimals
      recall: Math.round(recall * 10000) / 100,
      f1Score: Math.round(f1Score * 10000) / 100,
      fieldAccuracy: {
        sku: matchedCount > 0 ? Math.round((skuMatches / matchedCount) * 10000) / 100 : 0,
        name: matchedCount > 0 ? Math.round((nameMatches / matchedCount) * 10000) / 100 : 0,
        price: matchedCount > 0 ? Math.round((priceMatches / matchedCount) * 10000) / 100 : 0,
        unit: unitComparisons > 0 ? Math.round((unitMatches / unitComparisons) * 10000) / 100 : 0,
        description:
          descriptionComparisons > 0
            ? Math.round((descriptionMatches / descriptionComparisons) * 10000) / 100
            : 0,
      },
      missingSkus,
      extraSkus,
    };
  }
}

/**
 * Factory function for creating BenchmarkService with production dependencies
 */
export async function createBenchmarkService(): Promise<BenchmarkService> {
  const { StorageService } = await import('../data/storage.js');
  const { DocumentRepository } = await import('../data/repositories/DocumentRepository.js');
  const { getStorageConnectionString } = await import('../utils/config.js');
  const { getConnectionPool } = await import('../utils/database.js');

  const storageService = new StorageService(getStorageConnectionString());
  const pool = await getConnectionPool();
  const documentRepo = new DocumentRepository(pool);

  return new BenchmarkService(storageService, documentRepo);
}
