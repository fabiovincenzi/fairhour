/**
 * `@fairhour/tax-pack-it`: the Italian tax pack for Fairhour. Self-employed professionals under
 * the regime forfettario or the regime ordinario: VAT, ritenuta d'acconto, INPS rivalsa,
 * professional funds (casse), lawyers' general expenses, imposta di bollo, split payment, and
 * the forfettario revenue tracker. MIT.
 *
 * Specification: docs/tax-packs/it.md. Engine contract: docs/design/tax-engine.md.
 * Figures are informational: verify every invoice with an accountant.
 */
import { countryCode, message, type PackMeta, type TaxPack } from "@fairhour/tax-core";
import { configSchema, type ItConfig } from "./config";
import { deepFreeze } from "./freeze";
import { itMessages } from "./messages/index";
import { optionsSchema, type ItOptions } from "./options";
import { parameters, type ItParams } from "./parameters";
import { countableRevenue, evaluateRevenue } from "./revenue-tracker";
import { roundingPolicy } from "./rounding";
import { cassa } from "./rules/cassa";
import { classifyLines } from "./rules/classify-lines";
import { generalExpenses } from "./rules/general-expenses";
import { inpsRivalsa } from "./rules/inps-rivalsa";
import { noVat } from "./rules/no-vat";
import { noWithholding } from "./rules/no-withholding";
import { splitPayment } from "./rules/split-payment";
import { stampDuty } from "./rules/stamp-duty";
import { vat } from "./rules/vat";
import { withholding } from "./rules/withholding";
import type { ItFacts } from "./types";
import { validateInput } from "./validate-input";

/** Equals the package.json version (the conformance suite checks it). */
export const IT_PACK_VERSION = "0.1.0";

export type ItPack = TaxPack<ItConfig, ItParams, ItFacts, ItOptions>;

/** The pipeline, in the order of docs/tax-packs/it.md, section 6 (rules and their data frozen). */
export const itRules: ItPack["rules"] = deepFreeze([
  classifyLines,
  generalExpenses,
  cassa,
  inpsRivalsa,
  vat,
  withholding,
  noVat,
  noWithholding,
  stampDuty,
  splitPayment,
]);

// Not deep-frozen as a whole: zod schemas keep lazy internal caches. The data (metadata,
// parameters, sources, catalogs) is frozen.
export const itPack: ItPack = Object.freeze<ItPack>({
  meta: deepFreeze<PackMeta>({
    id: "it",
    name: "Italy",
    version: IT_PACK_VERSION,
    countries: [countryCode("IT")],
    description:
      "Italian self-employed professionals: regime forfettario and regime ordinario, with VAT, withholding tax (ritenuta d'acconto), INPS rivalsa, professional funds, stamp duty and split payment.",
    maintainers: [{ name: "Fairhour maintainers", github: "fabiovincenzi" }],
    docsUrl: "https://fabiovincenzi.github.io/fairhour/tax-packs/it/",
    disclaimer: message("meta.disclaimer"),
    locales: ["en", "it"],
    documentLocale: "it",
  }),
  configSchema,
  invoiceOptionsSchema: optionsSchema,
  parameters,
  rules: itRules,
  initialFacts: Object.freeze({ withholdingApplied: false }),
  messages: itMessages,
  roundingPolicy,
  validateInput,
  capabilities: {
    annualThresholds: { countableRevenue, evaluate: evaluateRevenue },
  },
});

export { CASSA_PRESET_IDS, configSchema, PERCENT_PATTERN, TIPO_CASSA_PATTERN } from "./config";
export type {
  CassaConfig,
  CassaPreset,
  CassaPresetId,
  ForfettarioConfig,
  InpsConfig,
  ItConfig,
  ItConfigInput,
  OrdinarioConfig,
  Percent,
  SocialSecurityConfig,
  StampDutyCharge,
} from "./config";
export { optionsSchema } from "./options";
export type { ItOptions, ItOptionsInput } from "./options";
export { parameters } from "./parameters";
export type { CassaPresetParams, ItParams } from "./parameters";
export { cassaRateSources, sources } from "./sources";
export { countableRevenue, evaluateRevenue } from "./revenue-tracker";
export { itMessages } from "./messages/index";
export type { ItFacts } from "./types";
