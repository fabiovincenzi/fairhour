import { createConfig } from "./eslint.js";

export default createConfig({
  tsconfigRootDir: import.meta.dirname,
  // Fixtures are linted in memory by test/eslint.test.ts.
  ignores: ["test/fixtures/**"],
});
