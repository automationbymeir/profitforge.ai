import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "e2e",
    include: ["test/e2e/**/*.e2e.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    globals: true,
    environment: "node",
    setupFiles: ["test/e2e/setup/setup.e2e.ts"],
    globalSetup: ["test/e2e/setup/setup.global.e2e.ts"],
    env: {
      TEST_MODE: "e2e",
    },
    // Very long timeouts for AI processing (can take 60+ seconds)
    testTimeout: 180000,
    hookTimeout: 60000,
    // Sequential execution to avoid interference with real Azure resources
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../../src"),
    },
  },
});
