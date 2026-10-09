# @fairhour/config

Shared tooling presets for every Fairhour package: TypeScript, ESLint, Prettier, tsdown and
Tailwind. Private workspace package (`AGPL-3.0-only`); it ships plain ESM and JSON so tools load
it without a TypeScript loader. Because of that, tool configs in this repo are `.js` files
(`eslint.config.js`, `prettier.config.js`, `tsdown.config.js`).

| Export                                         | What it is                                                    |
| ---------------------------------------------- | ------------------------------------------------------------- |
| `@fairhour/config/tsconfig/base.json`          | Strict compiler options shared by everything                  |
| `@fairhour/config/tsconfig/library.json`       | Framework-free packages (`packages/*`)                        |
| `@fairhour/config/tsconfig/react-library.json` | React component libraries (`packages/ui`, ...)                |
| `@fairhour/config/tsconfig/nextjs.json`        | Next.js apps (`apps/web`)                                     |
| `@fairhour/config/tsconfig/node.json`          | Scripts run by Node's native TypeScript support (`scripts/*`) |
| `@fairhour/config/eslint`                      | `createConfig()`: flat ESLint config factory                  |
| `@fairhour/config/prettier`                    | Prettier options                                              |
| `@fairhour/config/tsdown`                      | `createLibraryConfig()`: tsdown config for publishable libs   |
| `@fairhour/config/tailwind/theme.css`          | Tailwind v4 design tokens (colours, radius, fonts, dark mode) |

## TypeScript

Add `"@fairhour/config": "workspace:*"` and `typescript` to the package's `devDependencies`, then:

```jsonc
// tsconfig.json
{
  "extends": "@fairhour/config/tsconfig/library.json",
  "include": ["src", "vitest.config.ts", "tsdown.config.js"],
}
```

`base.json` turns on `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noImplicitOverride`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax` and `isolatedModules`,
targets `ES2023` with `module: ESNext` / `moduleResolution: Bundler`, and is `noEmit` (tsc only
type-checks; tsdown and the app bundlers produce the output). The presets below it only add what
differs:

- **`library.json`**: `declaration`, no ambient `types` (add `"types": ["node"]` yourself if the
  package really needs Node), no DOM. **Libraries use extensionless relative imports**
  (`import { x } from "./x"`).
- **`react-library.json`**: `library.json` plus `jsx: react-jsx` and the DOM libs.
- **`nextjs.json`**: DOM libs, `jsx: preserve`, `allowJs`, `incremental` and the `next` plugin.
- **`node.json`**: `NodeNext` modules, `allowImportingTsExtensions` and `erasableSyntaxOnly`, for
  code that Node runs directly (`node script.ts`) with `.ts` extensions in imports. No enums,
  namespaces or parameter properties.

Every `.ts` file that ESLint lints must be covered by the package's `tsconfig.json` `include`,
including `vitest.config.ts`, `next.config.ts` and friends.

## ESLint

```js
// eslint.config.js
import { createConfig } from "@fairhour/config/eslint";

export default createConfig({ tsconfigRootDir: import.meta.dirname });
```

Scripts: `"lint": "eslint . --max-warnings=0"` (warnings fail CI) and `eslint` as a devDependency.

`createConfig` returns, in order: shared ignores (`dist`, `.next`, `coverage`, `.turbo`, `.astro`,
`node_modules`, Playwright output, Tauri `target`), `@eslint/js` recommended, a few core rules
(`eqeqeq`, `no-var`, `prefer-const`, `object-shorthand`, `no-console`), typescript-eslint
`strictTypeChecked` + `stylisticTypeChecked` on TypeScript files with the project service
(`parserOptions.projectService: true`), the options below, your `extraConfigs`, a small relaxation
for tests, and `eslint-config-prettier` last. Unused `eslint-disable` comments are errors; use a
targeted `// eslint-disable-next-line <rule> -- <reason>` and never a blanket disable.

Project choices on top of the presets:

- Type-only imports must use `import type` (`consistent-type-imports`), and a lone
  `import { type X }` is rejected (`no-import-type-side-effects`) because
  `verbatimModuleSyntax` would leave an empty `import {} from` behind.
- Unused variables and arguments are errors unless they start with `_`.
- Numbers are allowed in template literals; booleans, `null` and `undefined` are not.
- `no-console` is a warning, allowed under `**/cli/**` and `**/scripts/**`. A package that is
  entirely a CLI passes `allowConsoleIn: CODE_FILES` (exported next to `createConfig`). Never pass
  a bare `**`: it would make ESLint try to lint JSON.
- Non-null assertions (`!`) are errors, except in test files (`*.test.ts`, `*.spec.ts`, `test/`,
  `tests/`, `e2e/`), where `items[0]!` is the idiomatic way to assert that something exists.
- JavaScript files (the `*.config.js` files) are linted without type information.

