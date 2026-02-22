import { DocumentRepository } from '../data/repositories/DocumentRepository.prisma.js';
import { StorageService } from '../data/storage.js';
import { getStorageConnectionString } from '../utils/config.js';
import { calculateGrade, GradingResult } from '../utils/grading-helper.js';

/**
 * GradingService - Deterministic grading and analysis for processing runs
 *
 * Compares processing run outputs against benchmark data to:
 * - Compute structural similarity metrics
 * - Generate grading scores (precision, recall, F1, accuracy)
 * - Identify correct matches, misses, and false positives
 * - Analyze column mapping accuracy
 */
export class GradingService {
  private storageService: StorageService;
  private documentRepo: DocumentRepository;

  constructor(storageService: StorageService, documentRepo: DocumentRepository) {
    this.storageService = storageService;
    this.documentRepo = documentRepo;
  }

  /**
   * Grade a processing run against benchmark data
   */
  async gradeRun(runId: string): Promise<GradingResult> {
    // 1. Retrieve run data
    const document = await this.documentRepo.findById(runId);
    if (!document) {
      throw new Error(`Processing run ${runId} not found`);
    }

    if (!document.ai_mapping_result) {
      throw new Error(`Processing run ${runId} has no AI mapping results`);
    }

    // 2. Check if benchmark exists
    const benchmarkPath = `${document.vendor_name}/benchmark.json`;
    const documentsContainer = process.env.STORAGE_CONTAINER_DOCUMENTS || 'uploads';

    const benchmarkBlob = await this.storageService.downloadBlob(documentsContainer, benchmarkPath);
    if (!benchmarkBlob) {
      throw new Error(`No benchmark found for vendor ${document.vendor_name} at ${benchmarkPath}`);
    }

    const result: GradingResult = calculateGrade(benchmarkBlob, document);

    // 9. Store grading results in database
    await this.documentRepo.updateGradingResults({
      result_id: runId,
      grading_results: JSON.stringify(result.metrics),
      grading_analysis: JSON.stringify(result.analysis),
      graded_at: result.gradedAt,
    });

    return result;
  }

  /**
   * Grade all processing runs for a vendor against benchmark
   */
  async gradeAllRunsForVendor(vendorName: string): Promise<GradingResult[]> {
    // Find all completed runs for this vendor
    const runs = await this.documentRepo.findByVendor(vendorName);

    const completedRuns = runs.filter(
      (run) =>
        run.processing_status === 'completed' &&
        run.ai_mapping_result &&
        run.ai_mapping_result !== ''
    );

    const results: GradingResult[] = [];

    for (const run of completedRuns) {
      try {
        const gradingResult = await this.gradeRun(run.result_id);
        results.push(gradingResult);
      } catch (error) {
        console.error(`Failed to grade run ${run.result_id}:`, error);
        // Continue with next run
      }
    }

    return results;
  }
}

/**
 * Create a GradingService instance
 */
export async function createGradingService(): Promise<GradingService> {
  const { createDocumentRepository } =
    await import('../data/repositories/DocumentRepository.prisma.js');
  const documentRepo = await createDocumentRepository();
  const storageService = new StorageService(getStorageConnectionString());

  return new GradingService(storageService, documentRepo);
}
