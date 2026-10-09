import { fileURLToPath } from "node:url";
import { defineConformanceSuite } from "./conformance/index";
import {
  invalidConfigs,
  invoiceOptions,
  sampleInputs,
  validConfigs,
} from "./testing/conformance-data";
import { testPack } from "./testing/test-pack";

defineConformanceSuite(testPack, {
  fixturesDir: fileURLToPath(new URL("../fixtures/invoices", import.meta.url)),
  validConfigs,
  invalidConfigs,
  sampleInputs,
  invoiceOptions,
  input: { currencies: ["EUR", "USD", "JPY", "KWD"] },
  packageVersion: "1.0.0",
});
