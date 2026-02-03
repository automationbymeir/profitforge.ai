import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'integration',
    include: ['test/integration/**/*.integration.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    globals: true,
    environment: 'node',
    setupFiles: ['test/integration/setup/setup.integration.ts'],
    globalSetup: ['test/integration/setup/setup.global.integration.ts'],
    env: {
      TEST_MODE: 'integration',
    },
    // Longer timeouts for database/storage operations
    testTimeout: 30000,
    hookTimeout: 30000,
    // Sequential execution to avoid database conflicts
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../../src'),
    },
  },
});
