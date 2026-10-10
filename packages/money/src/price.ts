import { assertConversion, shiftAndRound } from "./arithmetic";
import { assertCurrencyCode, isCurrencyCode, minorUnitExponent } from "./currency";
import type { CurrencyCode } from "./currency";
import { decimal, isDecimal, makeDecimal, multiplyDecimal } from "./decimal";
import type { Decimal } from "./decimal";
import { makeMoney } from "./money";
import type { Money } from "./money";
import { assertRoundingMode } from "./rounding";
import type { RoundingMode } from "./rounding";

/**
 * A unit price with sub-minor-unit precision (€0.4253/km, a FatturaPA `PrezzoUnitario` with up to
 * 8 decimals). A unit price is not a `Money`; the line total computed by {@link extend} is.
 */
export interface Price {
  /** Major units, exact. Scale ≥ the currency exponent is not required ("50" is €50). */
  readonly amount: Decimal;
  readonly currency: CurrencyCode;
}

function makePrice(amount: Decimal, currency: CurrencyCode): Price {
  return Object.freeze({ amount, currency });
}

/**
 * Frozen `Price` from a decimal string in major units: `price("0.4253", "EUR")`.
 * @throws InvalidAmountError, InvalidCurrencyError
 */
export function price(amount: string, currency: CurrencyCode): Price {
  const code = assertCurrencyCode(currency);
  return makePrice(decimal(amount), code);
}

/** The exact unit price of a `Money` (scale = the currency exponent). */
export function priceFromMoney(value: Money): Price {
  return makePrice(makeDecimal(value.amount, minorUnitExponent(value.currency)), value.currency);
}

/** Structural guard: a valid `Decimal` amount and a known `currency`. */
export function isPrice(value: unknown): value is Price {
  return (
    typeof value === "object" &&
    value !== null &&
    "amount" in value &&
    "currency" in value &&
    isDecimal(value.amount) &&
    typeof value.currency === "string" &&
    isCurrencyCode(value.currency)
  );
}

/**
 * `quantity × unitPrice` rounded to the currency's minor units with `mode`: the line total.
 * The product is exact; this is the only rounding.
 */
export function extend(unitPrice: Price, quantity: Decimal, mode: RoundingMode): Money {
  assertRoundingMode(mode);
  const shift = minorUnitExponent(unitPrice.currency) - unitPrice.amount.scale - quantity.scale;
  return makeMoney(
    shiftAndRound(unitPrice.amount.coefficient * quantity.coefficient, shift, mode),
    unitPrice.currency,
  );
}

/**
 * Exact conversion of a unit price (no rounding): `amount × rate`, with `rate` units of `to` per
 * 1 unit of `value.currency`. The result's scale is the sum of the scales (rescale it with
 * `rescaleDecimal` when a document limits the decimals). Same checks as `convert`.
 * @throws InvalidCurrencyError
 * @throws InvalidAmountError reason `"non-positive-rate"`, `"same-currency-rate"` or
 *   `"scale-overflow"`
 */
export function convertPrice(value: Price, to: CurrencyCode, rate: Decimal): Price {
  assertConversion(value.currency, to, rate);
  if (value.currency === to) return value;
  return makePrice(multiplyDecimal(value.amount, rate), to);
}
