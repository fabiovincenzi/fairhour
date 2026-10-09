import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["scripts/**/*.test.ts", "test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // The content sync is the only code of this package; the page content is not code.
      include: ["scripts/lib/**/*.ts"],
      exclude: ["scripts/lib/**/*.test.ts"],
      reporter: ["text-summary", "lcov"],
      thresholds: { lines: 90, branches: 85, functions: 90, statements: 90 },
    },
  },
});
