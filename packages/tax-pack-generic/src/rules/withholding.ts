/**
 * Rule 3, `generic.withholding` (docs/tax-packs/generic.md, section 2.3): an optional income tax
 * that the client withholds and pays to the tax authority, deducted from the amount payable.
 */
import { percentage } from "@fairhour/money";
import { message, p, sumNet, type ClientInput, type MessageRef } from "@fairhour/tax-core";
import { percent, type GenericWithholdingConfig, type WithholdingAppliesTo } from "../config";
import { configurationSources } from "../sources";
import type { GenericRule } from "../types";

export const WITHHOLDING_RULE_ID = "generic.withholding";
export const WITHHOLDING_COMPONENT_ID = "generic.withholding";

/**
 * Why nothing is withheld from this client, or undefined when the client must withhold:
 * `withholding-agents` asks for `client.isWithholdingAgent`; `business-clients` for a business or
 * a public administration (not a private individual).
 */
export function withholdingExemption(
  appliesTo: WithholdingAppliesTo,
  client: ClientInput,
): "not-agent" | "individual" | undefined {
  switch (appliesTo) {
    case "withholding-agents":
      return client.isWithholdingAgent ? undefined : "not-agent";
    case "business-clients":
      return client.kind === "individual" ? "individual" : undefined;
  }
}

export const withholdingRule: GenericRule = {
  id: WITHHOLDING_RULE_ID,
  title: message("generic.rule.withholding.title"),
  sources: configurationSources,
  appliesTo: (ctx) => ctx.config.withholding !== undefined,
  apply: (state, ctx) => {
    const settings: GenericWithholdingConfig | undefined = ctx.config.withholding;
    if (settings === undefined) return {}; // appliesTo skips the rule; kept for the type checker
    const label = p.text(settings.label);
    const exemption = withholdingExemption(settings.appliesTo, ctx.input.client);
    if (exemption !== undefined) {
      return { trace: [{ message: message(`generic.trace.withholding.${exemption}`, { label }) }] };
    }
    // The fee before tax: every line except disbursements (treatment "excluded").
    const base = sumNet(state, (line) => line.treatment.kind !== "excluded", ctx.currency);
    if (base.amount === 0n) {
      return { trace: [{ message: message("generic.trace.withholding.no-base", { label }) }] };
    }
    const rate = percent(settings.rate);
    const ratePercent = p.percent(rate);
    const amount = percentage(base, rate, ctx.rounding.withholdings.mode);
    const formula: MessageRef = message("core.formula.percentage", {
      rate: ratePercent,
      base: p.money(base),
      amount: p.money(amount),
    });
    return {
      components: [
        {
          id: WITHHOLDING_COMPONENT_ID,
          kind: "withholding",
          label: message("generic.component.withholding", { label }),
          effect: "deducted-from-payable",
          base,
          rate,
          amount,
        },
      ],
      trace: [
        {
          message: message("generic.trace.withholding", { label, rate: ratePercent }),
          formula,
          amount,
          componentId: WITHHOLDING_COMPONENT_ID,
        },
      ],
    };
  },
};
