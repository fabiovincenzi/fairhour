/**
 * Rule 9, `it.common.stamp-duty` (docs/tax-packs/it.md, section 7.8): €2.00 of imposta di bollo
 * when the amount not subject to VAT (the bases of the N1, N2.1, N2.2 and N4 groups, before the
 * duty itself) exceeds €77.47. Charged to the client (allocated to N2.2 in forfettario, N1 in
 * ordinario) or absorbed by the professional (informational); always absorbed on credit notes.
 */
import { add, greaterThan, toDecimalString } from "@fairhour/money";
import { groupBase, message, p, type MessageRef, type TaxGroup } from "@fairhour/tax-core";
import { N1, N2_2, n1Group, n22Group } from "../groups";
import { sources } from "../sources";
import type { ItContext, ItOutput, ItRule } from "../types";

export const STAMP_DUTY_ID = "it.stamp-duty";

type Payer = "client" | "professional" | "credit-note";

/** Who pays a duty that is due: the per-invoice option, else the configuration. */
function payerOf(ctx: ItContext): Payer {
  if (ctx.input.documentKind === "credit-note") return "credit-note";
  switch (ctx.options.stampDuty) {
    case "charge":
      return "client";
    case "absorb":
      return "professional";
    case "auto":
    case "not-due":
      return ctx.config.stampDuty.charge === "client" ? "client" : "professional";
  }
}

const TRACE_KEYS: Readonly<Record<Payer, string>> = {
  client: "it.trace.stamp-duty.charged",
  professional: "it.trace.stamp-duty.absorbed",
  "credit-note": "it.trace.stamp-duty.credit-note",
};

export const stampDuty: ItRule = {
  id: "it.common.stamp-duty",
  title: message("it.rule.common.stamp-duty.title"),
  sources: [
    sources.stampDuty,
    sources.stampDutyThreshold,
    sources.stampDutyVatExemption,
    sources.stampDutyAmount,
    sources.stampDutyMixedInvoices,
    sources.stampDutyDisbursements,
    sources.stampDutyForfettarioRecharge,
    sources.stampDutyVirtual,
    sources.eInvoicingForfettari,
    sources.fatturapaBollo,
  ],
  apply: (state, ctx): ItOutput => {
    let base = ctx.zero;
    for (const group of state.groups) {
      if (group.treatment !== "taxable") base = add(base, groupBase(state, group.id, ctx.currency));
    }
    const { amount: duty, threshold } = ctx.params.stampDuty;
    const texts = { amount: p.money(duty), base: p.money(base), threshold: p.money(threshold) };

    if (ctx.options.stampDuty === "not-due") {
      return {
        warnings: [
          {
            code: "it.stamp-duty.override",
            severity: "warning",
            message: message("it.warning.stamp-duty.override"),
          },
        ],
        trace: [{ message: message("it.trace.stamp-duty.override") }],
      };
    }
    if (!greaterThan(base, threshold)) {
      return {
        trace: [
          {
            message: message("it.trace.stamp-duty.not-due", texts),
            formula: message("it.formula.not-above-threshold", texts),
          },
        ],
      };
    }

    const payer = payerOf(ctx);
    const forfettario = ctx.config.regime === "forfettario";
    const groupId = forfettario ? N2_2 : N1;
    const register: TaxGroup[] =
      payer === "client" && !state.groups.some((group) => group.id === groupId)
        ? [forfettario ? n22Group("forfettario") : n1Group()]
        : [];
    const label: MessageRef = message("it.component.stamp-duty");
    return {
      groups: register,
      components: [
        {
          id: STAMP_DUTY_ID,
          kind: "stamp-duty",
          label,
          effect: payer === "client" ? "adds-to-total" : "informational",
          base,
          amount: duty,
          ...(payer === "client" ? { allocations: [{ groupId, base, amount: duty }] } : {}),
          exportCodes: {
            "fatturapa.BolloVirtuale": "SI",
            "fatturapa.ImportoBollo": toDecimalString(duty),
          },
        },
      ],
      legalNotes: [
        {
          id: "it.note.stamp-duty",
          message: message("it.note.stamp-duty"),
          sources: [sources.stampDutyVirtual],
        },
      ],
      warnings:
        payer === "credit-note"
          ? [
              {
                code: "it.stamp-duty.credit-note-absorbed",
                severity: "info",
                message: message("it.warning.stamp-duty.credit-note-absorbed"),
              },
            ]
          : [],
      trace: [
        {
          message: message(TRACE_KEYS[payer], texts),
          formula: message("it.formula.above-threshold", texts),
          amount: duty,
          componentId: STAMP_DUTY_ID,
        },
      ],
    };
  },
};
