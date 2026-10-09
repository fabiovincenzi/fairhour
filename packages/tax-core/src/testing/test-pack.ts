/**
 * The internal test pack used by tax-core's own tests (design 4.14). Not exported.
 *
 * A fictional country "xx" whose rules exercise every part of the engine contract:
 * - classify-lines: standard -> a 20 % taxable group (from the parameters), an explicit rate ->
 *   its own taxable group, exempt / out-of-scope / excluded -> one group each; notes and a
 *   credit-note warning;
 * - contribution (config `contribution`): 10 % of fees (service, expense, mileage) per group;
 * - tax: per group or per line (config `taxScope`), through `taxAllocations`;
 * - withholding: 10 % of services + contribution when the client is a withholding agent, unless
 *   the per-invoice option `skipWithholding` is set; sets the fact `withholdingApplied`;
 * - fixed-charge: a fixed charge (1.50, then 2.00 from 2024) when untaxed amounts exceed a
 *   threshold (50.00, then 77.47), charged to the client in its own excluded group or absorbed
 *   (informational);
 * - an annual revenue ceiling (capability), and a refusal of unsupported currencies.
 * All its sources are fictional and marked as such.
 */
import {
  add,
  compare,
  compareDecimal,
  decimal,
  decimalFromInteger,
  decimalToString,
  divideDecimal,
  fromDecimal,
  greaterThan,
  normalizeDecimal,
  percentage,
  ROUNDING_MODES,
  sum,
  toDecimal,
  zero,
  type Decimal,
  type Money,
} from "@fairhour/money";
import * as z from "zod";
import type { TraceStep } from "../computation/types";
import { deepFreeze } from "../engine/freeze";
import { resolveParameters } from "../engine/parameters";
import {
  basesByGroup,
  findComponent,
  percentageByGroup,
  sumAllocations,
  sumNet,
  taxAllocations,
} from "../helpers/index";
import { message, p } from "../messages/params";
import type { MessageCatalogs } from "../messages/types";
import type { Rule, RuleOutput, TaxGroup } from "../pack/rule";
import type { PackMeta, ParameterVersion, RoundingPolicy, TaxPack } from "../pack/types";
import { compareIsoDate, isoDate, yearOf, type IsoDate } from "../primitives";
import type { SourceRef } from "../sources";
import type {
  RevenueStatus,
  RevenueThresholdStatus,
  RevenueTrackerInput,
} from "../thresholds/types";

export const xxConfigSchema = z.strictObject({
  taxScope: z.enum(["per-group", "per-line"]).default("per-group"),
  fixedCharge: z.enum(["client", "absorb"]).default("client"),
  contribution: z.boolean().default(true),
  rounding: z.enum(ROUNDING_MODES).default("halfUp"),
});
export type XxConfig = z.output<typeof xxConfigSchema>;

export const xxOptionsSchema = z.strictObject({
  skipWithholding: z.boolean().default(false),
});
export type XxOptions = z.output<typeof xxOptionsSchema>;

export interface XxParams {
  /** Percent units. */
  readonly standardRate: Decimal;
  readonly contributionRate: Decimal;
  readonly withholdingRate: Decimal;
  /** Major units of the invoice currency. */
  readonly fixedCharge: Decimal;
  readonly fixedChargeThreshold: Decimal;
  readonly revenueCeiling: Decimal;
}

// Facts must be a type alias: interfaces have no implicit index signature (see PackFacts).
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- required by PackFacts
export type XxFacts = { readonly withholdingApplied: boolean };

export const SUPPORTED_CURRENCIES = ["EUR", "USD", "JPY", "KWD"] as const;

const VERIFIED_ON = isoDate("2026-10-09");

export const xxSources = deepFreeze({
  taxAct: {
    id: "xx.tax-act.art-1",
    kind: "statute",
    title: "Fictional Tax Act of XX",
    citation: "art. 1 (standard rate) and art. 10 (exemptions)",
    url: "https://example.com/xx/tax-act",
    verification: { status: "verified", on: VERIFIED_ON, against: "primary-text" },
  },
  contributionAct: {
    id: "xx.contribution-act.art-3",
    kind: "regulation",
    title: "Fictional Contribution Regulation of XX",
    citation: "art. 3",
    verification: { status: "verified", on: VERIFIED_ON, against: "official-summary" },
  },
  withholdingAct: {
    id: "xx.withholding-act.art-25",
    kind: "statute",
    title: "Fictional Withholding Act of XX",
    citation: "art. 25",
    verification: {
      status: "to-be-verified",
      reason: "Fictional source of the internal test pack",
    },
    note: "Withholding agents retain 10 % of fees.",
  },
  chargeAct: {
    id: "xx.charge-act.art-13",
    kind: "guidance",
    title: "Fictional Fixed Charge Guide of XX",
    citation: "§ 13",
    verification: { status: "verified", on: VERIFIED_ON, against: "secondary" },
  },
} satisfies Record<string, SourceRef>);

