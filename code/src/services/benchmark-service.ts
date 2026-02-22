import * as XLSX from 'xlsx';
import type { StorageService } from '../data/storage.js';
import { Product } from '../utils/models/product.js';

/**
 * Stored benchmark data structure
 */
export interface BenchmarkData {
  vendorName: string;
  uploadedAt: string;
  products: Product[]; // Dynamic fields matching extracted products
}

/**
 * Service for managing benchmark data
 */
export class BenchmarkService {
  private readonly CONTAINER = 'uploads';

  constructor(private storageService: StorageService) {}

  /**
   * Upload and store benchmark Excel file as JSON with dynamic columns
   *
   * Preserves Excel column headers exactly as they appear to match
   * the dynamic column detection in extracted products from OCR/AI.
   *
   * This allows the grading service to compare apples-to-apples regardless
   * of what column names the vendor uses.
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
    // Store products with dynamic fields preserving original column names
    const rawProducts = XLSX.utils.sheet_to_json<Record<string, string | number>>(worksheet, {
      defval: '', // Default value for empty cells
      raw: false, // Convert everything to strings initially for consistent handling
    });

    if (rawProducts.length === 0) {
      throw Object.assign(new Error('Excel file contains no data rows'), {
        statusCode: 400,
        details: { message: 'The uploaded Excel file has no product data (only headers or empty)' },
      });
    }

    // Convert raw products to dynamic Product format
    // Preserve original column names exactly as they appear in Excel
    const products: Product[] = rawProducts.map((row) => {
      const product: Product = {};

      for (const [key, value] of Object.entries(row)) {
        // Trim the key to remove leading/trailing spaces
        const trimmedKey = key.trim();

        if (trimmedKey && value !== null && value !== undefined && value !== '') {
          // Try to parse as number if it looks like a price/cost/numeric field
          if (typeof value === 'string') {
            const trimmedValue = value.trim();
            // Check if it's a number (with optional currency symbols and commas)
            const numMatch = trimmedValue.match(/^[$€£¥]?\s*([\d,]+\.?\d*)$/);
            if (numMatch) {
              const numValue = Number(numMatch[1].replace(/,/g, ''));
              if (!isNaN(numValue)) {
                product[trimmedKey] = numValue;
              } else {
                product[trimmedKey] = trimmedValue;
              }
            } else {
              product[trimmedKey] = trimmedValue;
            }
          } else if (typeof value === 'number') {
            product[trimmedKey] = value;
          } else {
            product[trimmedKey] = String(value).trim();
          }
        }
      }

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
}

/**
 * Factory function for creating BenchmarkService with production dependencies
 */
export async function createBenchmarkService(): Promise<BenchmarkService> {
  const { StorageService } = await import('../data/storage.js');
  const { getStorageConnectionString } = await import('../utils/config.js');

  const storageService = new StorageService(getStorageConnectionString());

  return new BenchmarkService(storageService);
}
