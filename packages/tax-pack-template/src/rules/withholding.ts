/**
 * Rule 4, `xx.withholding`: when the client is a withholding agent, it withholds income tax on
 * the fees and pays it to the tax office; the freelancer receives the rest. The withholding does
 * not change the invoice total: it is deducted from the amount payable.
 *
 * Base: the net of the fee lines (services, recharged expenses, mileage), before VAT, without
 * goods and disbursements. Rate: the configured one (standard, or new business). Rounded half up,
 * once on the invoice.
 */
import { percentage } from "@fairhour/money";
import { message, p, sumNet, type NetLine } from "@fairhour/tax-core";
import { withholdingRate } from "../parameters";
import { incomeTaxActWithholding } from "../sources";
import type { XxRule } from "../types";

// TEMPLATE: if your country has no withholding on professional fees, delete this rule, its test,
// its messages and the `withholding` settings. If it has one, check what its base includes
// (contributions? expenses?) and whether every business client withholds or only some.

export const WITHHOLDING_RULE_ID = "xx.withholding";
export const WITHHOLDING_COMPONENT_ID = "xx.withholding";

const FEE_KINDS: readonly NetLine["kind"][] = ["service", "expense", "mileage"];

/** True for a line in the withholding base: a fee, not a disbursement. */
export function isFeeLine(line: Pick<NetLine, "kind" | "treatment">): boolean {
  return FEE_KINDS.includes(line.kind) && line.treatment.kind !== "excluded";
}

export const withholdingRule: XxRule = {
  id: WITHHOLDING_RULE_ID,
  title: message("xx.rule.withholding.title"),
  sources: [incomeTaxActWithholding],
  appliesTo: (ctx) => ctx.config.withholding.enabled,
  apply: (state, ctx) => {
    if (!ctx.input.client.isWithholdingAgent) {
      return { trace: [{ message: message("xx.trace.withholding.not-agent") }] };
    }
    if (ctx.options.withholding === "skip") {
      return { trace: [{ message: message("xx.trace.withholding.skipped") }] };
    }
    const base = sumNet(state, (line) => isFeeLine(line), ctx.currency);
    if (base.amount === 0n) {
      return { trace: [{ message: message("xx.trace.withholding.no-base") }] };
    }
    const rate = withholdingRate(ctx.params, ctx.config.withholding.rate);
    // Money only through @fairhour/money, with the rounding mode of the pack's policy.
    const amount = percentage(base, rate, ctx.rounding.withholdings.mode);
    return {
      components: [
        {
          id: WITHHOLDING_COMPONENT_ID,
          kind: "withholding",
          label: message("xx.component.withholding", { rate: p.percent(rate) }),
          effect: "deducted-from-payable",
          base,
          rate,
          amount,
        },
      ],
      trace: [
        {
          message: message("xx.trace.withholding", { rate: p.percent(rate) }),
          formula: message("core.formula.percentage", {
            rate: p.percent(rate),
            base: p.money(base),
            amount: p.money(amount),
          }),
          amount,
          componentId: WITHHOLDING_COMPONENT_ID,
        },
      ],
    };
  },
};