export const xxParameters: readonly ParameterVersion<XxParams>[] = deepFreeze([
  {
    id: "xx-2020-01-01",
    effectiveFrom: isoDate("2020-01-01"),
    params: {
      standardRate: decimal("20"),
      contributionRate: decimal("10"),
      withholdingRate: decimal("10"),
      fixedCharge: decimal("1.50"),
      fixedChargeThreshold: decimal("50.00"),
      revenueCeiling: decimal("10000.00"),
    },
    sources: [xxSources.taxAct, xxSources.chargeAct],
    changes: ["Initial version."],
  },
  {
    id: "xx-2024-01-01",
    effectiveFrom: isoDate("2024-01-01"),
    params: {
      standardRate: decimal("20"),
      contributionRate: decimal("10"),
      withholdingRate: decimal("10"),
      fixedCharge: decimal("2.00"),
      fixedChargeThreshold: decimal("77.47"),
      revenueCeiling: decimal("10000.00"),
    },
    sources: [xxSources.chargeAct],
    changes: ["Fixed charge 2.00 above 77.47 of untaxed amounts."],
  },
]);

const en = {
  "meta.name": "Fictional test country",
  "meta.description": "Internal pack that exercises every part of the tax engine.",
  "meta.disclaimer": "Figures are informational: verify them with an accountant.",
  "xx.rule.classify-lines": "Line classification",
  "xx.rule.contribution": "Contribution",
  "xx.rule.tax": "Tax",
  "xx.rule.withholding": "Withholding",
  "xx.rule.fixed-charge": "Fixed charge",
  "xx.group.taxable": "Tax {rate}",
  "xx.group.exempt": "Exempt",
  "xx.group.exempt.reference": "art. 10 of the Fictional Tax Act",
  "xx.group.out-of-scope": "Out of scope",
  "xx.group.excluded": "Excluded (disbursements)",
  "xx.group.charge": "Fixed charge",
  "xx.classify.trace": "{count} lines classified into tax groups",
  "xx.note.exempt": "Exempt supply under art. 10 of the Fictional Tax Act.",
  "xx.note.out-of-scope": "Supply outside the scope of the tax: {reference}.",
  "xx.warning.credit-note":
    "Credit note: amounts are positive, the document kind gives the direction.",
  "xx.contribution.label": "Contribution {rate}",
  "xx.contribution.trace": "Contribution of {rate} on the fees",
  "xx.contribution.none": "No contribution: there are no fees",
  "xx.tax.label": "Tax",
  "xx.tax.trace": "Tax at {rate} on {group}",
  "xx.tax.none": "No tax: nothing is taxable",
  "xx.withholding.label": "Withholding {rate}",
  "xx.withholding.trace": "Withholding of {rate} on the fees and the contribution",
  "xx.withholding.not-agent": "No withholding: the client is not a withholding agent",
  "xx.withholding.skipped": "No withholding: disabled for this invoice",
  "xx.withholding.no-base": "No withholding: there are no fees",
  "xx.note.withholding": "Withholding tax of {amount} paid by the client to the tax office.",
  "xx.fixed-charge.label": "Fixed charge",
  "xx.fixed-charge.trace": "Fixed charge of {amount}: untaxed amounts of {base} exceed {threshold}",
  "xx.fixed-charge.below": "No fixed charge: untaxed amounts of {base} do not exceed {threshold}",
  "xx.fixed-charge.absorbed": "The fixed charge of {amount} is paid by the supplier",
  "xx.note.fixed-charge": "Fixed charge of {amount} paid on the original document.",
  "xx.rounding.per-group": "Amounts are rounded to the minor unit ({mode}); the tax once per rate.",
  "xx.rounding.per-line": "Amounts are rounded to the minor unit ({mode}); the tax on every line.",
  "xx.issue.currency": "This pack supports EUR, USD, JPY and KWD; the invoice is in {currency}",
  "xx.revenue.ceiling": "Annual revenue ceiling",
  "xx.revenue.trace": "Revenue collected in {year} until {asOf}: {total}",
};

