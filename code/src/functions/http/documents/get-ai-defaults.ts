import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import {
  DEFAULT_AI_MODEL,
  DEFAULT_AI_PROMPT,
  SUPPORTED_AI_MODELS,
} from '../../../utils/constants.js';
import { successResponse } from '../../../utils/httpHelpers.js';
import { withCors, withErrorHandler } from '../common/middleware/index.js';

/**
 * Get AI Defaults Handler - HTTP GET endpoint to retrieve default AI configuration
 *
 * Returns:
 * - Default AI model
 * - Default AI prompt (for UI reference)
 * - List of supported models
 *
 * This allows UI to display defaults and supported options for custom AI processing
 */
async function getAiDefaultsHandlerCore(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log('Get AI defaults request received');

  return successResponse({
    defaultModel: DEFAULT_AI_MODEL,
    defaultPrompt: DEFAULT_AI_PROMPT,
    supportedModels: SUPPORTED_AI_MODELS,
  });
}

export const getAiDefaultsHandler = withErrorHandler(withCors(getAiDefaultsHandlerCore));

app.http('getAiDefaults', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'ai-config/defaults',
  handler: getAiDefaultsHandler,
});
