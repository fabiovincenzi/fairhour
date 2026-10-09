import { CURRENCY_DATA } from "./currencies.data";
import { InvalidCurrencyError } from "./errors";

/** Every ISO 4217 alphabetic code in the snapshot, as a literal union (`"EUR" | "JPY" | ...`). */
export type CurrencyCode = keyof typeof CURRENCY_DATA;

/** Number of decimal places of a currency's minor unit (ISO 4217 "minor unit"). */
export type MinorUnitExponent = 0 | 2 | 3 | 4;

export interface CurrencyInfo {
  readonly code: CurrencyCode;
  /** ISO 4217 numeric code, three digits, zero-padded ("036"). */
  readonly numeric: string;
  /** ISO 4217 "minor unit": number of decimal places of the minor unit. */
  readonly exponent: MinorUnitExponent;
  /** English name from the ISO list. */
  readonly name: string;
}

/** All codes, sorted alphabetically (stable, for pickers and tests). */
export const CURRENCY_CODES: readonly CurrencyCode[] = Object.freeze(
  // Default sort: by UTF-16 code units, which is alphabetical for upper-case ASCII codes.
  (Object.keys(CURRENCY_DATA) as CurrencyCode[]).sort(),
);

const INFO: ReadonlyMap<string, CurrencyInfo> = new Map(
  CURRENCY_CODES.map((code): [string, CurrencyInfo] => [
    code,
    Object.freeze({ code, ...CURRENCY_DATA[code] }),
  ]),
);

/** True for an exact, upper-case code of the snapshot (`"EUR"`, not `"eur"` or `" EUR"`). */
export function isCurrencyCode(value: string): value is CurrencyCode {
  return typeof value === "string" && INFO.has(value);
}

/**
 * Returns `value` typed as a `CurrencyCode`. Accepts only the exact upper-case code.
 * @throws InvalidCurrencyError
 */
export function assertCurrencyCode(value: string): CurrencyCode {
  if (!isCurrencyCode(value)) {
    throw new InvalidCurrencyError(typeof value === "string" ? value : `<${typeof value}>`);
  }
  return value;
}

/**
 * Code, numeric code, minor-unit exponent and English name of a currency.
 * @throws InvalidCurrencyError when called (from untyped code) with an unknown code
 */
export function currencyInfo(code: CurrencyCode): CurrencyInfo {
  const info = INFO.get(code);
  if (info === undefined) throw new InvalidCurrencyError(code);
  return info;
}

/**
 * Decimal places of the currency's minor unit: 2 for EUR, 0 for JPY, 3 for KWD, 4 for CLF.
 * @throws InvalidCurrencyError when called (from untyped code) with an unknown code
 */
export function minorUnitExponent(code: CurrencyCode): MinorUnitExponent {
  return currencyInfo(code).exponent;
}