const it: typeof en = {
  "meta.name": "Paese di prova fittizio",
  "meta.description": "Pacchetto interno che esercita ogni parte del motore fiscale.",
  "meta.disclaimer": "Importi indicativi: verificali con il tuo commercialista.",
  "xx.rule.classify-lines": "Classificazione delle righe",
  "xx.rule.contribution": "Contributo",
  "xx.rule.tax": "Imposta",
  "xx.rule.withholding": "Ritenuta",
  "xx.rule.fixed-charge": "Diritto fisso",
  "xx.group.taxable": "Imposta {rate}",
  "xx.group.exempt": "Esente",
  "xx.group.exempt.reference": "art. 10 della Legge fiscale fittizia",
  "xx.group.out-of-scope": "Fuori campo",
  "xx.group.excluded": "Escluso (anticipazioni)",
  "xx.group.charge": "Diritto fisso",
  "xx.classify.trace": "{count} righe classificate nei gruppi d’imposta",
  "xx.note.exempt": "Operazione esente ai sensi dell’art. 10 della Legge fiscale fittizia.",
  "xx.note.out-of-scope": "Operazione fuori campo: {reference}.",
  "xx.warning.credit-note":
    "Nota di credito: importi positivi, il tipo di documento indica il verso.",
  "xx.contribution.label": "Contributo {rate}",
  "xx.contribution.trace": "Contributo del {rate} sui compensi",
  "xx.contribution.none": "Nessun contributo: non ci sono compensi",
  "xx.tax.label": "Imposta",
  "xx.tax.trace": "Imposta al {rate} su {group}",
  "xx.tax.none": "Nessuna imposta: nulla è imponibile",
  "xx.withholding.label": "Ritenuta {rate}",
  "xx.withholding.trace": "Ritenuta del {rate} su compensi e contributo",
  "xx.withholding.not-agent": "Nessuna ritenuta: il cliente non è sostituto d’imposta",
  "xx.withholding.skipped": "Nessuna ritenuta: disattivata per questa fattura",
  "xx.withholding.no-base": "Nessuna ritenuta: non ci sono compensi",
  "xx.note.withholding": "Ritenuta di {amount} versata dal cliente all’erario.",
  "xx.fixed-charge.label": "Diritto fisso",
  "xx.fixed-charge.trace":
    "Diritto fisso di {amount}: importi non imponibili di {base} oltre {threshold}",
  "xx.fixed-charge.below":
    "Nessun diritto fisso: importi non imponibili di {base} entro {threshold}",
  "xx.fixed-charge.absorbed": "Il diritto fisso di {amount} è a carico del fornitore",
  "xx.note.fixed-charge": "Diritto fisso di {amount} assolto sull’originale.",
  "xx.rounding.per-group":
    "Importi arrotondati all’unità minima ({mode}); l’imposta una volta per aliquota.",
  "xx.rounding.per-line": "Importi arrotondati all’unità minima ({mode}); l’imposta su ogni riga.",
  "xx.issue.currency": "Questo pacchetto supporta EUR, USD, JPY e KWD; la fattura è in {currency}",
  "xx.revenue.ceiling": "Limite annuo dei ricavi",
  "xx.revenue.trace": "Ricavi incassati nel {year} fino al {asOf}: {total}",
};

export const xxMessages: MessageCatalogs = deepFreeze({ en, it });

type XxRule = Rule<XxConfig, XxParams, XxFacts, XxOptions>;
type XxOutput = RuleOutput<XxFacts>;

const FEE_KINDS = new Set(["service", "expense", "mileage"]);

function taxableGroupId(rate: Decimal): string {
  return `vat-${decimalToString(normalizeDecimal(rate)).replace(".", "-")}`;
}

