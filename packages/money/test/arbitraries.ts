import * as fc from "fast-check";

import type { CurrencyCode } from "../src/currency";
import { decimal, decimalToString } from "../src/decimal";
import type { Decimal } from "../src/decimal";
import { money } from "../src/money";
import type { Money } from "../src/money";
import { ROUNDING_MODES } from "../src/rounding";
import type { RoundingMode } from "../src/rounding";

/** Amounts in minor units, as in the design's test plan: [-10^18, 10^18]. */
export const amountArb = fc.bigInt({ min: -(10n ** 18n), max: 10n ** 18n });

/** Currencies covering every exponent: 0 (JPY), 2 (EUR, USD, CHF), 3 (KWD), 4 (CLF). */
export const currencyArb = fc.constantFrom<CurrencyCode>("EUR", "USD", "CHF", "JPY", "KWD", "CLF");

export const moneyArb = fc
  .tuple(amountArb, currencyArb)
  .map(([amount, currency]) => money(amount, currency));

export function moneyIn(currency: CurrencyCode): fc.Arbitrary<Money> {
  return amountArb.map((amount) => money(amount, currency));
}

/** Decimals with scale 0..8, built through the public parser so they are always valid. */
export const decimalArb: fc.Arbitrary<Decimal> = fc
  .tuple(fc.bigInt({ min: -(10n ** 15n), max: 10n ** 15n }), fc.integer({ min: 0, max: 8 }))
  .map(([coefficient, scale]) => decimal(decimalToString({ coefficient, scale })));

export const nonNegativeDecimalArb: fc.Arbitrary<Decimal> = fc
  .tuple(fc.bigInt({ min: 0n, max: 10n ** 12n }), fc.integer({ min: 0, max: 8 }))
  .map(([coefficient, scale]) => decimal(decimalToString({ coefficient, scale })));

export const modeArb = fc.constantFrom<RoundingMode>(...ROUNDING_MODES);
export const halfModeArb = fc.constantFrom<RoundingMode>("halfUp", "halfEven", "halfDown");
export const directedModeArb = fc.constantFrom<RoundingMode>("up", "down", "ceiling", "floor");

export function absBig(value: bigint): bigint {
  return value < 0n ? -value : value;
}

/**
 * Checks that `rounded` is a correct rounding of the exact rational `numerator / denominator`
 * (denominator > 0) for `mode`: within half a unit for the half modes, in the mode's direction on
 * an exact tie, less than one unit and on the right side for the directed modes.
 */
export function isCorrectRounding(
  rounded: bigint,
  numerator: bigint,
  denominator: bigint,
  mode: RoundingMode,
): boolean {
  const error = rounded * denominator - numerator; // (rounded - exact) × denominator
  switch (mode) {
    case "halfUp":
    case "halfEven":
    case "halfDown": {
      const twiceError = 2n * absBig(error);
      if (twiceError !== denominator) return twiceError < denominator;
      // An exact tie: both neighbours are half a unit away, the mode picks one.
      const awayFromZero = absBig(rounded * denominator) > absBig(numerator);
      if (mode === "halfUp") return awayFromZero;
      if (mode === "halfDown") return !awayFromZero;
      return rounded % 2n === 0n;
    }
    case "up":
      return absBig(error) < denominator && absBig(rounded * denominator) >= absBig(numerator);
    case "down":
      return absBig(error) < denominator && absBig(rounded * denominator) <= absBig(numerator);
    case "ceiling":
      return error >= 0n && error < denominator;
    case "floor":
      return error <= 0n && -error < denominator;
  }
}

/**
 * An exact tie `numerator / denominator = ±(q + ½)`: an even denominator `d`, a quotient `q ≥ 0`
 * and the numerator `±(q·d + d/2)`, both signs.
 */
export interface Tie {
  readonly numerator: bigint;
  readonly denominator: bigint;
  readonly quotient: bigint;
  readonly negative: boolean;
}

export const tieArb: fc.Arbitrary<Tie> = fc
  .tuple(
    fc.bigInt({ min: 0n, max: 10n ** 18n }),
    fc.bigInt({ min: 1n, max: 10n ** 12n }),
    fc.boolean(),
  )
  .map(([quotient, half, negative]) => {
    const magnitude = quotient * 2n * half + half;
    return {
      numerator: negative ? -magnitude : magnitude,
      denominator: 2n * half,
      quotient,
      negative,
    };
  });

/**
 * Ties that the scaling functions produce: `±(q·10^k + 5·10^(k-1)) / 10^k = ±(q + ½)` for
 * `1 ≤ k ≤ 8`, as `{ numerator, digits: k, quotient, negative }`.
 */
export const decimalTieArb = fc
  .tuple(fc.bigInt({ min: 0n, max: 10n ** 15n }), fc.integer({ min: 1, max: 8 }), fc.boolean())
  .map(([quotient, digits, negative]) => {
    const unit = 10n ** BigInt(digits);
    const magnitude = quotient * unit + unit / 2n;
    return { numerator: negative ? -magnitude : magnitude, digits, quotient, negative };
  });

/**
 * How each mode rounds the tie `±(q + ½)`, from the definitions of the modes: `halfUp` and `up`
 * away from zero, `halfDown` and `down` toward zero, `halfEven` to the even neighbour, `ceiling`
 * up and `floor` down.
 */
export function tieRounding(quotient: bigint, negative: boolean, mode: RoundingMode): bigint {
  const toward = negative ? -quotient : quotient;
  const away = negative ? -(quotient + 1n) : quotient + 1n;
  switch (mode) {
    case "halfUp":
    case "up":
      return away;
    case "halfDown":
    case "down":
      return toward;
    case "halfEven":
      return quotient % 2n === 0n ? toward : away;
    case "ceiling":
      return negative ? toward : away;
    case "floor":
      return negative ? away : toward;
  }
}

/** Replaces the spaces ICU versions disagree on (U+00A0, U+202F) with a plain space. */
export function normalizeSpaces(text: string): string {
  return text.replace(/[\u00A0\u202F]/g, " ");
}
