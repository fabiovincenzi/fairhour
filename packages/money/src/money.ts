import { assertCurrencyCode, isCurrencyCode } from "./currency";
import type { CurrencyCode } from "./currency";
import { CurrencyMismatchError } from "./errors";

/**
 * An amount of money: an integer number of the currency's minor units and an ISO 4217 code.
 * Values are plain, frozen objects; functions never mutate their arguments.
 */
export interface Money {
  /** Integer number of minor units (cents for EUR, yen for JPY, fils for KWD). */
  readonly amount: bigint;
  readonly currency: CurrencyCode;
}

/** @internal Frozen constructor without validation, for results of operations on valid inputs. */
export function makeMoney(amount: bigint, currency: CurrencyCode): Money {
  return Object.freeze({ amount, currency });
}

/** @internal Throws CurrencyMismatchError unless both values have the same currency. */
export function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) throw new CurrencyMismatchError(a.currency, b.currency);
}

/**
 * Frozen `Money` from an amount in minor units: `money(1234n, "EUR")` is €12.34.
 * @throws InvalidCurrencyError
 * @throws TypeError when called (from untyped code) with an amount that is not a bigint
 */
export function money(amount: bigint, currency: CurrencyCode): Money {
  if (typeof amount !== "bigint") {
    throw new TypeError("Money amounts are bigint minor units; parse strings with parseMoney");
  }
  return makeMoney(amount, assertCurrencyCode(currency));
}

/** Zero in `currency`. @throws InvalidCurrencyError */
export function zero(currency: CurrencyCode): Money {
  return makeMoney(0n, assertCurrencyCode(currency));
}

/** Structural guard: a bigint `amount` and a known `currency`. */
export function isMoney(value: unknown): value is Money {
  return (
    typeof value === "object" &&
    value !== null &&
    "amount" in value &&
    "currency" in value &&
    typeof value.amount === "bigint" &&
    typeof value.currency === "string" &&
    isCurrencyCode(value.currency)
  );
}

/** `a + b`. @throws CurrencyMismatchError when currencies differ */
export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return makeMoney(a.amount + b.amount, a.currency);
}

/** `a - b`. @throws CurrencyMismatchError when currencies differ */
export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return makeMoney(a.amount - b.amount, a.currency);
}

export function negate(value: Money): Money {
  return makeMoney(-value.amount, value.currency);
}

export function abs(value: Money): Money {
  return value.amount < 0n ? makeMoney(-value.amount, value.currency) : value;
}

/**
 * Sum of `items`; `currency` is required so that an empty list has a well-defined result.
 * @throws InvalidCurrencyError, CurrencyMismatchError when an item is in another currency
 */
export function sum(items: readonly Money[], currency: CurrencyCode): Money {
  assertCurrencyCode(currency);
  let total = 0n;
  for (const item of items) {
    if (item.currency !== currency) throw new CurrencyMismatchError(currency, item.currency);
    total += item.amount;
  }
  return makeMoney(total, currency);
}

/** Exact `value × factor` for an integer factor. */
export function multiplyByInteger(value: Money, factor: bigint): Money {
  if (typeof factor !== "bigint") throw new TypeError("multiplyByInteger expects a bigint factor");
  return makeMoney(value.amount * factor, value.currency);
}

/** `-1` when a < b, `0` when equal, `1` when a > b. @throws CurrencyMismatchError */
export function compare(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b);
  return a.amount < b.amount ? -1 : a.amount > b.amount ? 1 : 0;
}

/** Same currency and amount. Different currencies -> false (never throws). */
export function equals(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.amount === b.amount;
}

/** @throws CurrencyMismatchError */
export function lessThan(a: Money, b: Money): boolean {
  return compare(a, b) < 0;
}

/** @throws CurrencyMismatchError */
export function lessThanOrEqual(a: Money, b: Money): boolean {
  return compare(a, b) <= 0;
}

/** @throws CurrencyMismatchError */
export function greaterThan(a: Money, b: Money): boolean {
  return compare(a, b) > 0;
}

/** @throws CurrencyMismatchError */
export function greaterThanOrEqual(a: Money, b: Money): boolean {
  return compare(a, b) >= 0;
}

/** The smallest value (the first one on ties). @throws CurrencyMismatchError */
export function min(first: Money, ...rest: readonly Money[]): Money {
  let result = first;
  for (const item of rest) if (compare(item, result) < 0) result = item;
  return result;
}

/** The largest value (the first one on ties). @throws CurrencyMismatchError */
export function max(first: Money, ...rest: readonly Money[]): Money {
  let result = first;
  for (const item of rest) if (compare(item, result) > 0) result = item;
  return result;
}

export function isZero(value: Money): boolean {
  return value.amount === 0n;
}

export function isPositive(value: Money): boolean {
  return value.amount > 0n;
}

export function isNegative(value: Money): boolean {
  return value.amount < 0n;
}
