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
 * @property {boolean} [mitLibrary]
 *   For the MIT-licensed packages (`money`, `tax-core`, `tax-pack-*`): forbids importing any
 *   `@fairhour/*` package except `@fairhour/money`, `@fairhour/tax-core` and
 *   `@fairhour/tax-pack-*` (config files may also import `@fairhour/config`). ADR-0002, rule 2.
 * @property {boolean} [moneySafety]
 *   For code that handles money or tax: forbids float-prone APIs (`parseFloat`, `Number(...)`,
 *   `.toFixed(...)`, `Math.round/floor/ceil/trunc`). Use `@fairhour/money`. `Number(...)` stays
 *   allowed in test files, which need it to build inputs and oracles.
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
/** Tool configuration files: `eslint.config.js`, `vitest.config.ts`, `tsdown.config.js`, ... */
const CONFIG_FILES = ["**/*.config.{js,mjs,cjs,ts,mts,cts}"];
const TEST_FILES = [
  "**/*.test.{ts,tsx}",
  "**/*.spec.{ts,tsx}",
  "**/test/**/*.{ts,tsx}",
  "**/tests/**/*.{ts,tsx}",
  "**/e2e/**/*.{ts,tsx}",
];

const MIT_LIBRARY_MESSAGE =
  "MIT packages may only depend on @fairhour/money, @fairhour/tax-core and @fairhour/tax-pack-* " +
  "(ADR-0002, rule 2: the library boundary). Move the code into @fairhour/money or " +
  "@fairhour/tax-core, or pass it in as a parameter.";

/** Package names (after `@fairhour/`) an MIT package may import. */
const MIT_ALLOWED_PACKAGES = ["money", "tax-core", "tax-pack-[^\\x2f]+"];

/**
 * Source of a regular expression that matches `@fairhour/*` imports that are NOT one of the
 * allowed packages (or a subpath of one). The slash is written `\x2f` because esquery (ESLint
 * selectors) cannot contain a literal one inside a regular expression; it means the same
 * everywhere.
 *
 * @param {string[]} allowed
 */
function forbiddenFairhourImport(allowed) {
  return `^@fairhour\\x2f(?!(?:${allowed.join("|")})(?:\\x2f|$))`;
}

/**
 * @param {string} name
 * @param {string[]} files
 * @param {string[]} allowed
 * @returns {Config}
 */
function restrictFairhourImports(name, files, allowed) {
  return {
    name,
    files,
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ regex: forbiddenFairhourImport(allowed), message: MIT_LIBRARY_MESSAGE }] },
      ],
    },
  };
}

/** @returns {Config[]} */
function mitLibraryConfigs() {
  return [
    restrictFairhourImports("fairhour/mit-library", CODE_FILES, MIT_ALLOWED_PACKAGES),
    // Tool configuration (`eslint.config.js`, `vitest.config.ts`, ...) may use the shared presets:
    // `@fairhour/config` is a devDependency and is not shipped (ADR-0002).
    restrictFairhourImports("fairhour/mit-library-config-files", CONFIG_FILES, [
      ...MIT_ALLOWED_PACKAGES,
      "config",
    ]),
  ];
}

const MONEY_MESSAGE =
  "Floating point is not allowed for money and tax: use @fairhour/money (bigint minor units " +
  "with explicit rounding).";

const MONEY_RESTRICTED_GLOBALS = [{ name: "parseFloat", message: MONEY_MESSAGE }];

const MONEY_RESTRICTED_PROPERTIES = [
  { object: "Number", property: "parseFloat", message: MONEY_MESSAGE },
  // Any receiver: `price.toFixed(2)` rounds a binary float, not a decimal amount.
  { property: "toFixed", message: MONEY_MESSAGE },
  ...["round", "floor", "ceil", "trunc"].map((property) => ({
    object: "Math",
    property,
    message: MONEY_MESSAGE,
  })),
];

const MONEY_RESTRICTED_SYNTAX = [
  {
    selector: ":matches(CallExpression, NewExpression)[callee.name='Number']",
    message: `${MONEY_MESSAGE} Number(...) converts to a float and loses precision above 2^53.`,
  },
];

/** @returns {Config[]} */
function moneySafetyConfigs() {
  return [
    {
      name: "fairhour/money-safety",
      files: CODE_FILES,
      rules: {
        "no-restricted-globals": ["error", ...MONEY_RESTRICTED_GLOBALS],
        "no-restricted-properties": ["error", ...MONEY_RESTRICTED_PROPERTIES],
      },
    },
  ];
}

/**
 * `no-restricted-syntax` is one rule whose options are replaced, not merged, from one config
 * entry to the next, so the selectors of every enabled option are collected here:
 *
 * - `mitLibrary` adds the dynamic `import("@fairhour/...")` check (`no-restricted-imports` only
 *   looks at static imports);
 * - `moneySafety` adds `Number(...)`, except in test files, which build inputs and oracles with it
 *   (for example from fast-check values). `parseFloat`, `toFixed` and `Math.round/floor/ceil/
 *   trunc` stay forbidden there.
 *
 * @param {{ mitLibrary: boolean, moneySafety: boolean }} enabled
 * @returns {Config[]}
 */
function restrictedSyntaxConfigs({ mitLibrary, moneySafety }) {
  if (!mitLibrary && !moneySafety) return [];
  /**
   * @param {string[]} allowed
   * @param {boolean} money
   * @returns {NonNullable<Config["rules"]>}
   */
  const rules = (allowed, money) => {
    const selectors = [
      ...(mitLibrary
        ? [
            {
              selector: `ImportExpression > Literal.source[value=/${forbiddenFairhourImport(allowed)}/]`,
              message: MIT_LIBRARY_MESSAGE,
            },
          ]
        : []),
      ...(money ? MONEY_RESTRICTED_SYNTAX : []),
    ];
    return { "no-restricted-syntax": selectors.length > 0 ? ["error", ...selectors] : "off" };
  };
  return [
    {
      name: "fairhour/restricted-syntax",
      files: CODE_FILES,
      rules: rules(MIT_ALLOWED_PACKAGES, moneySafety),
    },
    ...(mitLibrary
      ? [
          {
            name: "fairhour/restricted-syntax-config-files",
            files: CONFIG_FILES,
            rules: rules([...MIT_ALLOWED_PACKAGES, "config"], moneySafety),
          },
        ]
      : []),
    ...(moneySafety
      ? [
          {
            name: "fairhour/restricted-syntax-tests",
            files: TEST_FILES,
            rules: rules(MIT_ALLOWED_PACKAGES, false),
          },
        ]
      : []),
  ];
}

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
    mitLibrary = false,
    moneySafety = false,
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
        // A `default:` must not swallow a member added to a union later (a new tax regime, a new
        // rounding mode): the compiler-checked list of cases is the point of the rule.
        "@typescript-eslint/switch-exhaustiveness-check": [
          "error",
          { considerDefaultExhaustiveForUnions: false, requireDefaultForNonUnion: true },
        ],
      },
    },
    {
      name: "fairhour/console",
      files: [...allowConsoleIn],
      rules: { "no-console": "off" },
    },
    ...(mitLibrary ? mitLibraryConfigs() : []),
    ...(moneySafety ? moneySafetyConfigs() : []),
    ...restrictedSyntaxConfigs({ mitLibrary, moneySafety }),
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
