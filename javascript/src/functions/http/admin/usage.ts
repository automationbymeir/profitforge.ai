import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { withCors, withErrorHandler } from '../../../middleware/index.js';
import { errorResponse, successResponse } from '../../../utils/httpHelpers.js';
import {
  cleanupOldUsageRecords,
  getUsageStats,
  initializeUsageTable,
} from '../../../utils/usageTracker.js';

// Initialize table on cold start
initializeUsageTable().catch((err) => console.error('Failed to init usage table:', err));

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
