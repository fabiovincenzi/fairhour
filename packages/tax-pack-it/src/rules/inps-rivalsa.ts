/**
 * Rule 4, `it.common.inps-rivalsa` (docs/tax-packs/it.md, section 7.4): the optional 4 %
 * surcharge of professionals enrolled in the INPS Gestione Separata. Part of the consideration:
 * in ordinario it enters the VAT base and the withholding base; in forfettario it counts towards
 * the revenue ceiling.
 */
import type { Decimal } from "@fairhour/money";
import { basesByGroup, message, p, percentageByGroup, sumAllocations } from "@fairhour/tax-core";
import { percent, type SocialSecurityConfig } from "../config";
import { sources } from "../sources";
import { isFeeLine, withholdingEnabledFor, type ItOutput, type ItRule } from "../types";
import { GENERAL_EXPENSES_ID } from "./general-expenses";

export const INPS_RIVALSA_ID = "it.inps-rivalsa";

/** FatturaPA TipoCassa of the INPS Gestione Separata. */
export const INPS_TIPO_CASSA = "TC22";

/** The rivalsa rate when the professional charges it, else undefined. */
export function rivalsaRate(socialSecurity: SocialSecurityConfig): Decimal | undefined {
  return socialSecurity.kind === "inps-gestione-separata" && socialSecurity.rivalsa
    ? percent(socialSecurity.rate)
    : undefined;
}

export const inpsRivalsa: ItRule = {
  id: "it.common.inps-rivalsa",
  title: message("it.rule.common.inps-rivalsa.title"),
  sources: [
    sources.inpsRivalsa,
    sources.vatTaxableAmount,
    sources.withholdingBase,
    sources.fatturapaTipoCassa,
  ],
  appliesTo: (ctx) => rivalsaRate(ctx.config.socialSecurity) !== undefined,
  apply: (state, ctx): ItOutput => {
    const rate = rivalsaRate(ctx.config.socialSecurity);
    if (rate === undefined) return {};
    const bases = basesByGroup(state, {
      lines: isFeeLine,
      includeComponents: [GENERAL_EXPENSES_ID],
    });
    if (bases.length === 0) return { trace: [{ message: message("it.trace.inps-rivalsa.none") }] };
    const allocations = percentageByGroup(bases, rate, ctx.rounding.contributions.mode);
    const totals = sumAllocations(allocations, ctx.currency);
    // "SI" exactly when it.ordinario.withholding will withhold (it runs later, on these fees).
    const withheld = withholdingEnabledFor(ctx.config, ctx.input.client);
    return {
      components: [
        {
          id: INPS_RIVALSA_ID,
          kind: "contribution",
          label: message("it.component.inps-rivalsa", { rate: p.percent(rate) }),
          effect: "adds-to-total",
          base: totals.base,
          rate,
          amount: totals.amount,
          allocations,
          exportCodes: {
            "fatturapa.TipoCassa": INPS_TIPO_CASSA,
            "fatturapa.Ritenuta": withheld ? "SI" : "NO",
          },
        },
      ],
      trace: [
        {
          message: message("it.trace.inps-rivalsa", { rate: p.percent(rate) }),
          formula: message("it.formula.percentage", {
            rate: p.percent(rate),
            base: p.money(totals.base),
            amount: p.money(totals.amount),
          }),
          amount: totals.amount,
          componentId: INPS_RIVALSA_ID,
        },
      ],
    };
  },
};
