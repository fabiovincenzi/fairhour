/**
 * Tax groups of the Exampleland pack: the rows of the invoice's tax summary. One taxable group per
 * VAT rate ("VAT 21%"), and one group per reason for charging no VAT. A group's id is stable
 * (stored computations and fixtures refer to it) and its treatment tells the engine how the
 * group's base counts: `taxable` (with its rate), `exempt`, `out-of-scope` or `excluded` (outside
 * the taxable amount, such as disbursements).
 */
import { decimalToString, normalizeDecimal, type Decimal } from "@fairhour/money";
import {
  message,
  p,
  type MessageKey,
  type TaxGroup,
  type TaxTreatmentKind,
} from "@fairhour/tax-core";

// TEMPLATE: list the summary rows your country's invoices need. A group may also carry
// `exportCodes` for e-invoicing exporters (tax-pack-it: `{ "fatturapa.Natura": "N2.2" }`).

/** The groups that are not taxable, in the order they appear in the tax summary. */
export const FIXED_GROUP_IDS = ["small-business", "exempt", "out-of-scope", "excluded"] as const;
export type FixedGroupId = (typeof FIXED_GROUP_IDS)[number];

interface FixedGroupSpec {
  readonly treatment: Exclude<TaxTreatmentKind, "taxable">;
  readonly label: MessageKey;
  /** The provision printed next to the summary row. */
  readonly reference?: MessageKey;
}

const FIXED_GROUPS: Readonly<Record<FixedGroupId, FixedGroupSpec>> = {
  // No VAT at all under the small-business exemption: the supply is outside the VAT system.
  "small-business": {
    treatment: "out-of-scope",
    label: "xx.group.small-business",
    reference: "xx.group.small-business.reference",
  },
  exempt: { treatment: "exempt", label: "xx.group.exempt", reference: "xx.group.exempt.reference" },
  // The line's own reference (place of supply...) says why; the invoice prints it with the line.
  "out-of-scope": { treatment: "out-of-scope", label: "xx.group.out-of-scope" },
  // Disbursements paid in the client's name: outside the taxable amount and the withholding.
  excluded: { treatment: "excluded", label: "xx.group.excluded" },
};

/**
 * Id of the taxable group of `rate` (percent units): "vat-" and the normalized rate with "-" for
 * the decimal point, so 21 and 21.00 give "vat-21" and 5.5 gives "vat-5-5". Group ids match
 * /^[a-z0-9][a-z0-9.-]{0,31}$/.
 */
export function vatGroupId(rate: Decimal): string {
  return `vat-${decimalToString(normalizeDecimal(rate)).replace(".", "-")}`;
}

/** The taxable group of a VAT rate: "VAT 21%". */
export function vatGroup(rate: Decimal): TaxGroup {
  const normalized = normalizeDecimal(rate);
  return {
    id: vatGroupId(normalized),
    treatment: "taxable",
    rate: normalized,
    label: message("xx.group.vat", { rate: p.percent(normalized) }),
  };
}

/** A group that is not taxable: "No VAT (small business)", "Exempt", ... */
export function fixedGroup(id: FixedGroupId): TaxGroup {
  const spec = FIXED_GROUPS[id];
  return {
    id,
    treatment: spec.treatment,
    label: message(spec.label),
    // exactOptionalPropertyTypes: leave an optional property out rather than set it to undefined.
    ...(spec.reference === undefined ? {} : { reference: message(spec.reference) }),
  };
}
