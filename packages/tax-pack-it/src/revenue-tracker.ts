/**
 * Revenue tracker of the regime forfettario (`annualThresholds` capability, TAX-007;
 * docs/tax-packs/it.md, section 10).
 *
 * - Countable revenue of an invoice: fee lines that are not art. 15 disbursements, general
 *   expenses, INPS rivalsa and a stamp duty charged to the client; never the cassa contribution.
 * - Cash basis: receipts count on their collection date, in their year, up to `asOf`.
 * - Ceiling for year Y: the parameter version in force on 1 January of Y + 1 (the test decides
 *   access for the following year): €65,000 for revenue years 2019-2021, €85,000 from 2022.
 *   Pro-rated by days in the first year of activity (365 days; leap years are to be verified),
 *   never above the full ceiling.
 * - Immediate exit (from 2023): above €100,000 the regime ends in the same year. Not pro-rated.
 * - Status: immediate-exit > exceeded > approaching (at or above `warningRatio` of the ceiling)
 *   > ok; "not-applicable" in ordinario.
 */
import {
  add,
  DECIMAL_HUNDRED,
  decimalFromInteger,
  divideAndRound,
  divideDecimal,
  greaterThan,
  money,
  multiplyDecimal,
  normalizeDecimal,
  toDecimal,
  zero,
  type Decimal,
  type Money,
} from "@fairhour/money";
import {
  compareIsoDate,
  daysBetweenInclusive,
  isoDate,
  message,
  p,
  resolveParameters,
  UnsupportedInputError,
  yearOf,
  type InvoiceComputation,
  type IsoDate,
  type MessageRef,
  type RevenueStatus,
  type RevenueStatusKind,
  type RevenueThresholdStatus,
  type RevenueTrackerInput,
  type SourceRef,
  type TraceStep,
  type Warning,
} from "@fairhour/tax-core";
import { percent, type ItConfig } from "./config";
import { deepFreeze } from "./freeze";
import { parameters } from "./parameters";
import { GENERAL_EXPENSES_ID } from "./rules/general-expenses";
import { INPS_RIVALSA_ID } from "./rules/inps-rivalsa";
import { STAMP_DUTY_ID } from "./rules/stamp-duty";
import { sources } from "./sources";

/** Rule id of the tracker's explanation steps and warnings. */
export const REVENUE_TRACKER_ID = "it.forfettario.revenue-tracker";
export const CEILING_ID = "it.forfettario.ceiling";
export const IMMEDIATE_EXIT_ID = "it.forfettario.immediate-exit";

/** Days of the year used to pro-rate the ceiling (it.md, section 10: leap years TBV). */
const DAYS_IN_YEAR = 365n;

const COUNTABLE_COMPONENTS: readonly string[] = [
  GENERAL_EXPENSES_ID,
  INPS_RIVALSA_ID,
  STAMP_DUTY_ID,
];

/**
 * The part of an invoice that counts towards the forfettario ceiling once collected (zero in
 * ordinario). A credit note gives the same positive magnitude: the caller records it as a
 * negative receipt (the document kind gives the direction).
 */
