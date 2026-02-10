import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Serve static client files (HTML, CSS, JS)
 * Route: /client/{*path}
 */
app.http('serveClient', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'client/{*filePath}',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const filePath = request.params.filePath || 'index.html';
    context.log(`Serving client file: ${filePath}`);

    // Resolve to client directory
    // In Azure: /home/site/wwwroot/client
    // In local dev: <workspace>/code/client
    const rootDir = process.env.WEBSITE_INSTANCE_ID
      ? '/home/site/wwwroot' // Azure Functions deployment
      : path.join(__dirname, '../../..'); // Local development

    const clientDir = path.join(rootDir, 'client');
    const fullPath = path.join(clientDir, filePath);

    context.log(`Root dir: ${rootDir}`);
    context.log(`Client dir: ${clientDir}`);
    context.log(`Full path: ${fullPath}`);

    // Security: Prevent directory traversal
    if (!fullPath.startsWith(clientDir)) {
      return {
        status: 403,
        body: 'Forbidden',
      };
    }

    // Check if file exists
    if (!fs.existsSync(fullPath)) {
      context.log(`File not found: ${fullPath}`);
      return {
        status: 404,
        body: 'File not found',
      };
    }

    // Read file
    const fileContent = fs.readFileSync(fullPath);

    // Determine content type
    const ext = path.extname(filePath).toLowerCase();
    const contentTypes: Record<string, string> = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
    };

    const contentType = contentTypes[ext] || 'text/plain';

    return {
      status: 200,
      headers: {
        'Content-Type': contentType,
      },
      body: fileContent,
    };
  },
});
