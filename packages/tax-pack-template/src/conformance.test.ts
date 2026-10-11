/**
 * The shared conformance suite: one vitest test per check, none of which can be skipped. A pack is
 * not done until every check passes. When a property fails, its message gives the fast-check seed,
 * the shrunk path and the input as JSON (docs/contributing/tax-packs.md, "The conformance suite").
 */
import { fileURLToPath } from "node:url";
import { defineConformanceSuite } from "@fairhour/tax-core/conformance";
import packageJson from "../package.json" with { type: "json" };
import {
  invalidConfigs,
  invoiceOptions,
  sampleInputs,
  validConfigs,
} from "../test/conformance-data";
import { xxPack } from "./index";

// TEMPLATE: list the currencies your pack accepts (a pack whose parameters hold amounts in one
// currency refuses the others), and the client countries that matter to its rules (domestic and
// foreign clients, inside and outside a customs or VAT union). The defaults are EUR and, for
// `countries: "any"`, US, GB, DE, IT and JP; the issue dates span the parameter timeline.
defineConformanceSuite(xxPack, {
  fixturesDir: fileURLToPath(new URL("../fixtures/invoices", import.meta.url)),
  validConfigs,
  invalidConfigs,
  sampleInputs,
  invoiceOptions,
  // Two decimals (EUR, USD) and none (JPY).
  input: { currencies: ["EUR", "USD", "JPY"] },
  packageVersion: packageJson.version,
});
