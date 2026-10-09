import { assertCurrencyCode } from "./currency";
import { decimalToString } from "./decimal";
import { InvalidAmountError, InvalidCurrencyError } from "./errors";
import type { Money } from "./money";
import { parseMoney, toDecimalString } from "./parse";
import { price } from "./price";
import type { Price } from "./price";

/** JSON form of a `Money`: `{ "amount": "1234.56", "currency": "EUR" }` (never a number). */
export interface MoneyJson {
  readonly amount: string;
  readonly currency: string;
}

/** JSON form of a `Price`: `{ "amount": "0.4253", "currency": "EUR" }`. */
export interface PriceJson {
  readonly amount: string;
  readonly currency: string;
}

/** `{ amount, currency }` with the amount from `toDecimalString` (exactly `exponent` decimals). */
export function moneyToJson(value: Money): MoneyJson {
  return Object.freeze({ amount: toDecimalString(value), currency: value.currency });
}

/**
 * Strict inverse of {@link moneyToJson} (`parseMoney` rules: `"1.235"` EUR is rejected).
 * @throws InvalidAmountError, InvalidCurrencyError
 */
export function moneyFromJson(json: MoneyJson): Money {
  const { amount, currency } = fields(json);
  return parseMoney(amount, assertCurrencyCode(currency));
}

/** `{ amount, currency }` with the amount's own scale (`"0.4250"` stays `"0.4250"`). */
export function priceToJson(value: Price): PriceJson {
  return Object.freeze({ amount: decimalToString(value.amount), currency: value.currency });
}

/**
 * Strict inverse of {@link priceToJson}.
 * @throws InvalidAmountError, InvalidCurrencyError
 */
export function priceFromJson(json: PriceJson): Price {
  const { amount, currency } = fields(json);
  return price(amount, assertCurrencyCode(currency));
}

/** Runtime shape check for JSON that did not go through a schema. */
function fields(json: unknown): { readonly amount: string; readonly currency: string } {
  if (typeof json !== "object" || json === null) {
    throw new InvalidAmountError("syntax", "Expected an object { amount, currency }");
  }
  const amount: unknown = "amount" in json ? json.amount : undefined;
  const currency: unknown = "currency" in json ? json.currency : undefined;
  if (typeof currency !== "string") throw new InvalidCurrencyError(`<${typeof currency}>`);
  if (typeof amount !== "string") {
    throw new InvalidAmountError("syntax", "Expected the amount as a decimal string");
  }
  return { amount, currency };
}
