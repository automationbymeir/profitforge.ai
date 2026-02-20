// Service exports
export {
  createDocumentService,
  DocumentService,
  type DeleteResult,
  type UploadResult,
} from './document-service.js';

export { AIService, createAIService } from './ai-service.js';

export { type Product } from '../utils/models/product.js';
export { createOCRService, OCRService, type OCRResult } from './ocr-service.js';

export { StorageService } from '../data/storage.js';

export {
  createRunService,
  RunService,
  type CreateAIRunResult,
  type CreateOCRRunResult,
  type RunInfo,
} from './run-service.js';

export { createGradingService, GradingService } from './grading-service.js';
