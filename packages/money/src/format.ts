import { minorUnitExponent } from "./currency";
import { decimalToString, makeDecimal, pow10 } from "./decimal";
import type { Decimal } from "./decimal";
import type { Money } from "./money";
import type { Price } from "./price";

/**
 * Formatting never converts an amount to a JavaScript `number`.
 *
 * Exact path (ECMA-402 2023, Intl.NumberFormat v3): `Intl.NumberFormat` receives the decimal
 * string, which it treats as an exact "Intl mathematical value", with the fraction digits pinned
 * so that it never rounds. Fallback (older engines): the integer part is formatted as a `bigint`
 * (exact since ES2020) with `formatToParts`, and the fraction digits are spliced in, transliterated
 * into the locale's numbering system. Both paths give identical parts.
 */

export interface FormatMoneyOptions {
  readonly currencyDisplay?: "symbol" | "narrowSymbol" | "code" | "name";
  readonly signDisplay?: "auto" | "always" | "exceptZero" | "negative" | "never";
  readonly useGrouping?: boolean;
}

type Locales = string | readonly string[];

/** Formatter options without the fraction digits, which are computed per value. */
type BaseOptions = Omit<
  Intl.NumberFormatOptions,
  "minimumFractionDigits" | "maximumFractionDigits"
>;

let exactStringFormatting: boolean | undefined;

/**
 * Whether this engine formats decimal strings exactly (Intl.NumberFormat v3: Chrome/Edge 106+,
 * Firefox 116+, Safari 15.4+, Node 19+). Detected once, by formatting 2^53 + 1, which a float
 * would round; the result is memoized (the only cache in the package).
 */
export function supportsExactStringFormatting(): boolean {
  exactStringFormatting ??=
    new Intl.NumberFormat("en-US", { useGrouping: false, maximumFractionDigits: 0 }).format(
      "9007199254740993",
    ) === "9007199254740993";
  return exactStringFormatting;
}

/**
 * @internal Test hook: forces the exact path (`true`), the fallback (`false`) or re-detection
 * (`undefined`). Not exported from the package entry point.
 */
export function overrideExactStringFormattingForTests(value: boolean | undefined): void {
  exactStringFormatting = value;
}

function formatter(
  locales: Locales,
  base: BaseOptions,
  minimumFractionDigits: number,
  maximumFractionDigits: number,
): Intl.NumberFormat {
  return new Intl.NumberFormat(locales, { ...base, minimumFractionDigits, maximumFractionDigits });
}

/**
 * @internal Exact path. Precondition: `maximumFractionDigits ≥ value.scale`, so Intl never rounds.
 */
export function exactParts(
  locales: Locales,
  base: BaseOptions,
  value: Decimal,
  minimumFractionDigits: number,
  maximumFractionDigits: number,
): Intl.NumberFormatPart[] {
  return formatter(locales, base, minimumFractionDigits, maximumFractionDigits).formatToParts(
    // Only strings produced by decimalToString reach Intl (it prints "NaN" for invalid ones).
    decimalToString(value) as Intl.StringNumericLiteral,
  );
}

/**
 * @internal Fallback path for engines that convert strings to floats. Same precondition and
 * same output as {@link exactParts}, using only `bigint` formatting. The maximum is not needed:
 * since it is at least `value.scale`, Intl only drops trailing zeros beyond the minimum.
 */
export function fallbackParts(
  locales: Locales,
  base: BaseOptions,
  value: Decimal,
  minimumFractionDigits: number,
  _maximumFractionDigits: number,
): Intl.NumberFormatPart[] {
  const negative = value.coefficient < 0n;
  const magnitude = negative ? -value.coefficient : value.coefficient;
  const unit = pow10(value.scale);
  const integer = magnitude / unit;

  // The fraction digits Intl would show: trailing zeros beyond the minimum dropped, then padded.
  let fraction = value.scale === 0 ? "" : (magnitude % unit).toString().padStart(value.scale, "0");
  while (fraction.length > minimumFractionDigits && fraction.endsWith("0")) {
    fraction = fraction.slice(0, -1);
  }
  fraction = fraction.padEnd(minimumFractionDigits, "0");

  // A template with the right sign and layout: the integer part itself, or ±1 when it is zero
  // and the value is not (a zero template would lose the sign of -0.50).
  const borrowed = integer === 0n && magnitude !== 0n;
  const template = borrowed ? 1n : integer;
  const numberFormat = formatter(locales, base, fraction.length, fraction.length);
  const digits = new Intl.NumberFormat(locales, {
    numberingSystem: numberFormat.resolvedOptions().numberingSystem,
    useGrouping: false,
  });

  return numberFormat.formatToParts(negative ? -template : template).map((part) => {
    if (part.type === "fraction") return { type: part.type, value: localize(digits, fraction) };
    if (part.type === "integer" && borrowed) {
      return { type: part.type, value: localize(digits, "0") };
    }
    return part;
  });
}

