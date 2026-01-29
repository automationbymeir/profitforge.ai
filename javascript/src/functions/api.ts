import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { withAuth, withCors, withErrorHandler, withRateLimit } from '../middleware/index.js';
import { getDocumentService, getVendorService, getVersionService } from '../services/index.js';
import { errorResponse, successResponse } from '../utils/httpHelpers.js';
import {
  cleanupOldUsageRecords,
  getUsageStats,
  initializeUsageTable,
} from '../utils/usageTracker.js';

// Initialize table on cold start - in client this is also executed!
initializeUsageTable().catch((err) => console.error('Failed to init usage table:', err));

// Connection strings from environment variables
const _STORAGE_ACCOUNT_NAME = process.env.STORAGE_ACCOUNT_NAME;
const _SQL_CONNECTION_STRING = process.env.SQL_CONNECTION_STRING;

/**
 * Upload Handler Core - Business logic for document uploads
 */
async function uploadHandlerCore(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log(`Processing upload request for ${req.url}`);

  // Extract client IP for usage tracking
  const clientIp =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';

  const formData = await req.formData();
  const file = formData.get('file') as File;
  const vendorName = formData.get('vendorName') as string;

  if (!file || !vendorName) {
    return errorResponse('Missing file or vendor name in request', 400);
  }

  try {
    // Use DocumentService for upload logic
    const documentService = getDocumentService();
    const result = await documentService.upload(file, vendorName, clientIp);

    return successResponse(
      {
        message: 'Document uploaded successfully',
        ...result,
      },
      201
    );
  } catch (error: unknown) {
    // Handle custom error codes from service
    if (error instanceof Error && 'statusCode' in error) {
      const customError = error as Error & { statusCode: number; details?: unknown };
      if (customError.details) {
        return errorResponse(
          error.message,
          customError.statusCode,
          JSON.stringify(customError.details)
        );
      }
      return errorResponse(error.message, customError.statusCode);
    }
    throw error;
  }
}

/**
 * Upload Handler - HTTP POST endpoint with middleware
 * Middleware: Error Handler → CORS → Auth → Rate Limit → Business Logic
 */
export const uploadHandler = withErrorHandler(withCors(withAuth(withRateLimit(uploadHandlerCore))));

app.http('upload', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: uploadHandler,
});

/**
 * Delete Vendor Handler Core - Business logic for vendor cleanup
 */
async function deleteVendorHandlerCore(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log(`Processing delete request for ${req.url}`);

  const vendorName = req.query.get('vendorName');

  if (!vendorName) {
    return errorResponse('Missing vendorName query parameter', 400);
  }

  try {
    // Use VendorService for deletion logic
    const vendorService = getVendorService();
    const result = await vendorService.deleteVendor(vendorName);

    return successResponse({
      message: `Vendor ${result.vendorName} deleted successfully`,
      documentsDeleted: result.documentsDeleted,
      blobsDeleted: result.blobsDeleted,
    });
  } catch (error: unknown) {
    // Handle custom error codes from service
    if (error instanceof Error && 'statusCode' in error) {
      const customError = error as Error & { statusCode: number };
      // For 404 errors, include message field for consistency
      if (customError.statusCode === 404) {
        return errorResponse('Not Found', 404, error.message);
      }
      return errorResponse(error.message, customError.statusCode);
    }
    throw error;
  }
}

/**
 * Delete Vendor Handler - HTTP DELETE endpoint with middleware
 * Middleware: Error Handler → CORS → Business Logic
 */
export const deleteVendorHandler = withErrorHandler(withCors(deleteVendorHandlerCore));

app.http('deleteVendor', {
  methods: ['DELETE', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: deleteVendorHandler,
});

/**
 * Reprocess Mapping Handler - HTTP POST endpoint to rerun AI mapping
 */
async function reprocessMappingHandlerCore(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log(`Reprocess mapping request received`);

  const body = (await req.json()) as { documentId?: string };
  const documentId = body.documentId;

  if (!documentId) {
    return errorResponse('Missing documentId in request body', 400);
  }

  try {
    // Use DocumentService for reprocessing logic
    const documentService = getDocumentService();
    const result = await documentService.reprocess(documentId);

    context.log(
      `✅ Created new version record: ${result.newResultId} (v${result.version} of ${result.parentDocumentId})`
    );

    return successResponse({
      message: `New version created for remapping (v${result.version})`,
      originalDocumentId: documentId,
      newResultId: result.newResultId,
      version: result.version,
      parentDocumentId: result.parentDocumentId,
      nextStep: 'AI mapping will be queued automatically',
    });
  } catch (error: unknown) {
    // Handle custom error codes from service
    if (error instanceof Error && 'statusCode' in error) {
      const customError = error as Error & { statusCode: number };
      return errorResponse(error.message, customError.statusCode);
    }
    throw error;
  }
}

export const reprocessMappingHandler = withErrorHandler(withCors(reprocessMappingHandlerCore));

app.http('reprocessMapping', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: reprocessMappingHandler,
});

/**
 * Confirm Mapping Handler - HTTP POST endpoint to export products to production
 */
async function confirmMappingHandlerCore(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log(`Confirm mapping request received`);

  const body = (await req.json()) as { documentId?: string };
  const documentId = body.documentId;

  if (!documentId) {
    return errorResponse('Missing documentId in request body', 400);
  }

  try {
    // Use DocumentService for confirmation logic
    const documentService = getDocumentService();
    const result = await documentService.confirmMapping(documentId);

    context.log(
      `✅ Exported ${result.productsExported} products to production for vendor ${result.vendor}`
    );

    return successResponse({
      message: 'Products exported to production successfully',
      documentId: result.documentId,
      vendor: result.vendor,
      productsExported: result.productsExported,
    });
  } catch (error: unknown) {
    // Handle custom error codes from service
    if (error instanceof Error && 'statusCode' in error) {
      const customError = error as Error & { statusCode: number };
      return errorResponse(error.message, customError.statusCode);
    }
    throw error;
  }
}