export function countableRevenue(config: ItConfig, computation: InvoiceComputation): Money {
  let total = zero(computation.currency);
  if (config.regime !== "forfettario") return total;
  const excluded = computation.vatSummary
    .filter((entry) => entry.treatment === "excluded")
    .map((entry) => entry.groupId);
  for (const line of computation.lines)
    if (!excluded.includes(line.groupId)) total = add(total, line.net);
  for (const component of computation.components) {
    if (component.effect === "adds-to-total" && COUNTABLE_COMPONENTS.includes(component.id))
      total = add(total, component.amount);
  }
  return total;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/**
 * total / limit with 4 decimals (the contract's ratio), and in percent units with at most 2
 * decimals for messages, without trailing zeros ("126.3%", "80%": formatPercent shows the scale).
 */
function ratios(
  total: Money,
  limit: Money,
): { readonly ratio: Decimal; readonly percent: Decimal } {
  return {
    ratio: divideDecimal(toDecimal(total), toDecimal(limit), 4, "halfUp"),
    percent: normalizeDecimal(
      divideDecimal(
        multiplyDecimal(toDecimal(total), DECIMAL_HUNDRED),
        toDecimal(limit),
        2,
        "halfUp",
      ),
    ),
  };
}

/** Exact test: total ≥ limit × share / 100 (no rounding of the ratio). */
function atOrAboveShare(total: Money, limit: Money, share: Decimal): boolean {
  return total.amount * 10n ** BigInt(share.scale + 2) >= limit.amount * share.coefficient;
}

/** The date of the receipt that first makes the running total exceed `limit`, if any. */
function crossingDate(
  receipts: readonly { readonly date: IsoDate; readonly amount: Money }[],
  limit: Money,
): IsoDate | undefined {
  let running = zero(limit.currency);
  return receipts.find((receipt) => {
    running = add(running, receipt.amount);
    return greaterThan(running, limit);
  })?.date;
}

function threshold(
  id: string,
  label: MessageRef,
  limit: Money,
  ratio: Decimal,
  crossedOn: IsoDate | undefined,
  cited: readonly SourceRef[],
): RevenueThresholdStatus {
  return {
    id,
    label,
    limit,
    ratio,
    ...(crossedOn === undefined ? {} : { crossedOn }),
    sources: cited,
  };
}

/**
 * Evaluates the receipts of `input.year` against the forfettario limits.
 * @throws UnsupportedInputError (`it.currency-not-eur`) for non-EUR amounts,
 *         ParameterNotFoundError for years before 2019, InvalidIsoDateError for invalid years
 */
export function evaluateRevenue(config: ItConfig, input: RevenueTrackerInput): RevenueStatus {
  const { year, currency } = input;
  if (currency !== "EUR" || input.receipts.some((receipt) => receipt.amount.currency !== "EUR")) {
    throw new UnsupportedInputError([
      {
        path: ["currency"],
        code: "it.currency-not-eur",
        message: message("it.issue.currency-not-eur", { currency: p.text(currency) }),
      },
    ]);
  }
  const yearStart = isoDate(`${year}-01-01`);
  const yearEnd = isoDate(`${year}-12-31`);
  const inYear = resolveParameters(parameters, "it", yearStart);
  // The ceiling decides access for Y + 1, so it comes from the version in force on 1 January Y + 1.
  const ceilingVersion =
    year < 9999 ? resolveParameters(parameters, "it", isoDate(`${year + 1}-01-01`)) : inYear;
  const version = { id: ceilingVersion.id, effectiveFrom: ceilingVersion.effectiveFrom };
  const steps: TraceStep[] = [];
  const step = (
    text: MessageRef,
    cited: readonly SourceRef[],
    extra: { readonly formula?: MessageRef; readonly amount?: Money } = {},
  ): void => {
    steps.push({
      step: steps.length + 1,
      ruleId: REVENUE_TRACKER_ID,
      message: text,
      ...(extra.formula === undefined ? {} : { formula: extra.formula }),
      ...(extra.amount === undefined ? {} : { amount: extra.amount }),
      sources: cited,
    });
  };

  if (config.regime !== "forfettario") {
    step(message("it.trace.revenue.not-applicable"), [sources.l190Regime]);
    return deepFreeze({
      status: "not-applicable",
      year,
      total: zero(currency),
      thresholds: [],
      parameters: version,
      explanation: steps,
      warnings: [],
    });
  }

  const counted = input.receipts
    .filter(
      (receipt) => yearOf(receipt.date) === year && compareIsoDate(receipt.date, input.asOf) <= 0,
    )
    .sort((a, b) => compareIsoDate(a.date, b.date));
  let total = zero(currency);
  for (const receipt of counted) total = add(total, receipt.amount);
  step(
    message("it.trace.revenue.total", {
      year: p.text(`${year}`),
      asOf: p.date(input.asOf),
      total: p.money(total),
      count: p.decimal(decimalFromInteger(BigInt(counted.length))),
    }),
    [sources.l190CashBasis, sources.circolare32E2023],
    { amount: total },
  );

  const warnings: Warning[] = [];
  const warn = (code: string, severity: Warning["severity"], key: string): void => {
    warnings.push({ code, severity, ruleId: REVENUE_TRACKER_ID, message: message(key) });
  };

  // Ceiling, pro-rated in the first year of activity.
  const fullCeiling = ceilingVersion.params.forfettario.ceiling;
  let ceiling = fullCeiling;
  const start = input.activityStartDate;
  if (start !== undefined && yearOf(start) === year) {
    const days = daysBetweenInclusive(start, yearEnd);
    const scaled = money(
      divideAndRound(fullCeiling.amount * BigInt(days), DAYS_IN_YEAR, "halfUp"),
      currency,
    );
    ceiling = greaterThan(scaled, fullCeiling) ? fullCeiling : scaled;
    const daysParam = p.decimal(decimalFromInteger(BigInt(days)));
    step(
      message("it.trace.revenue.prorated", { start: p.date(start), days: daysParam }),
      [sources.circolare32E2023FirstYear],
      {
        formula: message("it.formula.prorata", {
          ceiling: p.money(fullCeiling),
          days: daysParam,
          limit: p.money(ceiling),
        }),
        amount: ceiling,
      },
    );
    if (isLeapYear(year))
      warn("it.forfettario.prorating-leap-year", "info", "it.warning.revenue.leap-year");
  }

  const ceilingSources = [sources.l190Ceiling, sources.circolare32E2023];
  const ceilingRatio = ratios(total, ceiling);
  // Reported only when the year's total is above the limit (refunds may bring it back down).
  const ceilingCrossed = greaterThan(total, ceiling) ? crossingDate(counted, ceiling) : undefined;
  const warningRatio = percent(config.revenueTracker.warningRatio);
  const ceilingTexts = {
    total: p.money(total),
    limit: p.money(ceiling),
    ratio: p.percent(ceilingRatio.percent),
    warningRatio: p.percent(warningRatio),
  };
  let status: RevenueStatusKind;
  if (ceilingCrossed !== undefined) {
    status = "exceeded";
    step(
      message("it.trace.revenue.ceiling.exceeded", {
        ...ceilingTexts,
        date: p.date(ceilingCrossed),
        nextYear: p.text(`${year + 1}`),
      }),
      ceilingSources,
    );
  } else if (atOrAboveShare(total, ceiling, warningRatio)) {
    status = "approaching";
    step(message("it.trace.revenue.ceiling.approaching", ceilingTexts), ceilingSources);
  } else {
    status = "ok";
    step(message("it.trace.revenue.ceiling.ok", ceilingTexts), ceilingSources);
  }
  const thresholds = [
    threshold(
      CEILING_ID,
      message("it.threshold.ceiling"),
      ceiling,
      ceilingRatio.ratio,
      ceilingCrossed,
      ceilingSources,
    ),
  ];

  // Immediate exit (from 2023), not pro-rated.
  const exitLimit = inYear.params.forfettario.immediateExit;
  if (exitLimit === null) {
    step(message("it.trace.revenue.immediate-exit.none"), [sources.l190ImmediateExit]);
  } else {
    const exitSources = [sources.l190ImmediateExit, sources.circolare32E2023];
    const exitCrossed = greaterThan(total, exitLimit)
      ? crossingDate(counted, exitLimit)
      : undefined;
    const texts = { total: p.money(total), limit: p.money(exitLimit) };
    if (exitCrossed !== undefined) {
      status = "immediate-exit";
      step(
        message("it.trace.revenue.immediate-exit.exceeded", {
          ...texts,
          date: p.date(exitCrossed),
        }),
        exitSources,
      );
    } else {
      step(message("it.trace.revenue.immediate-exit.ok", texts), exitSources);
    }
    thresholds.push(
      threshold(
        IMMEDIATE_EXIT_ID,
        message("it.threshold.immediate-exit"),
        exitLimit,
        ratios(total, exitLimit).ratio,
        exitCrossed,
        exitSources,
      ),
    );
  }

  switch (status) {
    case "approaching":
      warn("it.forfettario.ceiling-approaching", "info", "it.warning.revenue.approaching");
      break;
    case "exceeded":
      warn("it.forfettario.ceiling-exceeded", "warning", "it.warning.revenue.exceeded");
      break;
    case "immediate-exit":
      warn("it.forfettario.immediate-exit", "warning", "it.warning.revenue.immediate-exit");
      break;
    case "ok":
      break;
  }

  return deepFreeze({
    status,
    year,
    total,
    thresholds,
    parameters: version,
    explanation: steps,
    warnings,
  });
}
