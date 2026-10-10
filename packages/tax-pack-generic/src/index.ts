/**
 * `@fairhour/tax-pack-generic`: a configurable VAT / GST / sales-tax (or no-tax) pack for any
 * country and currency, with optional reverse charge, exemption wording and withholding. It
 * knows no country's law: every rate, label and wording comes from the workspace configuration.
 * MIT. Specification: docs/tax-packs/generic.md.
 */
import { message, type PackMeta } from "@fairhour/tax-core";
import { configSchema } from "./config";
import { deepFreeze } from "./freeze";
import { genericMessages } from "./messages/index";
import { invoiceOptionsSchema } from "./options";
import { GENERIC_PARAMETERS } from "./parameters";
import { roundingPolicy } from "./rounding";
import { classifyLinesRule } from "./rules/classify-lines";
import { notesRule } from "./rules/notes";
import { taxRule } from "./rules/tax";
import { withholdingRule } from "./rules/withholding";
import type { GenericFacts, GenericPack } from "./types";
import { validateInput } from "./validate-input";
import { PACK_VERSION } from "./version";

export const GENERIC_PACK_META: PackMeta = deepFreeze({
  id: "generic",
  name: "Generic",
  version: PACK_VERSION,
  countries: "any",
  description:
    "Configurable VAT, GST or sales tax, or no tax, with optional reverse charge, exemption wording and withholding. Works in any country and currency.",
  maintainers: [{ name: "Fairhour maintainers", github: "fabiovincenzi" }],
  docsUrl: "https://fabiovincenzi.github.io/fairhour/tax-packs/generic/",
  disclaimer: message("meta.disclaimer"),
  locales: ["en", "it"],
  // No documentLocale: the legal notes are the user's own text, printed as written.
});

const INITIAL_FACTS: GenericFacts = {};

/**
 * The generic tax pack. Not deep-frozen as a whole (zod schemas keep lazy internal caches); its
 * data (metadata, parameters, catalogs, rules) is frozen.
 */
export const genericPack: GenericPack = Object.freeze<GenericPack>({
  meta: GENERIC_PACK_META,
  configSchema,
  invoiceOptionsSchema,
  parameters: GENERIC_PARAMETERS,
  rules: deepFreeze([classifyLinesRule, taxRule, withholdingRule, notesRule]),
  initialFacts: Object.freeze(INITIAL_FACTS),
  messages: genericMessages,
  roundingPolicy,
  validateInput,
  capabilities: Object.freeze({}),
});

export {
  MAX_ALLOWED_LINE_RATES,
  PERCENT_PATTERN,
  REVERSE_CHARGE_MODES,
  TAX_SCOPES,
  WITHHOLDING_APPLIES_TO,
  configSchema,
  isRateAllowed,
} from "./config";
export type {
  GenericConfig,
  GenericConfigInput,
  GenericRateTaxConfig,
  GenericTaxConfig,
  GenericWithholdingConfig,
  Percent,
  ReverseChargeMode,
  TaxScope,
  WithholdingAppliesTo,
} from "./config";
export { REVERSE_CHARGE_OPTIONS, invoiceOptionsSchema } from "./options";
export type { GenericOptions, GenericOptionsInput, ReverseChargeOption } from "./options";
export { GENERIC_PARAMETERS } from "./parameters";
export type { GenericParams } from "./parameters";
export { FIXED_GROUP_IDS, taxGroupId } from "./groups";
export type { FixedGroupId } from "./groups";
export { genericMessages } from "./messages/index";
export {
  configurationSources,
  reverseChargeSources,
  userConfiguration,
  vatDirectiveArt196,
  vatDirectiveArt226,
} from "./sources";
export type { GenericFacts, GenericPack, GenericRule, GenericRuleContext } from "./types";
export { PACK_VERSION } from "./version";
