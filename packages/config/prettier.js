/** Shared Prettier preset. Import it from a `prettier.config.js`: `export { default } from "@fairhour/config/prettier";` */

/** @type {import("prettier").Config} */
const config = {
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: false,
  quoteProps: "as-needed",
  trailingComma: "all",
  bracketSpacing: true,
  arrowParens: "always",
  proseWrap: "preserve",
  endOfLine: "lf",
};

export default config;
