/**
 * zod 4 schemas for `@fairhour/money` (entry point `@fairhour/money/zod`; `zod` is an optional
 * peer dependency). The transforming schemas are codecs: `schema.parse(json)` decodes,
 * `z.encode(schema, value)` encodes back to the JSON form.
 *
 * Encoding is symmetric with decoding: a value whose text the decoder would reject (more than
 * `MAX_DECIMAL_DIGITS` digits, which only arithmetic can produce) throws
 * `InvalidAmountError` (reason `"out-of-range"`), like `moneyToJson`. It is an overflow, not
 * invalid input, so it is thrown rather than reported as an issue: zod does not catch errors
 * thrown by a codec, so `z.safeEncode` throws it too.
 */
import * as z from "zod";

import { CURRENCY_CODES, assertCurrencyCode, isCurrencyCode, minorUnitExponent } from "./currency";
import type { CurrencyCode } from "./currency";
import { decimal, encodeDigits, isDecimal, isDecimalString, tryDecimal } from "./decimal";
import type { Decimal } from "./decimal";
import type { MoneyJson, PriceJson } from "./json";
import { isMoney } from "./money";
import type { Money } from "./money";
import { parseMoney } from "./parse";
import { isPrice, price } from "./price";
import type { Price } from "./price";

/** An exact, upper-case ISO 4217 code of the snapshot (`"EUR"`). */
export const currencyCodeSchema: z.ZodType<CurrencyCode, string> = z
  .string()
  .refine(isCurrencyCode, {
    error: `Expected an ISO 4217 currency code in upper case, such as "EUR" (${CURRENCY_CODES.length} supported)`,
  });

/** Validated decimal string (stays a string: for JSON configs and forms). */
export const decimalStringSchema: z.ZodString = z.string().refine(isDecimalString, {
  error:
    'Expected a decimal string such as "1234.56" (no exponent, grouping or spaces; at most 80 digits and 40 decimals)',
});

/**
 * Decimal string -> `Decimal` (encodes back to the text of `decimalToString`).
 * Encoding throws `InvalidAmountError` (`"out-of-range"`) above `MAX_DECIMAL_DIGITS` digits.
 */
export const decimalSchema: z.ZodType<Decimal, string> = z.codec(
  decimalStringSchema,
  z.custom<Decimal>(isDecimal),
  {
    decode: (value) => decimal(value),
    encode: (value) => encodeDigits(value.coefficient, value.scale),
  },
);

/** The amount of `value` as `toDecimalString` writes it, or `out-of-range` (see the module doc). */
function encodeMoneyAmount(value: Money): string {
  return encodeDigits(value.amount, minorUnitExponent(value.currency));
}

/**
 * True when `amount` has no more significant decimals than `currency` allows. Invalid amounts and
 * currencies pass here: zod runs every refinement, and their own checks already report them.
 */
function fitsCurrency(amount: string, currency: string): boolean {
  const value = tryDecimal(amount);
  if (value === undefined || !isCurrencyCode(currency)) return true;
  const extra = value.scale - minorUnitExponent(currency);
  return extra <= 0 || value.coefficient % 10n ** BigInt(extra) === 0n;
}

const TOO_PRECISE = "Amount has more decimals than the currency's minor unit allows";

/**
 * `{ amount: "1234.56", currency: "EUR" }` -> `Money` (strict: `"1.235"` EUR is rejected).
 * Encoding throws `InvalidAmountError` (`"out-of-range"`) above `MAX_DECIMAL_DIGITS` digits.
 */
export const moneyJsonSchema: z.ZodType<Money, MoneyJson> = z.codec(
  z
    .object({ amount: decimalStringSchema, currency: currencyCodeSchema })
    .refine((json) => fitsCurrency(json.amount, json.currency), {
      error: TOO_PRECISE,
      path: ["amount"],
    }),
  z.custom<Money>(isMoney),
  {
    decode: (json) => parseMoney(json.amount, json.currency),
    encode: (value) => ({ amount: encodeMoneyAmount(value), currency: value.currency }),
  },
);

/**
 * Amount string in a currency fixed by the caller -> `Money` (`"1234.56"` -> €1,234.56).
 * Encoding a `Money` in another currency fails validation; encoding one above
 * `MAX_DECIMAL_DIGITS` digits throws `InvalidAmountError` (`"out-of-range"`).
 * @throws InvalidCurrencyError (when the schema is built) for an unknown `currency`
 */
export function moneyStringSchema(currency: CurrencyCode): z.ZodType<Money, string> {
  const code = assertCurrencyCode(currency);
  return z.codec(
    decimalStringSchema.refine((amount) => fitsCurrency(amount, code), { error: TOO_PRECISE }),
    z.custom<Money>((value) => isMoney(value) && value.currency === code, {
      error: `Expected a Money in ${code}`,
    }),
    { decode: (amount) => parseMoney(amount, code), encode: encodeMoneyAmount },
  );
}

/**
 * `{ amount: "0.4253", currency: "EUR" }` -> `Price` (keeps the amount's scale).
 * Encoding throws `InvalidAmountError` (`"out-of-range"`) above `MAX_DECIMAL_DIGITS` digits.
 */
export const priceJsonSchema: z.ZodType<Price, PriceJson> = z.codec(
  z.object({ amount: decimalStringSchema, currency: currencyCodeSchema }),
  z.custom<Price>(isPrice),
  {
    decode: (json) => price(json.amount, json.currency),
    encode: (value) => ({
      amount: encodeDigits(value.amount.coefficient, value.amount.scale),
      currency: value.currency,
    }),
  },
);