const classifyLines: XxRule = {
  id: "xx.classify-lines",
  title: message("xx.rule.classify-lines"),
  sources: [xxSources.taxAct],
  apply: (state, ctx) => {
    const taxable = new Map<string, Decimal>();
    const used = new Set<string>();
    const lineGroups: Record<string, string> = {};
    let outOfScopeReference: string | undefined;
    for (const line of state.lines) {
      let groupId: string;
      switch (line.treatment.kind) {
        case "standard":
        case "rate": {
          const rate = normalizeDecimal(
            line.treatment.kind === "rate" ? line.treatment.rate : ctx.params.standardRate,
          );
          groupId = taxableGroupId(rate);
          taxable.set(groupId, rate);
          break;
        }
        case "exempt":
          groupId = "exempt";
          break;
        case "out-of-scope":
          groupId = "out-of-scope";
          outOfScopeReference ??= line.treatment.reference;
          break;
        case "excluded":
          groupId = "excluded";
          break;
      }
      used.add(groupId);
      Object.defineProperty(lineGroups, line.id, { value: groupId, enumerable: true });
    }
    const groups: TaxGroup[] = [...taxable.entries()]
      .sort(([, a], [, b]) => compareDecimal(a, b))
      .map(([id, rate]) => ({
        id,
        treatment: "taxable",
        rate,
        label: message("xx.group.taxable", { rate: p.percent(rate) }),
        exportCodes: { "xx.TaxCode": "T" },
      }));
    if (used.has("exempt")) {
      groups.push({
        id: "exempt",
        treatment: "exempt",
        label: message("xx.group.exempt"),
        reference: message("xx.group.exempt.reference"),
        exportCodes: { "xx.TaxCode": "E" },
      });
    }
    if (used.has("out-of-scope")) {
      groups.push({
        id: "out-of-scope",
        treatment: "out-of-scope",
        label: message("xx.group.out-of-scope"),
      });
    }
    if (used.has("excluded")) {
      groups.push({ id: "excluded", treatment: "excluded", label: message("xx.group.excluded") });
    }
    return {
      groups,
      lineGroups,
      legalNotes: [
        ...(used.has("exempt")
          ? [{ id: "xx.note.exempt", message: message("xx.note.exempt") }]
          : []),
        ...(used.has("out-of-scope")
          ? [
              {
                id: "xx.note.out-of-scope",
                message: message("xx.note.out-of-scope", {
                  reference: p.text(outOfScopeReference ?? "art. 7"),
                }),
              },
            ]
          : []),
      ],
      warnings:
        ctx.input.documentKind === "credit-note"
          ? [
              {
                code: "xx.credit-note",
                severity: "info",
                message: message("xx.warning.credit-note"),
              },
            ]
          : [],
      trace: [
        {
          message: message("xx.classify.trace", {
            count: p.decimal(decimalFromInteger(BigInt(state.lines.length))),
          }),
        },
      ],
    };
  },
};

const contribution: XxRule = {
  id: "xx.contribution",
  title: message("xx.rule.contribution"),
  sources: [xxSources.contributionAct],
  appliesTo: (ctx) => ctx.config.contribution,
  apply: (state, ctx): XxOutput => {
    const rate = ctx.params.contributionRate;
    const bases = basesByGroup(state, {
      lines: (line, group) => FEE_KINDS.has(line.kind) && group.treatment !== "excluded",
    });
    if (bases.length === 0) return { trace: [{ message: message("xx.contribution.none") }] };
    const allocations = percentageByGroup(bases, rate, ctx.rounding.contributions.mode);
    const totals = sumAllocations(allocations, ctx.currency);
    return {
      components: [
        {
          id: "xx.contribution",
          kind: "contribution",
          label: message("xx.contribution.label", { rate: p.percent(rate) }),
          effect: "adds-to-total",
          base: totals.base,
          rate,
          amount: totals.amount,
          allocations,
        },
      ],
      trace: [
        {
          message: message("xx.contribution.trace", { rate: p.percent(rate) }),
          formula: message("core.formula.percentage", {
            rate: p.percent(rate),
            base: p.money(totals.base),
            amount: p.money(totals.amount),
          }),
          amount: totals.amount,
          componentId: "xx.contribution",
        },
      ],
    };
  },
};

const tax: XxRule = {
  id: "xx.tax",
  title: message("xx.rule.tax"),
  sources: [xxSources.taxAct],
  apply: (state, ctx): XxOutput => {
    const allocations = taxAllocations(state, ctx.rounding.taxes, ctx.currency);
    if (allocations.length === 0) return { trace: [{ message: message("xx.tax.none") }] };
    const totals = sumAllocations(allocations, ctx.currency);
    const groupsById = new Map(state.groups.map((group) => [group.id, group] as const));
    const rateOf = (groupId: string): Decimal => groupsById.get(groupId)?.rate ?? decimal("0");
    const [single] = allocations;
    return {
      components: [
        {
          id: "xx.tax",
          kind: "tax",
          label: message("xx.tax.label"),
          effect: "adds-to-total",
          base: totals.base,
          ...(allocations.length === 1 && single !== undefined
            ? { rate: rateOf(single.groupId) }
            : {}),
          amount: totals.amount,
          allocations,
          exportCodes: { "xx.Tax": "T1" },
        },
      ],
      trace: allocations.map((allocation) => {
        const group = groupsById.get(allocation.groupId);
        const rate = rateOf(allocation.groupId);
        return {
          message: message("xx.tax.trace", {
            rate: p.percent(rate),
            group: p.message(group?.label ?? message("xx.tax.label")),
          }),
          formula: message("core.formula.percentage", {
            rate: p.percent(rate),
            base: p.money(allocation.base),
            amount: p.money(allocation.amount),
          }),
          amount: allocation.amount,
          componentId: "xx.tax",
        };
      }),
    };
  },
};

