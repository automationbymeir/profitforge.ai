import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { createAIService } from '../../../services/index.js';
import { DEFAULT_AI_MODEL, DEFAULT_AI_PROMPT } from '../../../utils/constants.js';
import { withCors } from '../common/middleware/cors.js';

/**
 * GET /api/ai-config/deployments
 *
 * Returns list of available Azure OpenAI model deployments with metadata:
 * - Deployment name
 * - Model name
 * - Display name
 * - Pricing (input/output cost per 1M tokens)
 * - Context window size
 * - Capabilities
 * - Recommended flag
 * - Current status
 *
 * This allows the UI to dynamically discover available models instead of
 * hardcoding them, ensuring the list stays in sync with Azure deployments.
 */
async function listAiDeploymentsCore(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log('List AI deployments request received');

  try {
    const aiService = await createAIService();
    const deployments = await aiService.listAvailableModels();

    return {
      status: 200,
      jsonBody: {
        deployments,
        defaultModel: DEFAULT_AI_MODEL,
        defaultPrompt: DEFAULT_AI_PROMPT,
        totalDeployments: deployments.length,
      },
    };
  } catch (error: any) {
    context.error('Failed to list AI deployments:', error);
    return {
      status: 500,
      jsonBody: {
        error: 'Failed to retrieve AI deployments',
        message: error.message,
      },
    };
  }
}

// Wrap with middleware and register
const listAiDeployments = withCors(listAiDeploymentsCore);

app.http('listAiDeployments', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'ai-config/deployments',
  handler: listAiDeployments,
});

export default listAiDeployments;
