/**
 * Rule 10, `it.ordinario.split-payment` (docs/tax-packs/it.md, section 7.9): for Italian public
 * administrations (or clients the user marks with the option "apply") the client pays the VAT
 * directly to the State (art. 17-ter DPR 633/1972), so it is deducted from the amount payable.
 * Excluded when the fees are subject to withholding (art. 17-ter, c. 1-sexies) and after the end
 * of the EU authorisation.
 */
import { message, p, findComponent } from "@fairhour/tax-core";
import { sources } from "../sources";
import type { ItContext, ItOutput, ItRule } from "../types";
import { VAT_ID } from "./vat";

export const SPLIT_PAYMENT_ID = "it.split-payment";

/** Structural applicability: ordinario, not skipped, and forced or an Italian PA client. */
export function splitPaymentApplies(ctx: ItContext): boolean {
  if (ctx.config.regime !== "ordinario") return false;
  const option = ctx.options.splitPayment;
  if (option === "skip") return false;
  if (option === "apply") return true;
  const { client } = ctx.input;
  return (
    ctx.config.splitPayment === "auto" &&
    client.kind === "public-administration" &&
    client.country === "IT"
  );
}

export const splitPayment: ItRule = {
  id: "it.ordinario.split-payment",
  title: message("it.rule.ordinario.split-payment.title"),
  sources: [
    sources.splitPayment,
    sources.splitPaymentWithholdingExclusion,
    sources.splitPaymentDecision2026,
    sources.splitPaymentDecision2023,
    sources.fatturapaEsigibilita,
  ],
  appliesTo: splitPaymentApplies,
  apply: (state, ctx): ItOutput => {
    if (state.facts.withholdingApplied) {
      return {
        trace: [
          {
            message: message("it.trace.split-payment.withholding"),
            sources: [sources.splitPaymentWithholdingExclusion],
          },
        ],
      };
    }
    const until = ctx.params.splitPayment.authorisedUntil;
    if (ctx.input.issueDate > until) {
      const date = p.date(until);
      return {
        warnings: [
          {
            code: "it.split-payment.authorisation-expired",
            severity: "warning",
            message: message("it.warning.split-payment.authorisation-expired", { date }),
          },
        ],
        trace: [{ message: message("it.trace.split-payment.expired", { date }) }],
      };
    }
    const vat = findComponent(state, VAT_ID);
    if (vat === undefined || vat.amount.amount === 0n)
      return { trace: [{ message: message("it.trace.split-payment.no-vat") }] };
    return {
      components: [
        {
          id: SPLIT_PAYMENT_ID,
          kind: "other",
          label: message("it.component.split-payment"),
          effect: "deducted-from-payable",
          base: vat.amount,
          amount: vat.amount,
          exportCodes: { "fatturapa.EsigibilitaIVA": "S" },
        },
      ],
      legalNotes: [{ id: "it.note.split-payment", message: message("it.note.split-payment") }],
      trace: [
        {
          message: message("it.trace.split-payment", { amount: p.money(vat.amount) }),
          amount: vat.amount,
          componentId: SPLIT_PAYMENT_ID,
        },
      ],
    };
  },
};
