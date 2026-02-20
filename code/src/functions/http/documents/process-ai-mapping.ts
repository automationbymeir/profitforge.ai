import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { createRunService } from '../../../services/index.js';
import { errorResponse, successResponse } from '../../../utils/httpHelpers.js';
import { withCors, withErrorHandler } from '../../../utils/middleware/index.js';

/**
 * Process AI Mapping Handler - HTTP POST endpoint for AI-based product extraction
 *
 * Creates a NEW processing run with copied OCR metadata and queues AI mapping.
 * This allows reprocessing with AI without re-running expensive OCR.
 *
 * Uses the default gpt-4o model and prompt configured in ai-service.ts.
 */
async function processAIMappingHandlerCore(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log(`Process AI Mapping request received`);

  const vendorName = req.params.vendorName;

  if (!vendorName) {
    return errorResponse('Missing vendorName in route', 400);
  }

  // Parse request body for optional custom AI parameters
  let aiPrompt: string | undefined;

  try {
    const body = await req.text();
    if (body) {
      const parsed = JSON.parse(body);
      aiPrompt = parsed.aiPrompt;

      // Validate prompt length (max 10k chars)
      if (aiPrompt && aiPrompt.length > 10000) {
        return errorResponse('Custom prompt exceeds maximum length of 10,000 characters', 400);
      }

      context.log(`Custom parameters: promptLength=${aiPrompt?.length || 0}`);
    }
  } catch (_e) {
    // Body parsing failed or body is empty - continue with defaults
    context.log('No custom AI parameters provided, using defaults');
  }

  try {
    // Use RunService to create new run with copied OCR metadata and queue AI mapping
    const runService = await createRunService();
    const result = await runService.createAIRun(vendorName, aiPrompt);

    context.log(`✅ Created new AI mapping run ${result.runId} for vendor ${vendorName}`);

    const response: Record<string, unknown> = {
      message: 'New AI mapping run created with copied OCR results',
      vendorName,
      runId: result.runId,
      status: result.status,
      nextStep: `AI mapping will begin shortly using gpt-4o.`,
      customParameters: {
        promptProvided: !!aiPrompt,
      },
    };

    return successResponse(response);
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

export const processAIMappingHandler = withErrorHandler(withCors(processAIMappingHandlerCore));

app.http('processAIMapping', {
  route: 'documents/{vendorName}/process-ai-mapping',
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: processAIMappingHandler,
});
