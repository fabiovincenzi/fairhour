import { fileURLToPath } from "node:url";
import { countryCode, isoDate } from "@fairhour/tax-core";
import { defineConformanceSuite } from "@fairhour/tax-core/conformance";
import packageJson from "../package.json" with { type: "json" };
import {
  invalidConfigs,
  invoiceOptions,
  sampleInputs,
  validConfigs,
} from "../test/conformance-data";
import { genericPack } from "./index";

defineConformanceSuite(genericPack, {
  fixturesDir: fileURLToPath(new URL("../fixtures/invoices", import.meta.url)),
  validConfigs,
  invalidConfigs,
  sampleInputs,
  invoiceOptions,
  input: {
    // Any currency: 2 decimals, 0 (JPY) and 3 (KWD).
    currencies: ["EUR", "GBP", "USD", "AUD", "JPY", "KWD"],
    // Domestic and foreign clients for the configured supplier countries (DE, ES).
    clientCountries: ["DE", "ES", "FR", "GB", "US", "AU", "JP"].map((code) => countryCode(code)),
    // The single parameter version starts in 1900; generate realistic issue dates instead.
    dateRange: { from: isoDate("2020-01-01"), to: isoDate("2030-12-31") },
  },
  packageVersion: packageJson.version,
});
