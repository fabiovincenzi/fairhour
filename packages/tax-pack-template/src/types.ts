import type { Rule, RuleContext, TaxPack } from "@fairhour/tax-core";
import type { XxConfig } from "./config";
import type { XxOptions } from "./options";
import type { XxParams } from "./parameters";

// TEMPLATE: facts let a rule tell later rules what it decided (tax-pack-it sets
// `{ withholdingApplied: boolean }` for its split-payment rule). Exampleland's rules need none.
// Declare facts with a `type` alias, never an `interface`: an interface has no implicit index
// signature and is not assignable to tax-core's `PackFacts`. Every key needs an initial value in
// `initialFacts` (index.ts).
export type XxFacts = Readonly<Record<string, never>>;

export type XxPack = TaxPack<XxConfig, XxParams, XxFacts, XxOptions>;
export type XxRule = Rule<XxConfig, XxParams, XxFacts, XxOptions>;
export type XxRuleContext = RuleContext<XxConfig, XxParams, XxOptions>;
