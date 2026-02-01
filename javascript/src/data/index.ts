/**
 * Data Access Layer - Main Barrel Export
 *
 * This module provides the entry point for all data access operations.
 * Import repositories from this module to access database operations.
 *
 * @example
 * ```typescript
 * import { DocumentRepository, VendorProductRepository } from '../data/index.js';
 *
 * const documentRepo = new DocumentRepository(pool);
 * const document = await documentRepo.findById('abc123');
 * ```
 *
 * @module data
 */

export * from './repositories/index.js';
