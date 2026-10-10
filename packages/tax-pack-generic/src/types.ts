import type { Rule, RuleContext, TaxPack } from "@fairhour/tax-core";
import type { GenericConfig } from "./config";
import type { GenericOptions } from "./options";
import type { GenericParams } from "./parameters";

/**
 * The generic pack's rules tell each other nothing: every decision is visible in the groups and
 * components. A type alias (not an interface), as `PackFacts` requires.
 */
export type GenericFacts = Readonly<Record<string, never>>;

export type GenericPack = TaxPack<GenericConfig, GenericParams, GenericFacts, GenericOptions>;
export type GenericRule = Rule<GenericConfig, GenericParams, GenericFacts, GenericOptions>;
export type GenericRuleContext = RuleContext<GenericConfig, GenericParams, GenericOptions>;