export const confirmMappingHandler = withErrorHandler(withCors(confirmMappingHandlerCore));

app.http('confirmMapping', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: confirmMappingHandler,
});

/**
 * Get Version History Handler - HTTP GET endpoint for document versions
 */
async function getVersionHistoryHandlerCore(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log(`Get version history request received`);

  const documentId = req.query.get('documentId');

  if (!documentId) {
    return errorResponse('Missing documentId query parameter', 400);
  }

  try {
    // Use VersionService for history retrieval
    const versionService = getVersionService();
    const result = await versionService.getHistory(documentId);

    return successResponse(result);
  } catch (error: unknown) {
    // Handle custom error codes from service
    if (error instanceof Error && 'statusCode' in error) {
      const customError = error as Error & { statusCode: number };
      return errorResponse(error.message, customError.statusCode);
    }
    throw error;
  }
}

export const getVersionHistoryHandler = withErrorHandler(withCors(getVersionHistoryHandlerCore));

app.http('getVersionHistory', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: getVersionHistoryHandler,
});

/**
 * Delete Specific Run Handler - HTTP DELETE endpoint for single version
 */
async function deleteRunHandlerCore(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log(`Delete run request received`);

  const documentId = req.query.get('documentId');

  if (!documentId) {
    return errorResponse('Missing documentId query parameter', 400);
  }

  try {
    // Use VersionService for run deletion
    const versionService = getVersionService();
    const result = await versionService.deleteRun(documentId);

    context.log(`✅ Deleted run version ${result.version}`);

    return successResponse({
      message: `Run version ${result.version} deleted successfully`,
      documentId: result.documentId,
      version: result.version,
    });
  } catch (error: unknown) {
    // Handle custom error codes from service
    if (error instanceof Error && 'statusCode' in error) {
      const customError = error as Error & { statusCode: number };
      return errorResponse(error.message, customError.statusCode);
    }
    throw error;
  }
}

export const deleteRunHandler = withErrorHandler(withCors(deleteRunHandlerCore));

app.http('deleteRun', {
  methods: ['DELETE', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: deleteRunHandler,
});

/**
 * Delete Document Handler - HTTP DELETE endpoint to remove document and ALL versions
 *
 * PROCESS:
 * 1. Extract documentId from query parameters
 * 2. Determine root parent ID
 * 3. Delete blob from storage (original PDF)
 * 4. Delete ALL database records (root + all reprocessing versions)
 * 5. Return summary
 *
 * USE CASE:
 * - Complete removal of document and processing history
 * - Deletes all versions in the reprocessing chain
 */
/**
 * Delete Document Handler - HTTP DELETE endpoint to remove document and ALL versions
 */
async function deleteDocumentHandlerCore(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log(`Delete document request received`);

  const documentId = req.query.get('documentId');

  if (!documentId) {
    return errorResponse('Missing documentId query parameter', 400);
  }

  try {
    // For now, use DocumentService.deleteDocument which handles single document deletion
    // TODO: In Phase 3 refactoring, enhance DocumentService to handle cascade deletion of all versions
    const documentService = getDocumentService();
    const result = await documentService.deleteDocument(documentId);

    context.log(`✅ Deleted document with ${result.documentsDeleted} record(s)`);

    return successResponse({
      message: 'Document deleted successfully',
      documentsDeleted: result.documentsDeleted,
      blobsDeleted: result.blobsDeleted,
    });
  } catch (error: unknown) {
    // Handle custom error codes from service
    if (error instanceof Error && 'statusCode' in error) {
      const customError = error as Error & { statusCode: number };
      return errorResponse(error.message, customError.statusCode);
    }
    throw error;
  }
}

export const deleteDocumentHandler = withErrorHandler(withCors(deleteDocumentHandlerCore));

app.http('deleteDocument', {
  methods: ['DELETE', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: deleteDocumentHandler,
});

/**
 * Demo endpoint for usage tracking cleanup and stats
 *
 * GET /api/demo/usage - Get usage statistics
 * POST /api/demo/cleanup?daysToKeep=30 - Trigger cleanup
 *
 */
async function demoUsageHandlerCore(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  if (req.method === 'GET') {
    // Get usage stats
    const stats = await getUsageStats();
    return successResponse({
      stats,
      message: 'Usage statistics retrieved',
    });
  } else if (req.method === 'POST') {
    // Trigger cleanup
    const daysToKeep = parseInt(req.query.get('daysToKeep') || '30');

    context.log(`🧹 Cleanup triggered: keeping ${daysToKeep} days`);

    const statsBefore = await getUsageStats();
    const cleanupResult = await cleanupOldUsageRecords(daysToKeep);
    const statsAfter = await getUsageStats();

    return successResponse({
      message: 'Cleanup completed successfully',
      daysRetained: daysToKeep,
      deleted: cleanupResult,
      before: statsBefore,
      after: statsAfter,
    });
  }

  return errorResponse('Method not allowed', 405);
}

const demoUsageHandler = withErrorHandler(withCors(demoUsageHandlerCore));

app.http('demoUsage', {
  methods: ['GET', 'POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'demo/usage',
  handler: demoUsageHandler,
});