const withholding: XxRule = {
  id: "xx.withholding",
  title: message("xx.rule.withholding"),
  sources: [xxSources.withholdingAct],
  apply: (state, ctx): XxOutput => {
    if (!ctx.input.client.isWithholdingAgent) {
      return { trace: [{ message: message("xx.withholding.not-agent") }] };
    }
    if (ctx.options.skipWithholding)
      return { trace: [{ message: message("xx.withholding.skipped") }] };
    const fees = sumNet(
      state,
      (line, group) =>
        line.kind === "service" && group !== undefined && group.treatment !== "excluded",
      ctx.currency,
    );
    const contributionAmount = findComponent(state, "xx.contribution")?.amount ?? ctx.zero;
    const base = add(fees, contributionAmount);
    if (base.amount === 0n) return { trace: [{ message: message("xx.withholding.no-base") }] };
    const rate = ctx.params.withholdingRate;
    const amount = percentage(base, rate, ctx.rounding.withholdings.mode);
    return {
      components: [
        {
          id: "xx.withholding",
          kind: "withholding",
          label: message("xx.withholding.label", { rate: p.percent(rate) }),
          effect: "deducted-from-payable",
          base,
          rate,
          amount,
        },
      ],
      legalNotes: [
        {
          id: "xx.note.withholding",
          message: message("xx.note.withholding", { amount: p.money(amount) }),
        },
      ],
      trace: [
        {
          message: message("xx.withholding.trace", { rate: p.percent(rate) }),
          formula: message("core.formula.percentage", {
            rate: p.percent(rate),
            base: p.money(base),
            amount: p.money(amount),
          }),
          amount,
          componentId: "xx.withholding",
        },
      ],
      facts: { withholdingApplied: true },
    };
  },
};

const fixedCharge: XxRule = {
  id: "xx.fixed-charge",
  title: message("xx.rule.fixed-charge"),
  sources: [xxSources.chargeAct],
  apply: (state, ctx): XxOutput => {
    const untaxedGroups = new Set(
      state.groups
        .filter((group) => group.treatment === "exempt" || group.treatment === "out-of-scope")
        .map((group) => group.id),
    );
    let untaxed = sumNet(
      state,
      (_line, group) => group !== undefined && untaxedGroups.has(group.id),
      ctx.currency,
    );
    for (const allocation of findComponent(state, "xx.contribution")?.allocations ?? []) {
      if (untaxedGroups.has(allocation.groupId)) untaxed = add(untaxed, allocation.amount);
    }
    const threshold = fromDecimal(ctx.params.fixedChargeThreshold, ctx.currency, "halfUp");
    const charge = fromDecimal(ctx.params.fixedCharge, ctx.currency, "halfUp");
    const texts = {
      base: p.money(untaxed),
      threshold: p.money(threshold),
      amount: p.money(charge),
    };
    if (!greaterThan(untaxed, threshold)) {
      return { trace: [{ message: message("xx.fixed-charge.below", texts) }] };
    }
    const charged = ctx.config.fixedCharge === "client";
    return {
      ...(charged
        ? {
            groups: [
              { id: "charge", treatment: "excluded" as const, label: message("xx.group.charge") },
            ],
          }
        : {}),
      components: [
        {
          id: "xx.fixed-charge",
          kind: "stamp-duty",
          label: message("xx.fixed-charge.label"),
          effect: charged ? "adds-to-total" : "informational",
          base: untaxed,
          amount: charge,
          ...(charged
            ? { allocations: [{ groupId: "charge", base: untaxed, amount: charge }] }
            : {}),
        },
      ],
      legalNotes: [{ id: "xx.note.fixed-charge", message: message("xx.note.fixed-charge", texts) }],
      warnings: charged
        ? []
        : [
            {
              code: "xx.fixed-charge.absorbed",
              severity: "info",
              message: message("xx.fixed-charge.absorbed", texts),
            },
          ],
      trace: [
        {
          message: message("xx.fixed-charge.trace", texts),
          amount: charge,
          componentId: "xx.fixed-charge",
        },
      ],
    };
  },
};

