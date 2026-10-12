/**
 * `@fairhour/tax-pack-template`: a complete, minimal tax pack for the FICTIONAL country of
 * Exampleland, to copy when adding a country. VAT at a standard or reduced rate, versioned by
 * date; the small-business exemption with its mandatory note; and an income tax withholding.
 * MIT. Step-by-step guide: docs/contributing/tax-packs.md. Every place to change is marked with
 * a `TEMPLATE:` comment.
 */
import { message, type PackMeta } from "@fairhour/tax-core";
import { configSchema } from "./config";
import { deepFreeze } from "./freeze";
import { xxMessages } from "./messages/index";
import { invoiceOptionsSchema } from "./options";
import { XX_PARAMETERS } from "./parameters";
import { roundingPolicy } from "./rounding";
import { classifyLinesRule } from "./rules/classify-lines";
import { smallBusinessRule } from "./rules/small-business";
import { vatRule } from "./rules/vat";
import { withholdingRule } from "./rules/withholding";
import type { XxFacts, XxPack } from "./types";
import { validateInput } from "./validate-input";

// TEMPLATE: describe your pack. `id` is your country code in lower case ("de"): it prefixes
// every rule id, message key and parameter id. `version` equals package.json's (the conformance
// suite checks it). `countries` lists the ISO 3166-1 codes the pack is for ([countryCode("DE")]);
// the template says "any" only because Exampleland's code, XX, is user-assigned and tax-core
// accepts assigned codes only. `docsUrl` is your page on the docs site
// (https://fabiovincenzi.github.io/fairhour/tax-packs/<cc>/), and the maintainers are the pack's
// stewards, also listed in MAINTAINERS.md.
export const XX_PACK_META: PackMeta = deepFreeze({
  id: "xx",
  name: "Exampleland (template)",
  version: "0.1.0",
  countries: "any",
  description:
    "Template pack for the fictional country of Exampleland: VAT at the standard or reduced rate, the small-business exemption and the income tax withholding. Copy it to start a pack for your country.",
  maintainers: [{ name: "Fairhour maintainers", github: "fabiovincenzi" }],
  docsUrl: "https://fabiovincenzi.github.io/fairhour/contributing/tax-packs/",
  disclaimer: message("meta.disclaimer"),
  // "en" is required; legal notes are printed in documentLocale, the country's language.
  locales: ["en", "eo"],
  documentLocale: "eo",
});

const INITIAL_FACTS: XxFacts = {};

/**
 * The Exampleland pack. Not deep-frozen as a whole (zod schemas keep lazy internal caches); its
 * data (metadata, parameters, catalogs, rules) is.
 */
export const xxPack: XxPack = Object.freeze<XxPack>({
  meta: XX_PACK_META,
  configSchema,
  invoiceOptionsSchema,
  parameters: XX_PARAMETERS,
  // TEMPLATE: the pipeline, in order. Each rule only appends groups, components, notes, warnings
  // and trace steps; the engine derives the totals. A rule that needs another's output runs after it.
  rules: deepFreeze([classifyLinesRule, vatRule, smallBusinessRule, withholdingRule]),
  initialFacts: Object.freeze(INITIAL_FACTS),
  messages: xxMessages,
  roundingPolicy,
  validateInput,
  // TEMPLATE: optional capabilities. A country with an annual revenue ceiling (a small-business
  // or flat-rate threshold) can implement `annualThresholds`: see tax-pack-it's revenue tracker.
  capabilities: Object.freeze({}),
});

export { VAT_RATE_NAMES, WITHHOLDING_RATE_NAMES, configSchema } from "./config";
export type { VatRateName, WithholdingRateName, XxConfig, XxConfigInput } from "./config";
export { WITHHOLDING_OPTIONS, invoiceOptionsSchema } from "./options";
export type { WithholdingOption, XxOptions, XxOptionsInput } from "./options";
export { XX_PARAMETERS } from "./parameters";
export type { XxParams } from "./parameters";
export { FIXED_GROUP_IDS, vatGroupId } from "./groups";
export type { FixedGroupId } from "./groups";
export { xxMessages } from "./messages/index";
export type { XxFacts, XxPack, XxRule, XxRuleContext } from "./types";
