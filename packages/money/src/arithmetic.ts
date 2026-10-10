import { assertCurrencyCode, minorUnitExponent } from "./currency";
import type { CurrencyCode } from "./currency";
import { DECIMAL_ONE, decimalEquals, pow10 } from "./decimal";
import type { Decimal } from "./decimal";
import { DivisionByZeroError, InvalidAmountError } from "./errors";
import { makeMoney } from "./money";
import type { Money } from "./money";
import { assertRoundingMode, divideAndRound } from "./rounding";
import type { RoundingMode } from "./rounding";

/**
 * @internal `coefficient × 10^shift`, rounded with `mode` when `shift` is negative.
 * @throws TypeError for an unknown mode, even when `shift ≥ 0` needs no rounding
 */
export function shiftAndRound(coefficient: bigint, shift: number, mode: RoundingMode): bigint {
  assertRoundingMode(mode);
  return shift >= 0 ? coefficient * pow10(shift) : divideAndRound(coefficient, pow10(-shift), mode);
}

/**
 * `value × factor`, rounded to minor units with `mode`.
 * Exact formula: `amount × coefficient / 10^scale`.
 */
export function multiply(value: Money, factor: Decimal, mode: RoundingMode): Money {
  assertRoundingMode(mode);
  return makeMoney(
    shiftAndRound(value.amount * factor.coefficient, -factor.scale, mode),
    value.currency,
  );
}

/**
 * `value × ratePercent / 100`: `percentage(m, decimal("22"), "halfUp")` is 22 % of `m`.
 * Exact formula: `amount × coefficient / 10^(scale + 2)`.
 */
export function percentage(value: Money, ratePercent: Decimal, mode: RoundingMode): Money {
  assertRoundingMode(mode);
  return makeMoney(
    shiftAndRound(value.amount * ratePercent.coefficient, -(ratePercent.scale + 2), mode),
    value.currency,
  );
}

/**
 * `value / divisor`, rounded to minor units with `mode`.
 * Exact formula: `amount × 10^scale / coefficient`.
 * @throws DivisionByZeroError
 */
export function divide(value: Money, divisor: Decimal, mode: RoundingMode): Money {
  assertRoundingMode(mode);
  return makeMoney(
    divideAndRound(value.amount * pow10(divisor.scale), divisor.coefficient, mode),
    value.currency,
  );
}

/**
 * Splits `value` proportionally to `ratios` with the largest-remainder method.
 *
 * Never loses or creates a minor unit: the shares sum to `value`. Each share is within one minor
 * unit of its exact proportional value; leftover units go to the largest remainders, ties to the
 * lower index. A zero ratio always gets a zero share. Deterministic.
 *
 * `allocate(€1.00, [1, 1, 1])` = `[0.34, 0.33, 0.33]`.
 *
 * @throws InvalidAmountError reason `"no-ratios"` or `"negative-ratio"`
 * @throws DivisionByZeroError when every ratio is zero
 */
export function allocate(value: Money, ratios: readonly Decimal[]): readonly Money[] {
  if (ratios.length === 0) {
    throw new InvalidAmountError("no-ratios", "allocate needs at least one ratio");
  }

  // 1. Integer weights at the common scale.
  let commonScale = 0;
  for (const ratio of ratios) {
    if (ratio.coefficient < 0n) {
      throw new InvalidAmountError("negative-ratio", "allocate ratios must not be negative");
    }
    commonScale = Math.max(commonScale, ratio.scale);
  }
  const weights = ratios.map((ratio) => ratio.coefficient * pow10(commonScale - ratio.scale));
  const total = weights.reduce((acc, weight) => acc + weight, 0n);
  if (total === 0n) throw new DivisionByZeroError("allocate needs at least one positive ratio");

  // 2. Truncated shares of the absolute amount, with their remainders.
  const negative = value.amount < 0n;
  const amount = negative ? -value.amount : value.amount;
  const parts = weights.map((weight, index) => ({
    index,
    share: (amount * weight) / total,
    remainder: (amount * weight) % total,
  }));

  // 3. Hand out the leftover units to the largest remainders (ties: lower index first).
  let leftover = amount - parts.reduce((acc, part) => acc + part.share, 0n);
  const order = [...parts].sort((x, y) =>
    x.remainder > y.remainder ? -1 : x.remainder < y.remainder ? 1 : x.index - y.index,
  );
  const bonus = new Set<number>();
  for (const part of order) {
    if (leftover === 0n) break;
    bonus.add(part.index);
    leftover -= 1n;
  }

  // 4. Restore the sign.
  return Object.freeze(
    parts.map((part) => {
      const share = bonus.has(part.index) ? part.share + 1n : part.share;
      return makeMoney(negative ? -share : share, value.currency);
    }),
  );
}

/**
 * Converts with an explicit rate: `rate` units of `to` (major units) per 1 unit of
 * `value.currency`, rounded to the minor units of `to` with `mode`.
 *
 * Formula: with source exponent `e_f`, target exponent `e_t` and `rate = c × 10^(-s)`,
 * `k = e_t - e_f - s`; the result is `amount × c × 10^k` when `k ≥ 0`, otherwise
 * `divideAndRound(amount × c, 10^(-k), mode)`.
 *
 * Converting to the same currency requires a rate of exactly 1 and returns `value`.
 *
 * @throws InvalidCurrencyError for an unknown target
 * @throws InvalidAmountError reason `"non-positive-rate"`, or `"same-currency-rate"` when the
 *   currencies are equal and the rate is not 1
 */
export function convert(value: Money, to: CurrencyCode, rate: Decimal, mode: RoundingMode): Money {
  assertRoundingMode(mode);
  assertConversion(value.currency, to, rate);
  if (value.currency === to) return value;
  const shift = minorUnitExponent(to) - minorUnitExponent(value.currency) - rate.scale;
  return makeMoney(shiftAndRound(value.amount * rate.coefficient, shift, mode), to);
}

/** @internal Shared checks of `convert` and `convertPrice`. */
export function assertConversion(from: CurrencyCode, to: CurrencyCode, rate: Decimal): void {
  assertCurrencyCode(to);
  if (rate.coefficient <= 0n) {
    throw new InvalidAmountError("non-positive-rate", "Exchange rates must be positive");
  }
  if (from === to && !decimalEquals(rate, DECIMAL_ONE)) {
    throw new InvalidAmountError(
      "same-currency-rate",
      `Converting ${from} to itself needs a rate of exactly 1`,
    );
  }
}
