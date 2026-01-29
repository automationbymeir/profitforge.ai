import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { withCors, withErrorHandler } from '../middleware/index.js';
import { getAIService } from '../services/index.js';
import { errorResponse, successResponse } from '../utils/httpHelpers.js';

// Type definitions
interface RequestBody {
  documentId: string;
}

/**
 * AI Product Mapper - HTTP POST endpoint for AI-based product extraction
 */
async function aiProductMapperHandlerCore(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log(`AI Product Mapping request received`);

  const body = (await req.json()) as RequestBody;
  const documentId = body.documentId;

  if (!documentId) {
    return errorResponse('Missing documentId in request body', 400);
  }

  try {
    // Use AIService for mapping logic
    const aiService = getAIService();
    const result = await aiService.mapProducts(documentId);

    context.log(`✅ AI Product Mapping complete for document ${documentId}`);

    return successResponse({
      message: 'AI product mapping completed successfully',
      documentId: result.documentId,
      vendor: result.vendor,
      productCount: result.productCount,
      processingDuration: result.processingDuration,
      usage: result.usage,
      cost: result.cost,
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

export const aiProductMapperHandler = withErrorHandler(withCors(aiProductMapperHandlerCore));

app.http('aiProductMapper', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: aiProductMapperHandler,
});
