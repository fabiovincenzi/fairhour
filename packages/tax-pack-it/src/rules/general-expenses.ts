/**
 * Rule 2, `it.common.general-expenses` (docs/tax-packs/it.md, section 7.2): the lawyers' flat
 * reimbursement of general expenses (spese generali), 15 % of the fee. It is part of the fee: it
 * follows the VAT treatment of the fee's groups and enters the cassa, VAT and withholding bases.
 */
import type { Decimal } from "@fairhour/money";
import { basesByGroup, message, p, percentageByGroup, sumAllocations } from "@fairhour/tax-core";
import { percent, type ItConfig } from "../config";
import type { ItParams } from "../parameters";
import { sources } from "../sources";
import type { ItOutput, ItRule } from "../types";

export const GENERAL_EXPENSES_ID = "it.general-expenses";

/** The configured rate, else the parameter; undefined when general expenses are not enabled. */
export function generalExpensesRate(config: ItConfig, params: ItParams): Decimal | undefined {
  const settings = config.generalExpenses;
  if (settings === undefined) return undefined;
  return settings.rate === undefined ? params.generalExpenses.rate : percent(settings.rate);
}

export const generalExpenses: ItRule = {
  id: "it.common.general-expenses",
  title: message("it.rule.common.general-expenses.title"),
  sources: [sources.generalExpenses, sources.generalExpensesCnf, sources.withholdingBase],
  appliesTo: (ctx) => ctx.config.generalExpenses !== undefined,
  apply: (state, ctx): ItOutput => {
    const rate = generalExpensesRate(ctx.config, ctx.params);
    if (rate === undefined) return {};
    // The fee (compenso): service lines that are not art. 15 disbursements.
    const bases = basesByGroup(state, {
      lines: (line, group) => line.kind === "service" && group.treatment !== "excluded",
    });
    if (bases.length === 0)
      return { trace: [{ message: message("it.trace.general-expenses.none") }] };
    const allocations = percentageByGroup(bases, rate, ctx.rounding.contributions.mode);
    const totals = sumAllocations(allocations, ctx.currency);
    return {
      components: [
        {
          id: GENERAL_EXPENSES_ID,
          kind: "surcharge",
          label: message("it.component.general-expenses", { rate: p.percent(rate) }),
          effect: "adds-to-total",
          base: totals.base,
          rate,
          amount: totals.amount,
          allocations,
        },
      ],
      trace: [
        {
          message: message("it.trace.general-expenses", { rate: p.percent(rate) }),
          formula: message("it.formula.percentage", {
            rate: p.percent(rate),
            base: p.money(totals.base),
            amount: p.money(totals.amount),
          }),
          amount: totals.amount,
          componentId: GENERAL_EXPENSES_ID,
        },
      ],
    };
  },
};
