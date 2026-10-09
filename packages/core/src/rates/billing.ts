import {
  type CurrencyCode,
  type Decimal,
  type Money,
  type Price,
  type RoundingMode,
  compareDecimal,
  decimal,
  decimalFromInteger,
  divideDecimal,
  extend,
  multiplyDecimal,
  priceFromMoney,
  signDecimal,
} from "@fairhour/money";
import {
  InvalidBillingModeError,
  type InvalidBillingModeReason,
  InvalidDurationError,
} from "../errors";
import { MissingRateError, RateCurrencyMismatchError } from "./errors";
import type { RateUnit } from "./unit";

/**
 * How a project turns tracked time into an amount (design §7):
 *
 * - `hourly`: hours × the resolved rate per hour;
 * - `fixed`: the agreed amount, whatever the hours (in the currency the invoice is in);
 * - `day-rate`: per local day, up to `halfDayMaxHours` is half a day and more is a whole day
 *   (`hoursPerDay` is the length of a full day, it bounds the half-day threshold), × the resolved
 *   rate per day. The rates are per different units: `resolveRate({ unit: "hour" })` for `hourly`,
 *   `resolveRate({ unit: "day" })` for `day-rate` (see `billingRateUnit`).
 */
export type BillingMode =
  | { readonly kind: "hourly" }
  | { readonly kind: "fixed"; readonly amount: Money }
  | { readonly kind: "day-rate"; readonly hoursPerDay: Decimal; readonly halfDayMaxHours: Decimal };

export type DayRateMode = Extract<BillingMode, { kind: "day-rate" }>;
export type FixedMode = Extract<BillingMode, { kind: "fixed" }>;

/** What a line is counted in. */
export type BillingUnit = "hour" | "day" | "lump-sum" | "km";

/** `quantity × unitPrice = amount`: what an invoice line shows. */
export interface BillableAmount {
  readonly quantity: Decimal;
  readonly unit: BillingUnit;
  readonly unitPrice: Price;
  readonly amount: Money;
}

/** The unit of the rate a mode bills with: per hour or per day. `fixed` needs no rate. */
export function billingRateUnit(mode: BillingMode): RateUnit | undefined {
  switch (mode.kind) {
    case "hourly":
      return "hour";
    case "day-rate":
      return "day";
    case "fixed":
      return undefined;
  }
}

export interface HourlyOptions {
  /** Decimals of the hours quantity on the invoice (2 is customary). */
  readonly hoursScale: 2 | 3 | 4;
  /** How the hours are rounded to `hoursScale` decimals. */
  readonly hoursRounding: RoundingMode;
  /** How `hours × rate` is rounded to the currency's minor units. */
  readonly amountRounding: RoundingMode;
}

const SECONDS_PER_HOUR = decimalFromInteger(3600n);

/** The reason a day-rate mode is unusable, if any: `0 < halfDayMaxHours ≤ hoursPerDay`. */
export function dayRateModeProblem(mode: DayRateMode): InvalidBillingModeReason | undefined {
  if (signDecimal(mode.hoursPerDay) <= 0) return "non-positive-hours-per-day";
  if (signDecimal(mode.halfDayMaxHours) <= 0) return "non-positive-half-day";
  if (compareDecimal(mode.halfDayMaxHours, mode.hoursPerDay) > 0) return "half-day-exceeds-day";
  return undefined;
}

function assertDayRateMode(mode: DayRateMode): void {
  const problem = dayRateModeProblem(mode);
  if (problem !== undefined) throw new InvalidBillingModeError(problem);
}

function assertNotNegative(seconds: bigint): void {
  if (seconds < 0n) throw new InvalidDurationError();
}

/**
 * Seconds as hours, exactly `scale` decimals, rounded with `rounding`. With a 6, 15 or 30 minute
 * duration rounding the result is exact (0.1, 0.25, 0.5 hours).
 * @throws InvalidDurationError for negative seconds
 */
export function hoursFromSeconds(seconds: bigint, scale: number, rounding: RoundingMode): Decimal {
  assertNotNegative(seconds);
  return divideDecimal(decimalFromInteger(seconds), SECONDS_PER_HOUR, scale, rounding);
}

/**
 * Hourly billing: the hours are rounded to `hoursScale` decimals first (that is the quantity the
 * client reads on the invoice) and the line total is `quantity × rate`, rounded to minor units.
 * @throws InvalidDurationError
 */
export function hourlyAmount(seconds: bigint, rate: Price, options: HourlyOptions): BillableAmount {
  const quantity = hoursFromSeconds(seconds, options.hoursScale, options.hoursRounding);
  return {
    quantity,
    unit: "hour",
    unitPrice: rate,
    amount: extend(rate, quantity, options.amountRounding),
  };
}

