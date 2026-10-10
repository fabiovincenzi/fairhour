import { shiftAndRound } from "./arithmetic";
import { assertCurrencyCode, minorUnitExponent } from "./currency";
import type { CurrencyCode } from "./currency";
import { decimal, digitsToString, makeDecimal, pow10 } from "./decimal";
import type { Decimal } from "./decimal";
import { InvalidAmountError } from "./errors";
import { makeMoney } from "./money";
import type { Money } from "./money";
import { assertRoundingMode } from "./rounding";
import type { RoundingMode } from "./rounding";

/**
 * Parses a decimal string in major units: `"1234.56"` in EUR -> `123456n`. Same strict grammar as
 * `decimal`. Extra fractional digits are accepted only when they are zeros: `"1.230"` is fine in
 * EUR, `"1.235"` throws with reason `"too-precise"` (round explicitly with `fromDecimal`).
 * @throws InvalidAmountError, InvalidCurrencyError
 */
export function parseMoney(value: string, currency: CurrencyCode): Money {
  const code = assertCurrencyCode(currency);
  const parsed = decimal(value);
  const exponent = minorUnitExponent(code);
  if (parsed.scale > exponent && parsed.coefficient % pow10(parsed.scale - exponent) !== 0n) {
    throw new InvalidAmountError(
      "too-precise",
      `Amount has more than ${exponent} significant decimals for ${code}: round it explicitly`,
    );
  }
  // Exact: either digits are added, or only zeros are dropped.
  return makeMoney(shiftAndRound(parsed.coefficient, exponent - parsed.scale, "down"), code);
}

/** Exactly `exponent` fractional digits: EUR `"-0.50"`, JPY `"1234"`, KWD `"1.234"`. */
export function toDecimalString(value: Money): string {
  return digitsToString(value.amount, minorUnitExponent(value.currency));
}

/** The exact amount in major units, with scale = the currency exponent. */
export function toDecimal(value: Money): Decimal {
  return makeDecimal(value.amount, minorUnitExponent(value.currency));
}

/**
 * A decimal in major units rounded to the currency's minor units with `mode`.
 * @throws InvalidCurrencyError
 */
export function fromDecimal(value: Decimal, currency: CurrencyCode, mode: RoundingMode): Money {
  assertRoundingMode(mode);
  const code = assertCurrencyCode(currency);
  return makeMoney(
    shiftAndRound(value.coefficient, minorUnitExponent(code) - value.scale, mode),
    code,
  );
}
