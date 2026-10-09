import { defineConfig } from "tsdown/config";

/** @import { UserConfig } from "tsdown/config" */

/**
 * tsdown config for publish-ready libraries: ESM + `.d.ts` in `dist/`, entry `src/index.ts`.
 *
 * Dependencies listed in the package's `dependencies`/`peerDependencies` stay external (tsdown's
 * default), so internal `@fairhour/*` packages are never bundled into each other.
 *
 * ```js
 * // packages/money/tsdown.config.js
 * import { createLibraryConfig } from "@fairhour/config/tsdown";
 * export default createLibraryConfig();
 * ```
 *
 * @param {UserConfig} [overrides] Anything tsdown accepts; wins over the defaults.
 * @returns {UserConfig}
 */
export function createLibraryConfig(overrides = {}) {
  return defineConfig({
    entry: ["src/index.ts"],
    format: "esm",
    platform: "neutral",
    dts: true,
    clean: true,
    ...overrides,
  });
}
