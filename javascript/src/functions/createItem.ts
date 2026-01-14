import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

app.http('CreateItem', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'items', // Custom route: /api/items instead of /api/CreateItem
    handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
        try {
            const body = await request.json() as Record<string, any>;
            
            // Access your resource here (e.g., database, storage, etc.)
            context.log('Creating item:', body);
            
            // Example: save to database, call another service, etc.
            const result = {
                id: Date.now().toString(),
                ...body,
                createdAt: new Date().toISOString()
            };
            
            return {
                status: 201,
                jsonBody: result
            };
        } catch (error) {
            context.error('Error creating item:', error);
            return {
                status: 400,
                body: 'Invalid request body'
            };
        }
    }
});