/**
 * ASCII digits (leading zeros included) transliterated into a numbering system, by formatting the
 * bigint "1" + digits and dropping the leading one. Code points, not UTF-16 units, are counted:
 * some numbering systems use astral digits.
 */
function localize(digits: Intl.NumberFormat, ascii: string): string {
  const text = digits
    .formatToParts(BigInt(`1${ascii}`))
    .filter((part) => part.type === "integer")
    .map((part) => part.value)
    .join("");
  return Array.from(text).slice(1).join("");
}

function parts(
  locales: Locales,
  base: BaseOptions,
  value: Decimal,
  minimumFractionDigits: number,
  maximumFractionDigits: number,
): readonly Intl.NumberFormatPart[] {
  const result = supportsExactStringFormatting()
    ? exactParts(locales, base, value, minimumFractionDigits, maximumFractionDigits)
    : fallbackParts(locales, base, value, minimumFractionDigits, maximumFractionDigits);
  return Object.freeze(result.map((part) => Object.freeze({ type: part.type, value: part.value })));
}

function join(formatted: readonly Intl.NumberFormatPart[]): string {
  return formatted.map((part) => part.value).join("");
}

function currencyOptions(currency: string, options: FormatMoneyOptions | undefined): BaseOptions {
  const base: BaseOptions = { style: "currency", currency };
  if (options?.currencyDisplay !== undefined) base.currencyDisplay = options.currencyDisplay;
  if (options?.signDisplay !== undefined) base.signDisplay = options.signDisplay;
  if (options?.useGrouping !== undefined) base.useGrouping = options.useGrouping;
  return base;
}

/**
 * Formats an amount with exactly the currency's ISO 4217 decimals (not CLDR's display digits):
 * `formatMoney(money(1234567n, "EUR"), "it-IT")` -> `"12.345,67 €"`.
 * @throws RangeError for invalid locales (from Intl)
 */
export function formatMoney(
  value: Money,
  locales: string | readonly string[],
  options?: FormatMoneyOptions,
): string {
  return join(formatMoneyToParts(value, locales, options));
}

/** The parts of {@link formatMoney} (`currency`, `integer`, `group`, `decimal`, `fraction`, ...). */
export function formatMoneyToParts(
  value: Money,
  locales: string | readonly string[],
  options?: FormatMoneyOptions,
): readonly Intl.NumberFormatPart[] {
  const exponent = minorUnitExponent(value.currency);
  return parts(
    locales,
    currencyOptions(value.currency, options),
    makeDecimal(value.amount, exponent),
    exponent,
    exponent,
  );
}

/**
 * Formats a unit price with at least the currency exponent and at most the price's own scale:
 * `price("0.4253", "EUR")` -> `"€0.4253"`, `price("50", "EUR")` -> `"€50.00"` (en-US).
 */
export function formatPrice(
  value: Price,
  locales: string | readonly string[],
  options?: FormatMoneyOptions,
): string {
  const exponent = minorUnitExponent(value.currency);
  return join(
    parts(
      locales,
      currencyOptions(value.currency, options),
      value.amount,
      exponent,
      Math.max(exponent, value.amount.scale),
    ),
  );
}

/** Plain number (style "decimal"), exactly `value.scale` fractional digits. */
export function formatDecimal(value: Decimal, locales: string | readonly string[]): string {
  return join(parts(locales, { style: "decimal" }, value, value.scale, value.scale));
}

/** Percent units: `decimal("22")` -> `"22%"` (en), `"22%"` (it), `"22 %"` (fr). */
export function formatPercent(value: Decimal, locales: string | readonly string[]): string {
  return join(parts(locales, { style: "unit", unit: "percent" }, value, value.scale, value.scale));
}
