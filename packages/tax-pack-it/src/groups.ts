/**
 * Tax groups of the Italian pack (docs/tax-packs/it.md, section 6): the rows of the VAT summary
 * (FatturaPA `DatiRiepilogo`). Ids are stable; `exportCodes` carry the FatturaPA `AliquotaIVA` or
 * `Natura` so that the XML exporter (phase 10) needs no tax logic.
 */
import {
  compareDecimal,
  decimalToString,
  normalizeDecimal,
  rescaleDecimal,
  type Decimal,
} from "@fairhour/money";
import { message, p, type TaxGroup } from "@fairhour/tax-core";

export const N1 = "n1";
export const N2_1 = "n2.1";
export const N2_2 = "n2.2";
export const N4 = "n4";

const VAT_PREFIX = "vat-";

/** "vat-22", "vat-10", "vat-5", "vat-4". */
export function vatGroupId(rate: Decimal): string {
  return `${VAT_PREFIX}${decimalToString(normalizeDecimal(rate))}`;
}

/** FatturaPA `AliquotaIVA`: two decimals ("22.00"). */
export function aliquotaIva(rate: Decimal): string {
  return decimalToString(rescaleDecimal(normalizeDecimal(rate), 2, "halfUp"));
}

export function vatGroup(rate: Decimal): TaxGroup {
  const normalized = normalizeDecimal(rate);
  return {
    id: vatGroupId(normalized),
    treatment: "taxable",
    rate: normalized,
    label: message("it.group.vat", { rate: p.percent(normalized) }),
    exportCodes: { "fatturapa.AliquotaIVA": aliquotaIva(normalized) },
  };
}

/** N2.2: forfettario lines (every regime line) or ordinario lines marked out-of-scope. */
export function n22Group(regime: "forfettario" | "ordinario"): TaxGroup {
  return regime === "forfettario"
    ? {
        id: N2_2,
        treatment: "out-of-scope",
        label: message("it.group.n2-2-forfettario"),
        reference: message("it.group.reference.forfettario"),
        exportCodes: { "fatturapa.Natura": "N2.2" },
      }
    : {
        id: N2_2,
        treatment: "out-of-scope",
        label: message("it.group.n2-2"),
        exportCodes: { "fatturapa.Natura": "N2.2" },
      };
}

/** N2.1: services to business clients established abroad (art. 7-ter). */
export function n21Group(): TaxGroup {
  return {
    id: N2_1,
    treatment: "out-of-scope",
    label: message("it.group.n2-1"),
    reference: message("it.group.reference.art7-ter"),
    exportCodes: { "fatturapa.Natura": "N2.1" },
  };
}

/** N4: exempt transactions (art. 10). */
export function n4Group(): TaxGroup {
  return {
    id: N4,
    treatment: "exempt",
    label: message("it.group.n4"),
    reference: message("it.group.reference.art10"),
    exportCodes: { "fatturapa.Natura": "N4" },
  };
}

/** N1: amounts excluded from the VAT base (art. 15 disbursements; the recharged stamp duty). */
export function n1Group(): TaxGroup {
  return {
    id: N1,
    treatment: "excluded",
    label: message("it.group.n1"),
    reference: message("it.group.reference.art15"),
    exportCodes: { "fatturapa.Natura": "N1" },
  };
}

const NON_VAT_ORDER: readonly string[] = [N2_1, N2_2, N4, N1];

/**
 * Canonical order of the summary rows, independent of the line order: VAT groups by descending
 * rate, then N2.1, N2.2, N4 and N1.
 */
export function compareGroups(a: TaxGroup, b: TaxGroup): number {
  if (a.rate !== undefined && b.rate !== undefined) return compareDecimal(b.rate, a.rate);
  if (a.rate !== undefined) return -1;
  if (b.rate !== undefined) return 1;
  return NON_VAT_ORDER.indexOf(a.id) - NON_VAT_ORDER.indexOf(b.id);
}
