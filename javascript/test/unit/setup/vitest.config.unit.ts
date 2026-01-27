import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "unit",
    include: ["test/unit/**/*.unit.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    globals: true,
    environment: "node",
    setupFiles: ["test/unit/setup/setup.unit.ts"],
    testTimeout: 10000, // 10 seconds for unit tests
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/", "test/", "**/*.test.ts", "dist/"],
    },
    // Fast parallel execution for unit tests
    poolOptions: {
      threads: {
        singleThread: false,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../../src"),
    },
  },
});
