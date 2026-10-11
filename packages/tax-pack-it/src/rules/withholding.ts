/**
 * Rule 6, `it.ordinario.withholding` (docs/tax-packs/it.md, section 7.6): the ritenuta d'acconto
 * a withholding agent (sostituto d'imposta) retains on a professional's fees.
 *
 * Base: fee lines (service, expense, mileage) in any non-excluded group, the general expenses and
 * the INPS rivalsa; never the cassa contribution, VAT, art. 15 disbursements, goods or the stamp
 * duty. Then the configured base share (agents: 50 or 20 %), then the rate (20 % by default),
 * each rounded half up to the cent, once on the document.
 */
import { add, compareDecimal, DECIMAL_HUNDRED, percentage, type Decimal } from "@fairhour/money";
import {
  findComponent,
  message,
  p,
  sumNet,
  type TraceDraft,
  type WarningDraft,
} from "@fairhour/tax-core";
import { percent, type ItConfig } from "../config";
import type { ItParams } from "../parameters";
import { sources } from "../sources";
import { FEE_LINE_KINDS, type ItOutput, type ItRule } from "../types";
import { GENERAL_EXPENSES_ID } from "./general-expenses";
import { INPS_RIVALSA_ID } from "./inps-rivalsa";

export const WITHHOLDING_ID = "it.withholding";

/** The withholding settings in force, or undefined when the regime has none or it is disabled. */
export function withholdingSettings(
  config: ItConfig,
  params: ItParams,
):
  | {
      readonly rate: Decimal;
      readonly baseShare: Decimal;
      readonly tipoRitenuta: string;
      readonly causalePagamento: string;
    }
  | undefined {
  if (config.regime !== "ordinario" || !config.withholding.enabled) return undefined;
  const { rate, baseShare, tipoRitenuta, causalePagamento } = config.withholding;
  return {
    rate: rate === undefined ? params.withholding.professionalRate : percent(rate),
    baseShare: percent(baseShare),
    tipoRitenuta,
    causalePagamento,
  };
}

export const withholding: ItRule = {
  id: "it.ordinario.withholding",
  title: message("it.rule.ordinario.withholding.title"),
  sources: [
    sources.withholding,
    sources.withholdingBase,
    sources.withholdingAgents,
    sources.fatturapaRitenuta,
  ],
  appliesTo: (ctx) => withholdingSettings(ctx.config, ctx.params) !== undefined,
  apply: (state, ctx): ItOutput => {
    const settings = withholdingSettings(ctx.config, ctx.params);
    if (settings === undefined) return {};
    const { client } = ctx.input;
    if (!client.isWithholdingAgent)
      return { trace: [{ message: message("it.trace.withholding.not-agent") }] };
    const warnings: WarningDraft[] =
      client.country === "IT"
        ? []
        : [
            {
              code: "it.withholding.foreign-agent",
              severity: "warning",
              message: message("it.warning.withholding.foreign-agent"),
            },
          ];
    const fees = sumNet(
      state,
      (line, group) =>
        FEE_LINE_KINDS.includes(line.kind) && group !== undefined && group.treatment !== "excluded",
      ctx.currency,
    );
    const generalExpenses = findComponent(state, GENERAL_EXPENSES_ID)?.amount ?? ctx.zero;
    const rivalsa = findComponent(state, INPS_RIVALSA_ID)?.amount ?? ctx.zero;
    const gross = add(add(fees, generalExpenses), rivalsa);
    if (gross.amount === 0n)
      return { warnings, trace: [{ message: message("it.trace.withholding.no-base") }] };

    const mode = ctx.rounding.withholdings.mode;
    const trace: TraceDraft[] = [
      {
        message: message("it.trace.withholding.gross"),
        formula: message("it.formula.withholding-gross", {
          fees: p.money(fees),
          generalExpenses: p.money(generalExpenses),
          rivalsa: p.money(rivalsa),
          gross: p.money(gross),
        }),
        amount: gross,
      },
    ];
    let base = gross;
    if (compareDecimal(settings.baseShare, DECIMAL_HUNDRED) !== 0) {
      base = percentage(gross, settings.baseShare, mode);
      trace.push({
        message: message("it.trace.withholding.share", { share: p.percent(settings.baseShare) }),
        formula: message("it.formula.percentage", {
          rate: p.percent(settings.baseShare),
          base: p.money(gross),
          amount: p.money(base),
        }),
        amount: base,
      });
    }
    const amount = percentage(base, settings.rate, mode);
    trace.push({
      message: message("it.trace.withholding", { rate: p.percent(settings.rate) }),
      formula: message("it.formula.percentage", {
        rate: p.percent(settings.rate),
        base: p.money(base),
        amount: p.money(amount),
      }),
      amount,
      componentId: WITHHOLDING_ID,
    });
    return {
      components: [
        {
          id: WITHHOLDING_ID,
          kind: "withholding",
          label: message("it.component.withholding", { rate: p.percent(settings.rate) }),
          effect: "deducted-from-payable",
          base,
          rate: settings.rate,
          amount,
          exportCodes: {
            "fatturapa.TipoRitenuta": settings.tipoRitenuta,
            "fatturapa.CausalePagamento": settings.causalePagamento,
          },
        },
      ],
      warnings,
      trace,
      facts: { withholdingApplied: true },
    };
  },
};
