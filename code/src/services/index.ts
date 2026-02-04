// Service exports
export {
  createDocumentService,
  DocumentService,
  type ConfirmResult,
  type DeleteResult,
  type DocumentInfo,
  type ReprocessResult,
  type UploadResult,
} from './document-service.js';

export {
  getVersionService,
  VersionService,
  type DeleteRunResult,
  type VersionHistoryResult,
  type VersionInfo,
} from './version-service.js';

export { AIService, createAIService, type AIMappingResult, type Product } from './ai-service.js';

export { createOCRService, OCRService, type OCRResult } from './ocr-service.js';

export { StorageService } from '../data/storage.js';
