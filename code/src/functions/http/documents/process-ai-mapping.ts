import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { createRunService } from '../../../services/index.js';
import { errorResponse, successResponse } from '../../../utils/httpHelpers.js';
import { withCors, withErrorHandler } from '../common/middleware/index.js';

/**
 * Process AI Mapping Handler - HTTP POST endpoint for AI-based product extraction
 *
 * Creates a NEW processing run with copied OCR metadata and queues AI mapping.
 * This allows testing different AI models/prompts without re-running expensive OCR.
 *
 * Optional parameters:
 * - aiModel: Custom AI model to use (e.g., 'gpt-4', 'gpt-4o-mini')
 * - aiPrompt: Custom AI prompt for extraction
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

  try {
    // Parse optional custom parameters from request body
    let aiModel: string | undefined;
    let aiPrompt: string | undefined;

    try {
      const body = (await req.json()) as { aiModel?: string; aiPrompt?: string };
      aiModel = body?.aiModel;
      aiPrompt = body?.aiPrompt;
    } catch {
      // No body or invalid JSON - use defaults
    }

    // Use RunService to create new run with copied OCR metadata and queue AI mapping
    const runService = await createRunService();
    const result = await runService.createAIRun(vendorName, aiModel, aiPrompt);

    context.log(`✅ Created new AI mapping run ${result.runId} for vendor ${vendorName}`);

    const response: Record<string, unknown> = {
      message: 'New AI mapping run created with copied OCR results',
      vendorName,
      runId: result.runId,
      status: result.status,
      nextStep: 'AI mapping will begin shortly. New run created.',
    };

    if (aiModel) {
      response.aiModel = aiModel;
    }
    if (aiPrompt) {
      response.aiPrompt = aiPrompt;
    }

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
