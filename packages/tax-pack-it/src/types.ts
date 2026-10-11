/**
 * Types shared by the rules of the Italian pack, and the structural predicates several rules
 * (and `validateInput`) must agree on.
 */
import type { RoundingMode } from "@fairhour/money";
import type {
  ClientInput,
  LineKind,
  LineTaxTreatment,
  NetLine,
  Rule,
  RuleContext,
  RuleOutput,
  TaxGroup,
} from "@fairhour/tax-core";
import type { ItConfig } from "./config";
import type { ItOptions } from "./options";
import type { ItParams } from "./parameters";

/**
 * Facts rules tell later rules (a type alias, as `PackFacts` requires): whether the
 * withholding rule withheld, which excludes the split payment.
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- required by PackFacts
export type ItFacts = { readonly withholdingApplied: boolean };

export type ItRule = Rule<ItConfig, ItParams, ItFacts, ItOptions>;
export type ItContext = RuleContext<ItConfig, ItParams, ItOptions>;
export type ItOutput = RuleOutput<ItFacts>;

/** Every rounding of the pack is half up to the cent (docs/tax-packs/it.md, section 8). */
export const IT_ROUNDING_MODE: RoundingMode = "halfUp";

/**
 * Line kinds that make up the fee (compensi): the base of the cassa contribution, the INPS
 * rivalsa and the withholding. Disbursements (`reimbursement`) and goods are not fees.
 */
export const FEE_LINE_KINDS: readonly LineKind[] = Object.freeze(["service", "expense", "mileage"]);

/** A fee line in a group that is not excluded from the VAT base (art. 15 amounts are not fees). */
export function isFeeLine(line: NetLine, group: TaxGroup): boolean {
  return FEE_LINE_KINDS.includes(line.kind) && group.treatment !== "excluded";
}

/** The same test on an input line, before the lines are classified. */
export function isFeeInputLine(kind: LineKind, treatment: LineTaxTreatment): boolean {
  return FEE_LINE_KINDS.includes(kind) && treatment.kind !== "excluded";
}

/**
 * Structural condition of the ritenuta d'acconto: regime ordinario, withholding enabled, and a
 * client who is a withholding agent (sostituto d'imposta). The INPS rivalsa's FatturaPA
 * `Ritenuta` flag and the split-payment conflict check use the same test as the rule.
 */
export function withholdingEnabledFor(config: ItConfig, client: ClientInput): boolean {
  return config.regime === "ordinario" && config.withholding.enabled && client.isWithholdingAgent;
}

/** True for a client established outside Italy that is a business (place of supply: art. 7-ter). */
export function isForeignBusiness(client: ClientInput): boolean {
  return client.kind === "business" && client.country !== "IT";
}
