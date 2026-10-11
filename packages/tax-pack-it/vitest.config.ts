import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Property-based and exhaustive tests are CPU-bound; Turborepo runs packages in parallel.
    testTimeout: 30_000,
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.d.ts"],
      reporter: ["text-summary", "lcov"],
      thresholds: { lines: 95, branches: 95, functions: 95, statements: 95 },
    },
  },
});
