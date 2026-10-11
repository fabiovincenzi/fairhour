import { fileURLToPath } from "node:url";
import { countryCode, isoDate } from "@fairhour/tax-core";
import { defineConformanceSuite } from "@fairhour/tax-core/conformance";
import packageJson from "../package.json" with { type: "json" };
import { invalidConfigs, invoiceOptions, sampleInputs, validConfigs } from "./conformance.data";
import { itPack } from "./index";

defineConformanceSuite(itPack, {
  fixturesDir: fileURLToPath(new URL("../fixtures/invoices", import.meta.url)),
  validConfigs,
  invalidConfigs,
  sampleInputs,
  invoiceOptions,
  input: {
    currencies: ["EUR"],
    // Italian clients most of the time, and EU, former-EU and non-EU ones.
    clientCountries: ["IT", "IT", "IT", "DE", "FR", "GB", "US", "CH"].map(countryCode),
    // The whole timeline, including the end of the split payment authorisation (2029-06-30).
    dateRange: { from: isoDate("2019-01-01"), to: isoDate("2030-12-31") },
  },
  packageVersion: packageJson.version,
});
