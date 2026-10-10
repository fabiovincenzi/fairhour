/**
 * Tax groups of the generic pack (docs/tax-packs/generic.md, section 2.1): one taxable group per
 * rate, and fixed groups for the reverse charge, the no-tax setting, exempt, out-of-scope and
 * excluded lines.
 */
import { decimalToString, normalizeDecimal, type Decimal } from "@fairhour/money";
import {
  message,
  p,
  type MessageParam,
  type TaxGroup,
  type TaxTreatmentKind,
} from "@fairhour/tax-core";

/** The groups that are not taxable, in the order they appear in the tax summary. */
export const FIXED_GROUP_IDS = [
  "reverse-charge",
  "no-tax",
  "exempt",
  "out-of-scope",
  "excluded",
] as const;

export type FixedGroupId = (typeof FIXED_GROUP_IDS)[number];

const FIXED_GROUP_TREATMENTS: Readonly<Record<FixedGroupId, TaxTreatmentKind>> = {
  // The supplier charges no tax: the customer accounts for it.
  "reverse-charge": "out-of-scope",
  // The workspace is configured without tax (e.g. a small-business exemption).
  "no-tax": "out-of-scope",
  exempt: "exempt",
  "out-of-scope": "out-of-scope",
  // Disbursements paid in the client's name: outside the taxable amount.
  excluded: "excluded",
};

/**
 * Id of the taxable group of `rate` (percent units): `tax-` and the normalized rate with `-` for
 * the decimal point. `20` and `20.00` give `tax-20`, `7.7` gives `tax-7-7`, `8.875` gives
 * `tax-8-875`. Rates have at most 4 decimals and are at most 100, so the id fits the engine's
 * 32 characters.
 */
export function taxGroupId(rate: Decimal): string {
  return `tax-${decimalToString(normalizeDecimal(rate)).replace(".", "-")}`;
}

/** The taxable group of a rate: "VAT 20%". */
export function taxableGroup(rate: Decimal, label: MessageParam): TaxGroup {
  const normalized = normalizeDecimal(rate);
  return {
    id: taxGroupId(normalized),
    treatment: "taxable",
    rate: normalized,
    label: message("generic.group.tax", { label, rate: p.percent(normalized) }),
  };
}

/** A group that is not taxable: "Reverse charge", "No VAT", "Exempt", ... */
export function fixedGroup(id: FixedGroupId, label: MessageParam): TaxGroup {
  return {
    id,
    treatment: FIXED_GROUP_TREATMENTS[id],
    label:
      id === "no-tax" ? message("generic.group.no-tax", { label }) : message(`generic.group.${id}`),
  };
}
