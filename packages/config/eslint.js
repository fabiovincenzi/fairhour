import js from "@eslint/js";
import prettier from "eslint-config-prettier/flat";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

/** @import { Config } from "eslint/config" */

/**
 * @typedef {object} CreateConfigOptions
 * @property {string} tsconfigRootDir
 *   Directory that contains the package's `tsconfig.json`. Pass `import.meta.dirname`.
 * @property {readonly string[]} [ignores]
 *   Extra glob patterns to ignore, on top of {@link DEFAULT_IGNORES}.
 * @property {readonly string[]} [allowConsoleIn]
 *   Glob patterns (relative to the config file) where `console.*` is allowed. Replaces
 *   {@link DEFAULT_ALLOW_CONSOLE_IN}; pass {@link CODE_FILES} for packages that are entirely CLI
 *   tools. Never pass a bare `**`: it would make ESLint lint JSON and other non-code files.
 * @property {readonly Config[]} [extraConfigs]
 *   Extra flat-config entries (framework plugins, per-package rules). They are placed after the
 *   shared rules and before eslint-config-prettier, which always stays last.
 */

/** Build output, caches and generated files that are never linted. */
export const DEFAULT_IGNORES = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/.turbo/**",
  "**/.astro/**",
  "**/coverage/**",
  "**/.vitest-cache/**",
  "**/playwright-report/**",
  "**/test-results/**",
  "**/blob-report/**",
  "**/next-env.d.ts",
  "**/src-tauri/target/**",
  "**/src-tauri/gen/**",
];

/** Places where printing to the console is the point (CLIs and one-off scripts). */
export const DEFAULT_ALLOW_CONSOLE_IN = ["**/cli/**", "**/scripts/**"];

const TS_FILES = ["**/*.{ts,tsx,mts,cts}"];
const JS_FILES = ["**/*.{js,jsx,mjs,cjs}"];

/** Every JavaScript and TypeScript file. Use it for `allowConsoleIn` instead of a bare `**`. */
export const CODE_FILES = [...JS_FILES, ...TS_FILES];
const TEST_FILES = [
  "**/*.test.{ts,tsx}",
  "**/*.spec.{ts,tsx}",
  "**/test/**/*.{ts,tsx}",
  "**/tests/**/*.{ts,tsx}",
  "**/e2e/**/*.{ts,tsx}",
];

/**
 * Shared flat ESLint config for every Fairhour package.
 *
 * TypeScript files get `strictTypeChecked` + `stylisticTypeChecked` with the TypeScript project
 * service, so every `.ts`/`.tsx` file (including `vitest.config.ts`, `next.config.ts`, ...) must
 * be covered by the package's `tsconfig.json` `include`. JavaScript files (the `*.config.js`
 * files) are linted with the non-type-aware rules only.
 *
 * @param {CreateConfigOptions} options
 * @returns {Config[]}
 */
export function createConfig(options) {
  const {
    tsconfigRootDir,
    ignores = [],
    allowConsoleIn = DEFAULT_ALLOW_CONSOLE_IN,
    extraConfigs = [],
  } = options;

  return defineConfig(
    globalIgnores([...DEFAULT_IGNORES, ...ignores], "fairhour/ignores"),
    {
      name: "fairhour/linter-options",
      linterOptions: { reportUnusedDisableDirectives: "error" },
    },
    js.configs.recommended,
    {
      name: "fairhour/rules",
      rules: {
        eqeqeq: ["error", "always", { null: "ignore" }],
        "no-console": "warn",
        "no-var": "error",
        "object-shorthand": "error",
        "prefer-const": "error",
      },
    },
    {
      name: "fairhour/javascript",
      files: JS_FILES,
      languageOptions: { globals: globals.node },
    },
    {
      name: "fairhour/typescript",
      files: TS_FILES,
      extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
      languageOptions: {
        parserOptions: { projectService: true, tsconfigRootDir },
      },
      rules: {
        // Type-only imports must say so, and a lone `import { type A }` is rejected: under
        // `verbatimModuleSyntax` it would leave an empty `import {} from` behind at runtime.
        "@typescript-eslint/consistent-type-imports": [
          "error",
          { prefer: "type-imports", fixStyle: "separate-type-imports" },
        ],
        "@typescript-eslint/consistent-type-exports": "error",
        "@typescript-eslint/no-import-type-side-effects": "error",
        "@typescript-eslint/no-unused-vars": [
          "error",
          {
            args: "all",
            argsIgnorePattern: "^_",
            caughtErrors: "all",
            caughtErrorsIgnorePattern: "^_",
            destructuredArrayIgnorePattern: "^_",
            varsIgnorePattern: "^_",
            ignoreRestSiblings: true,
          },
        ],
        // Same as the strict preset, except that numbers are fine in template literals (they
        // read better than `String(n)`). Every option is restated because a custom options
        // object replaces the preset's, it does not merge with it.
        "@typescript-eslint/restrict-template-expressions": [
          "error",
          {
            allowAny: false,
            allowBoolean: false,
            allowNever: false,
            allowNullish: false,
            allowNumber: true,
            allowRegExp: false,
          },
        ],
        "@typescript-eslint/switch-exhaustiveness-check": [
          "error",
          { considerDefaultExhaustiveForUnions: true, requireDefaultForNonUnion: true },
        ],
      },
    },
    {
      name: "fairhour/console",
      files: [...allowConsoleIn],
      rules: { "no-console": "off" },
    },
    ...extraConfigs,
    {
      name: "fairhour/tests",
      files: TEST_FILES,
      rules: {
        // With `noUncheckedIndexedAccess`, `items[0]!` is the idiomatic way to say "this must
        // exist" in an assertion: if it does not, the test fails, which is the desired outcome.
        "@typescript-eslint/no-non-null-assertion": "off",
      },
    },
    prettier,
  );
}
