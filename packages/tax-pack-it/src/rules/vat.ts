/**
 * Rule 5, `it.ordinario.vat` (docs/tax-packs/it.md, section 7.5): VAT once per rate on the
 * summary (FatturaPA `DatiRiepilogo`), on the group base (lines, general expenses, cassa
 * contribution and INPS rivalsa allocated to the group), rounded half up to the cent.
 */
import type { Decimal } from "@fairhour/money";
import { message, p, sumAllocations, taxAllocations, type TraceDraft } from "@fairhour/tax-core";
import { sources } from "../sources";
import type { ItOutput, ItRule } from "../types";

export const VAT_ID = "it.vat";

export const vat: ItRule = {
  id: "it.ordinario.vat",
  title: message("it.rule.ordinario.vat.title"),
  sources: [
    sources.vatStandardRate,
    sources.vatReducedRates,
    sources.vatTaxableAmount,
    sources.vatRoundingToCent,
    sources.euroRounding,
  ],
  appliesTo: (ctx) => ctx.config.regime === "ordinario",
  apply: (state, ctx): ItOutput => {
    const allocations = taxAllocations(state, ctx.rounding.taxes, ctx.currency);
    if (allocations.length === 0) return { trace: [{ message: message("it.trace.vat.none") }] };
    const totals = sumAllocations(allocations, ctx.currency);
    const trace: TraceDraft[] = [];
    const rates: Decimal[] = [];
    // Group order, which is the order of the allocations; zero-base groups have none.
    for (const group of state.groups) {
      const rate = group.rate;
      const allocation = allocations.find((item) => item.groupId === group.id);
      if (rate === undefined || allocation === undefined) continue;
      rates.push(rate);
      trace.push({
        message: message("it.trace.vat", { rate: p.percent(rate) }),
        formula: message("it.formula.percentage", {
          rate: p.percent(rate),
          base: p.money(allocation.base),
          amount: p.money(allocation.amount),
        }),
        amount: allocation.amount,
        componentId: VAT_ID,
      });
    }
    const [single] = rates;
    return {
      components: [
        {
          id: VAT_ID,
          kind: "tax",
          label: message("it.component.vat"),
          effect: "adds-to-total",
          base: totals.base,
          // The component rate is only meaningful with one taxable group.
          ...(rates.length === 1 && single !== undefined ? { rate: single } : {}),
          amount: totals.amount,
          allocations,
        },
      ],
      trace,
    };
  },
};
