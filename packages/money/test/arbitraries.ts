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
 * (denominator > 0) for `mode`: within half a unit for the half modes, less than one unit and
 * on the right side for the directed modes.
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
    case "halfDown":
      return 2n * absBig(error) <= denominator;
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

/** Replaces the spaces ICU versions disagree on (U+00A0, U+202F) with a plain space. */
export function normalizeSpaces(text: string): string {
  return text.replace(/[\u00A0\u202F]/g, " ");
}