function roundingPolicy(config: XxConfig): RoundingPolicy {
  return {
    step: "minor-unit",
    lines: { mode: config.rounding },
    contributions: { mode: config.rounding, scope: "per-group" },
    taxes: { mode: config.rounding, scope: config.taxScope },
    withholdings: { mode: config.rounding, scope: "per-document" },
    description: message(
      config.taxScope === "per-line" ? "xx.rounding.per-line" : "xx.rounding.per-group",
      {
        mode: p.text(config.rounding),
      },
    ),
  };
}

function evaluateRevenue(_config: XxConfig, input: RevenueTrackerInput): RevenueStatus {
  const yearEnd = isoDate(`${input.year}-12-31`);
  const version = resolveParameters(xxParameters, "xx", yearEnd);
  const limit = fromDecimal(version.params.revenueCeiling, input.currency, "halfUp");
  const counted = input.receipts
    .filter(
      (receipt) =>
        yearOf(receipt.date) === input.year && compareIsoDate(receipt.date, input.asOf) <= 0,
    )
    .sort((a, b) => compareIsoDate(a.date, b.date));
  let running: Money = zero(input.currency);
  let crossedOn: IsoDate | undefined;
  for (const receipt of counted) {
    running = add(running, receipt.amount);
    if (crossedOn === undefined && greaterThan(running, limit)) crossedOn = receipt.date;
  }
  const total = sum(
    counted.map((receipt) => receipt.amount),
    input.currency,
  );
  const ratio = divideDecimal(toDecimal(total), toDecimal(limit), 4, "halfUp");
  const status =
    compare(total, limit) > 0
      ? "exceeded"
      : compareDecimal(ratio, decimal("0.8")) >= 0
        ? "approaching"
        : "ok";
  const threshold: RevenueThresholdStatus = {
    id: "xx.ceiling",
    label: message("xx.revenue.ceiling"),
    limit,
    ratio,
    ...(crossedOn === undefined ? {} : { crossedOn }),
    sources: [xxSources.taxAct],
  };
  const explanation: TraceStep = {
    step: 1,
    ruleId: "xx.revenue",
    message: message("xx.revenue.trace", {
      year: p.text(`${input.year}`),
      asOf: p.date(input.asOf),
      total: p.money(total),
    }),
    amount: total,
    sources: [xxSources.taxAct],
  };
  return deepFreeze({
    status,
    year: input.year,
    total,
    thresholds: [threshold],
    parameters: { id: version.id, effectiveFrom: version.effectiveFrom },
    explanation: [explanation],
    warnings: [],
  });
}

type XxPack = TaxPack<XxConfig, XxParams, XxFacts, XxOptions>;

// Not deep-frozen as a whole: zod schemas keep lazy internal caches. The data (meta,
// parameters, messages) is frozen.
export const testPack: XxPack = Object.freeze<XxPack>({
  meta: deepFreeze<PackMeta>({
    id: "xx",
    name: "Fictional test country",
    version: "1.0.0",
    countries: "any",
    description: "Internal pack that exercises every part of the tax engine.",
    maintainers: [{ name: "Fairhour maintainers", github: "fabiovincenzi" }],
    docsUrl: "https://example.com/fairhour/tax-packs/xx",
    disclaimer: message("meta.disclaimer"),
    locales: ["en", "it"],
    documentLocale: "it",
  }),
  configSchema: xxConfigSchema,
  invoiceOptionsSchema: xxOptionsSchema,
  parameters: xxParameters,
  rules: [classifyLines, contribution, tax, withholding, fixedCharge],
  initialFacts: Object.freeze({ withholdingApplied: false }),
  messages: xxMessages,
  roundingPolicy,
  validateInput: (input) =>
    (SUPPORTED_CURRENCIES as readonly string[]).includes(input.currency)
      ? []
      : [
          {
            path: ["currency"],
            code: "xx.currency-not-supported",
            message: message("xx.issue.currency", { currency: p.text(input.currency) }),
          },
        ],
  capabilities: {
    annualThresholds: {
      countableRevenue: (_config, computation) => computation.taxableBase,
      evaluate: evaluateRevenue,
    },
  },
});