/**
 * Days to bill for day-rate work, given the tracked seconds of each local day (group entries with
 * `groupEntries` and pass each day's total). A day with no time counts 0; up to
 * `halfDayMaxHours` (inclusive, compared exactly) counts 0.5; more counts 1, even beyond
 * `hoursPerDay`. The result is an exact multiple of 0.5.
 * @throws InvalidBillingModeError, InvalidDurationError
 */
export function dayRateDays(secondsPerDay: readonly bigint[], mode: DayRateMode): Decimal {
  assertDayRateMode(mode);
  const halfDaySeconds = multiplyDecimal(mode.halfDayMaxHours, SECONDS_PER_HOUR);
  let halfDays = 0n;
  for (const seconds of secondsPerDay) {
    assertNotNegative(seconds);
    if (seconds === 0n) continue;
    halfDays += compareDecimal(decimalFromInteger(seconds), halfDaySeconds) <= 0 ? 1n : 2n;
  }
  return divideDecimal(decimalFromInteger(halfDays), decimal("2"), 1, "down");
}

/**
 * Day-rate billing: `dayRateDays × day rate`, rounded to minor units with `amountRounding`.
 * @throws InvalidBillingModeError, InvalidDurationError
 */
export function dayRateAmount(
  secondsPerDay: readonly bigint[],
  rate: Price,
  mode: DayRateMode,
  amountRounding: RoundingMode,
): BillableAmount {
  const quantity = dayRateDays(secondsPerDay, mode);
  return {
    quantity,
    unit: "day",
    unitPrice: rate,
    amount: extend(rate, quantity, amountRounding),
  };
}

/**
 * Fixed-price billing: one lump sum, the agreed amount, regardless of the hours worked. The
 * amount must be in `currency`, the currency of the invoice: it is never converted here.
 * @throws RateCurrencyMismatchError
 */
export function fixedAmount(mode: FixedMode, currency: CurrencyCode): BillableAmount {
  if (mode.amount.currency !== currency) {
    throw new RateCurrencyMismatchError(mode.amount.currency, currency);
  }
  return {
    quantity: decimal("1"),
    unit: "lump-sum",
    unitPrice: priceFromMoney(mode.amount),
    amount: mode.amount,
  };
}

/**
 * A mileage line: `kilometres × ratePerKm`. The rate keeps its sub-cent precision (€0.4253/km);
 * the only rounding is the line total, with the given mode.
 */
export function mileageAmount(
  kilometres: Decimal,
  ratePerKm: Price,
  rounding: RoundingMode,
): BillableAmount {
  return {
    quantity: kilometres,
    unit: "km",
    unitPrice: ratePerKm,
    amount: extend(ratePerKm, kilometres, rounding),
  };
}

export interface BillingUsage {
  /** All tracked seconds (already duration-rounded, if the project rounds). */
  readonly seconds: bigint;
  /** Tracked seconds per local day, for day-rate projects. */
  readonly secondsPerDay: readonly bigint[];
}

/** A resolved rate and what it is per (a `ResolvedRate` from `resolveRate` is one). */
export interface BillingRate {
  readonly rate: Price;
  readonly unit: RateUnit;
}

export interface BillingOptions extends HourlyOptions {
  /** The currency of the invoice: rates and fixed amounts must be in it. */
  readonly currency: CurrencyCode;
}

/** The price of `rate` when it is per `unit` and in `currency`. */
function priceOf(rate: BillingRate | undefined, unit: RateUnit, currency: CurrencyCode): Price {
  if (rate?.unit !== unit) throw new MissingRateError(unit);
  if (rate.rate.currency !== currency) {
    throw new RateCurrencyMismatchError(rate.rate.currency, currency);
  }
  return rate.rate;
}

/**
 * The amount a project bills for `usage` under its billing mode. `hourly` needs a rate per hour,
 * `day-rate` a rate per day (resolve each with `resolveRate`'s `unit`); `fixed` ignores `rate`.
 * Nothing is converted: rates and fixed amounts must be in `options.currency`.
 * @throws MissingRateError (no rate, or a rate per the other unit), RateCurrencyMismatchError,
 *         InvalidBillingModeError, InvalidDurationError
 */
export function billableAmount(
  mode: BillingMode,
  usage: BillingUsage,
  rate: BillingRate | undefined,
  options: BillingOptions,
): BillableAmount {
  switch (mode.kind) {
    case "hourly":
      return hourlyAmount(usage.seconds, priceOf(rate, "hour", options.currency), options);
    case "fixed":
      return fixedAmount(mode, options.currency);
    case "day-rate":
      return dayRateAmount(
        usage.secondsPerDay,
        priceOf(rate, "day", options.currency),
        mode,
        options.amountRounding,
      );
  }
}
