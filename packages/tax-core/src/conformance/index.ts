/**
 * `@fairhour/tax-core/conformance`: the shared conformance suite every tax pack runs (design
 * section 5). Uses vitest and fast-check (optional peer dependencies) and, when `fixturesDir` is
 * given, node:fs to read the golden fixtures.
 *
 * ```ts
 * // packages/tax-pack-xx/src/conformance.test.ts
 * defineConformanceSuite(xxPack, { fixturesDir, validConfigs, invalidConfigs, sampleInputs });
 * ```
 */
export { decimalArbitrary, invoiceInputArbitrary, priceArbitrary } from "./arbitraries";
export { CONFORMANCE_CHECK_IDS, runConformanceChecks } from "./checks";
export type { ConformanceCheckId, ConformanceCheckResult, ConformanceOptions } from "./checks";
export { defineConformanceSuite } from "./suite";
