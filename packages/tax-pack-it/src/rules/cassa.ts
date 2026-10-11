/**
 * Rule 3, `it.common.cassa` (docs/tax-packs/it.md, section 7.3): the integrative contribution
 * (contributo integrativo) of a professional fund, charged on the fees and the general expenses.
 * Subject to VAT in ordinario (allocated to the fees' groups), never part of the withholding base,
 * not revenue for the forfettario ceiling.
 */
import type { Decimal } from "@fairhour/money";
import {
  basesByGroup,
  message,
  p,
  percentageByGroup,
  sumAllocations,
  type SourceRef,
} from "@fairhour/tax-core";
import { percent, type SocialSecurityConfig } from "../config";
import type { ItParams } from "../parameters";
import { cassaRateSources, sources, tipoCassaSource } from "../sources";
import { isFeeLine, type ItOutput, type ItRule } from "../types";
import { GENERAL_EXPENSES_ID } from "./general-expenses";

export const CASSA_ID = "it.cassa";

/** A configured fund with its preset values and overrides applied. */
export interface ResolvedCassa {
  readonly name: string;
  readonly rate: Decimal;
  readonly tipoCassa: string;
  /** False when a preset rate still to be verified is in use. */
  readonly rateVerified: boolean;
  /** Sources of the rate and of the FatturaPA code. */
  readonly sources: readonly SourceRef[];
}

/**
 * Resolves the configured fund: the preset's rate, code and name unless overridden. Undefined
 * when the scheme is not a cassa, or for a "custom" fund without rate, code or name (the
 * configuration schema rejects that).
 */
export function resolveCassa(
  socialSecurity: SocialSecurityConfig,
  params: ItParams,
): ResolvedCassa | undefined {
  if (socialSecurity.kind !== "cassa") return undefined;
  const { preset, rate, tipoCassa, name } = socialSecurity;
  if (preset === "custom") {
    if (rate === undefined || tipoCassa === undefined || name === undefined) return undefined;
    return {
      name,
      rate: percent(rate),
      tipoCassa,
      rateVerified: true,
      sources: [sources.cassaCustom, tipoCassaSource(tipoCassa)],
    };
  }
  const values = params.cassa[preset];
  const code = tipoCassa ?? values.tipoCassa;
  return {
    name: name ?? values.name,
    rate: rate === undefined ? values.rate : percent(rate),
    tipoCassa: code,
    rateVerified: rate !== undefined || values.rateVerified,
    sources: [
      cassaRateSources[preset],
      ...(preset === "cassa-forense" ? [sources.cassaForenseLaw] : []),
      tipoCassaSource(code),
    ],
  };
}

const RULE_SOURCES: readonly SourceRef[] = [
  sources.cassaVat,
  sources.cassaVatCourt,
  sources.withholdingBase,
];

export const cassa: ItRule = {
  id: "it.common.cassa",
  title: message("it.rule.common.cassa.title"),
  sources: RULE_SOURCES,
  appliesTo: (ctx) => ctx.config.socialSecurity.kind === "cassa",
  apply: (state, ctx): ItOutput => {
    const fund = resolveCassa(ctx.config.socialSecurity, ctx.params);
    if (fund === undefined) return {};
    const cited = [...RULE_SOURCES, ...fund.sources];
    const name = p.text(fund.name);
    const rate = p.percent(fund.rate);
    const warnings = fund.rateVerified
      ? []
      : [
          {
            code: "it.cassa.rate-to-be-verified",
            severity: "info" as const,
            message: message("it.warning.cassa.rate-to-be-verified", { name, rate }),
          },
        ];
    const bases = basesByGroup(state, {
      lines: isFeeLine,
      includeComponents: [GENERAL_EXPENSES_ID],
    });
    if (bases.length === 0) {
      return {
        warnings,
        trace: [{ message: message("it.trace.cassa.none", { name }), sources: cited }],
      };
    }
    const allocations = percentageByGroup(bases, fund.rate, ctx.rounding.contributions.mode);
    const totals = sumAllocations(allocations, ctx.currency);
    return {
      components: [
        {
          id: CASSA_ID,
          kind: "contribution",
          label: message("it.component.cassa", { name, rate }),
          effect: "adds-to-total",
          base: totals.base,
          rate: fund.rate,
          amount: totals.amount,
          allocations,
          exportCodes: { "fatturapa.TipoCassa": fund.tipoCassa, "fatturapa.Ritenuta": "NO" },
          sources: cited,
        },
      ],
      warnings,
      trace: [
        {
          message: message("it.trace.cassa", { name, rate }),
          formula: message("it.formula.percentage", {
            rate,
            base: p.money(totals.base),
            amount: p.money(totals.amount),
          }),
          amount: totals.amount,
          componentId: CASSA_ID,
          sources: cited,
        },
      ],
    };
  },
};
