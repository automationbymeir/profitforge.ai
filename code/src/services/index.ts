// Service exports
export {
  createDocumentService,
  DocumentService,
  type DeleteResult,
  type UploadResult,
} from './document-service.js';

export { AIService, createAIService, type AIMappingResult, type Product } from './ai-service.js';

export { createOCRService, OCRService, type OCRResult } from './ocr-service.js';

export { StorageService } from '../data/storage.js';

export {
  createRunService,
  RunService,
  type CreateAIRunResult,
  type CreateOCRRunResult,
  type RunInfo,
} from './run-service.js';
