/**
 * Rule 2, `xx.vat`: the VAT, for VAT-registered businesses. One `tax` component with one
 * allocation per taxable group, computed by tax-core's `taxAllocations` with the rounding policy
 * (half up, once per rate). The engine allows one tax allocation per group: a second tax on the
 * same group is a contract violation.
 */
import type { Decimal, Money } from "@fairhour/money";
import {
  message,
  p,
  sumAllocations,
  taxAllocations,
  type Allocation,
  type MessageRef,
  type TraceDraft,
} from "@fairhour/tax-core";
import { vatActRates } from "../sources";
import type { XxRule } from "../types";

// TEMPLATE: most VAT, GST and sales taxes fit this rule as it is. A tax that is not computed on
// the group's base (a tax on a tax, a tax-inclusive price) does not fit the engine: open an issue
// before you write it.

export const VAT_RULE_ID = "xx.vat";
export const VAT_COMPONENT_ID = "xx.vat";

/** "{rate} × {base} = {amount}", the engine's shared formula. */
function percentageFormula(rate: Decimal, base: Money, amount: Money): MessageRef {
  return message("core.formula.percentage", {
    rate: p.percent(rate),
    base: p.money(base),
    amount: p.money(amount),
  });
}

export const vatRule: XxRule = {
  id: VAT_RULE_ID,
  title: message("xx.rule.vat.title"),
  sources: [vatActRates],
  // `appliesTo` is structural (the regime): when it is false the rule is skipped silently.
  appliesTo: (ctx) => ctx.config.vatRegistered,
  apply: (state, ctx) => {
    const allocations = taxAllocations(state, ctx.rounding.taxes, ctx.currency);
    // A business outcome ("nothing to tax") is explained in the trace, never skipped silently.
    if (allocations.length === 0) return { trace: [{ message: message("xx.trace.vat.none") }] };

    // The allocations with their group's rate, in summary order (highest rate first).
    const taxed: { readonly rate: Decimal; readonly allocation: Allocation }[] = [];
    for (const group of state.groups) {
      const allocation = allocations.find((item) => item.groupId === group.id);
      if (allocation === undefined || group.rate === undefined) continue;
      taxed.push({ rate: group.rate, allocation });
    }

    const trace: TraceDraft[] = taxed.map(({ rate, allocation }) => ({
      message: message("xx.trace.vat", { rate: p.percent(rate) }),
      formula: percentageFormula(rate, allocation.base, allocation.amount),
      amount: allocation.amount,
      // Every component needs at least one trace step that names it.
      componentId: VAT_COMPONENT_ID,
    }));

    const totals = sumAllocations(allocations, ctx.currency);
    const [single] = taxed;
    return {
      components: [
        {
          id: VAT_COMPONENT_ID,
          kind: "tax",
          label: message("xx.component.vat"),
          effect: "adds-to-total",
          base: totals.base,
          // A tax over several rates has no rate of its own: each allocation has its group's.
          ...(taxed.length === 1 && single !== undefined ? { rate: single.rate } : {}),
          amount: totals.amount,
          allocations,
        },
      ],
      trace,
    };
  },
};
