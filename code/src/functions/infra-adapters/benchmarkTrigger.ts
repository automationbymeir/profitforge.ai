import { app, InvocationContext } from '@azure/functions';
import { createGradingService } from '../../services/grading-service.js';

/**
 * Blob trigger for benchmark.json uploads
 *
 * When a benchmark.json file is uploaded to {vendorName}/benchmark.json:
 * 1. Extract vendor name from blob path
 * 2. Find all completed processing runs for that vendor
 * 3. Grade each run against the new benchmark
 * 4. Store grading results in database
 */
export async function benchmarkUploadTrigger(
  blob: Buffer,
  context: InvocationContext
): Promise<void> {
  try {
    // Extract blob path from trigger metadata (handles both 'name' and 'uri'/'url')
    const metadata = context.triggerMetadata as Record<string, unknown> | undefined;

    if (!metadata) {
      context.log('⚠️ Trigger metadata is undefined');
      return;
    }

    // Try 'name' first (just the path within container)
    let blobPath = metadata.name as string;

    // If no 'name', try 'uri' or 'url' and extract the path
    if (!blobPath) {
      const blobUrl = (metadata.uri || metadata.url) as string;
      if (blobUrl) {
        // Extract path from full URL: https://account.blob.core.windows.net/container/vendorName/benchmark.json
        const urlParts = blobUrl.split('/');
        const uploadsIndex = urlParts.indexOf('uploads');
        if (uploadsIndex !== -1 && urlParts.length > uploadsIndex + 1) {
          // Get everything after 'uploads/' container
          blobPath = urlParts.slice(uploadsIndex + 1).join('/');
        }
      }
    }

    if (!blobPath) {
      context.log('⚠️ Could not extract blob path from trigger metadata');
      return;
    }

    context.log(`🔔 Benchmark upload detected: ${blobPath}`);

    // Extract vendor name from path (format: {vendorName}/benchmark.json)
    const pathParts = blobPath.split('/');
    if (pathParts.length !== 2 || pathParts[1] !== 'benchmark.json') {
      context.log(
        `⚠️ Ignoring blob - expected format is {vendorName}/benchmark.json, got: ${blobPath}`
      );
      return;
    }

    const vendorName = pathParts[0];
    context.log(`📊 Grading all runs for vendor: ${vendorName}`);

    // Create grading service
    const gradingService = await createGradingService();

    // Grade all runs for this vendor
    const results = await gradingService.gradeAllRunsForVendor(vendorName);

    context.log(
      `✅ Graded ${results.length} processing runs for vendor ${vendorName} against new benchmark`
    );

    // Log summary of results
    results.forEach((result) => {
      context.log(
        `  Run ${result.runId}: Accuracy=${result.metrics.accuracy}%, ` +
          `Precision=${result.metrics.precision}%, Recall=${result.metrics.recall}%`
      );
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    context.error(`❌ Benchmark grading failed: ${errorMessage}`);
    // Don't throw - we don't want the trigger to retry indefinitely
    // Manual grading can be triggered via API if needed
  }
}

// Register blob trigger for benchmark uploads
app.storageBlob('benchmarkUploadTrigger', {
  path: 'uploads/{vendorName}/benchmark.json',
  connection: 'STORAGE_CONNECTION_STRING',
  handler: benchmarkUploadTrigger,
});
