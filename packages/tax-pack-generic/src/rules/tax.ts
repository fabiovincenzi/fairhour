/**
 * Rule 2, `generic.tax` (docs/tax-packs/generic.md, section 2.2): one `tax` component with one
 * allocation per taxable group, computed by tax-core's `taxAllocations`. `per-document` rounds
 * rate × group base once per group; `per-line` rounds rate × line net for each line and sums
 * per group (the trace then shows every line).
 */
import { percentage, type Decimal, type Money } from "@fairhour/money";
import {
  linesInGroup,
  message,
  p,
  sumAllocations,
  taxAllocations,
  type Allocation,
  type MessageRef,
  type TaxGroup,
  type TraceDraft,
} from "@fairhour/tax-core";
import { configurationSources } from "../sources";
import type { GenericRule } from "../types";

export const TAX_RULE_ID = "generic.tax";
export const TAX_COMPONENT_ID = "generic.tax";

function percentageFormula(rate: Decimal, base: Money, amount: Money): MessageRef {
  return message("core.formula.percentage", {
    rate: p.percent(rate),
    base: p.money(base),
    amount: p.money(amount),
  });
}

interface TaxedGroup {
  readonly group: TaxGroup;
  readonly rate: Decimal;
  readonly allocation: Allocation;
}

export const taxRule: GenericRule = {
  id: TAX_RULE_ID,
  title: message("generic.rule.tax.title"),
  sources: configurationSources,
  appliesTo: (ctx) => ctx.config.tax.kind === "rate",
  apply: (state, ctx) => {
    const label = p.text(ctx.config.taxLabel);
    const policy = ctx.rounding.taxes;
    const allocations = taxAllocations(state, policy, ctx.currency);
    if (allocations.length === 0) {
      return { trace: [{ message: message("generic.trace.tax.none", { label }) }] };
    }

    // The allocations with their groups, in group order (highest rate first).
    const taxed: TaxedGroup[] = [];
    for (const group of state.groups) {
      const allocation = allocations.find((item) => item.groupId === group.id);
      if (allocation === undefined || group.rate === undefined) continue;
      taxed.push({ group, rate: group.rate, allocation });
    }

    const trace: TraceDraft[] = [];
    for (const { group, rate, allocation } of taxed) {
      if (policy.scope === "per-line") {
        // The same rounding as taxAllocations: one percentage per line net, then the sum.
        for (const line of linesInGroup(state, group.id)) {
          const amount = percentage(line.net, rate, policy.mode);
          trace.push({
            message: message("generic.trace.tax.line", {
              label,
              rate: p.percent(rate),
              description: p.text(line.description),
            }),
            formula: percentageFormula(rate, line.net, amount),
            amount,
            componentId: TAX_COMPONENT_ID,
          });
        }
        trace.push({
          message: message("generic.trace.tax.per-line", { label, rate: p.percent(rate) }),
          formula: message("generic.formula.tax-per-line", {
            rate: p.percent(rate),
            base: p.money(allocation.base),
            amount: p.money(allocation.amount),
          }),
          amount: allocation.amount,
          componentId: TAX_COMPONENT_ID,
        });
      } else {
        trace.push({
          message: message("generic.trace.tax", { label, rate: p.percent(rate) }),
          formula: percentageFormula(rate, allocation.base, allocation.amount),
          amount: allocation.amount,
          componentId: TAX_COMPONENT_ID,
        });
      }
    }

    const totals = sumAllocations(allocations, ctx.currency);
    const [single] = taxed;
    return {
      components: [
        {
          id: TAX_COMPONENT_ID,
          kind: "tax",
          label: message("generic.component.tax", { label }),
          effect: "adds-to-total",
          base: totals.base,
          // A tax spanning several rates has no single rate: each allocation has its group's.
          ...(taxed.length === 1 && single !== undefined ? { rate: single.rate } : {}),
          amount: totals.amount,
          allocations,
        },
      ],
      trace,
    };
  },
};
