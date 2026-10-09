import { createConfig } from "@fairhour/config/eslint";

// `scripts/` is covered by the shared console allowance; the generated pages under
// `src/content/docs` are Markdown, which ESLint does not lint.
export default createConfig({ tsconfigRootDir: import.meta.dirname });