Options: `tsconfigRootDir` (required), `ignores`, `allowConsoleIn`, `extraConfigs` (framework
plugins and per-package rules; they land before eslint-config-prettier).

## Prettier

```js
// prettier.config.js
export { default } from "@fairhour/config/prettier";
```

`printWidth: 100`, double quotes, trailing commas everywhere, semicolons, LF line endings. The
repository root has the only `.prettierignore`; `pnpm format` and `pnpm lint` run Prettier on the
whole repository from the root.

## tsdown (publishable libraries)

```js
// tsdown.config.js
import { createLibraryConfig } from "@fairhour/config/tsdown";

export default createLibraryConfig();
```

Builds `src/index.ts` to `dist/index.js` (ESM) and `dist/index.d.ts`, cleaning `dist` first. Pass
overrides (`entry`, `platform: "node"`, ...) as the argument. Dependencies listed in the package's
`dependencies` and `peerDependencies` stay external, so `@fairhour/*` packages are never bundled
into each other. Add `tsdown` to the library's `devDependencies`.

## Tailwind theme

```css
/* apps/web/src/app/globals.css */
@import "tailwindcss";
@import "@fairhour/config/tailwind/theme.css";
```

Import Tailwind first. The theme has three layers:

1. **Palettes** as `--color-<name>-<50..950>` theme variables: `brand` (teal, `brand-700` is
   `#0f766e`), `neutral` (a cool slate that replaces Tailwind's `neutral`), and the semantic scales
   `success`, `warning`, `danger` and `info`. Also `--font-sans` / `--font-mono` system stacks.
2. **Semantic variables** that components use, with light values on `:root` and dark values on
   `.dark`: `--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--secondary`,
   `--muted`, `--accent`, `--border`, `--input`, `--ring` (each with a `-foreground` where it
   applies; the names follow shadcn/ui so its components work unchanged), plus
   `--success`/`--warning`/`--danger`/`--info` with `-foreground`, `-subtle` and
   `-subtle-foreground`, and `--radius`. Switch themes by putting `class="dark"` on `<html>` (for
   example with `next-themes`); a nested `.dark` element works too.
3. **Utilities** mapped from the semantic variables: `bg-background`, `text-muted-foreground`,
   `border-border`, `bg-success-subtle text-success-subtle-foreground`, `rounded-lg`, and the
   `dark:` variant (class based).

The base layer also sets the default border colour, the page colours and a visible
`:focus-visible` ring. `test/theme.test.ts` checks every foreground/background pair against
WCAG 2.2 AA (4.5:1 for text, 3:1 for form borders and focus rings) in light and dark mode, so a
token change that breaks contrast fails the tests.

## Library packages: source exports and `publishConfig`

Workspace packages are consumed **from source**: no build step is needed for `dev`, `lint`,
`typecheck` or `test`, and editors jump straight to the `.ts` files. A library that is meant to be
published to npm additionally declares where the built files live, and pnpm swaps the fields in at
`pnpm pack` / `pnpm publish` time:

```jsonc
// packages/money/package.json
{
  "name": "@fairhour/money",
  "version": "0.0.0",
  "private": true, // remove it (and add the NPM_TOKEN secret) to publish
  "license": "MIT",
  "type": "module",
  "exports": {
    ".": { "types": "./src/index.ts", "default": "./src/index.ts" },
  },
  "publishConfig": {
    "access": "public",
    "exports": {
      ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
    },
  },
  "files": ["dist", "README.md"],
  "scripts": {
    "build": "tsdown",
    "clean": "node --eval \"fs.rmSync('dist', { recursive: true, force: true })\"",
    "lint": "eslint . --max-warnings=0",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --coverage",
  },
  "devDependencies": {
    "@fairhour/config": "workspace:*",
    "eslint": "^10.12.0",
    "tsdown": "^0.23.0",
    "typescript": "~6.0.3",
    "vitest": "^5.0.3",
    "@vitest/coverage-v8": "^5.0.3",
  },
}
```

- Inside the monorepo (`pnpm dev`, `next build`, `vitest`, `tsc`), `exports` points at `src`.
  Next.js apps list such packages in `transpilePackages`.
- `turbo run build` runs `tsdown` in each library (Turborepo caches `dist/**`); apps never need
  it, because they read the source. CI builds the libraries to prove the publish output is valid.
- Internal dependencies between packages use `"@fairhour/other": "workspace:*"`, which pnpm
  rewrites to the real version on publish.
- Packages with a `private: true` flag are tagged and versioned by Changesets but never published
  to npm. See `.changeset/README.md` for what Changesets ignores.

## Tests

`pnpm --filter @fairhour/config test` checks that every tsconfig parses and keeps the strict flags,
that the ESLint preset actually rejects `any`, floating promises, unmarked type imports and
friends, and that the theme tokens meet the contrast ratios.
