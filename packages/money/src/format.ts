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
 * into the locale's numbering system; plural-dependent words come from a short proxy value with
 * the same plural operands. Both paths give identical parts (see {@link fallbackParts}).
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
 * The most fraction digits an engine without Intl.NumberFormat v3 accepts (ECMA-402 2022 caps
 * `minimumFractionDigits`/`maximumFractionDigits` at 20; v3 raised the cap to 100).
 */
const MAX_LEGACY_FRACTION_DIGITS = 20;

/**
 * @internal Fallback path for engines that convert strings to floats. Same precondition and
 * same output as {@link exactParts}, without ever formatting a digit of `value` from a float.
 * The maximum is not needed: since it is at least `value.scale`, Intl only drops trailing zeros
 * beyond the minimum.
 *
 * Requires only ES2020 `Intl.NumberFormat` (bigint `formatToParts`, `style: "unit"`,
 * `signDisplay`, `currencyDisplay: "narrowSymbol"`) and supports every option of
 * {@link FormatMoneyOptions} and every scale up to `MAX_DECIMAL_SCALE`, within that edition's
 * limits:
 *
 * 1. Numbers: a `bigint` template (the integer part, or ±1 when it is zero, for the sign and
 *    layout) is formatted with at most 20 fraction digits, then its fraction (and borrowed
 *    integer) is replaced by the real digits, transliterated into the locale's numbering system.
 * 2. `signDisplay: "negative"` (v3 only) is formatted as `"auto"`: the two differ only for a
 *    negative zero, which neither the bigint template nor the proxy below can be.
 * 3. Words that depend on the plural category (currency names, units) cannot come from a
 *    template whose fraction is zeros: `1.00 euro` is "one" in Spanish, `0.01 euros` is "other".
 *    They come from a proxy decimal string with the sign and the plural operands of the shown
 *    value (see {@link pluralProxy}), of at most 15 significant digits so that it survives even an
 *    engine that converts it to a float; only its words are kept. They are the exact path's
 *    whenever the shown value has at most 15 significant digits and 20 decimals.
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
  // and the value is not (a zero template would lose the sign of -0.50). Its fraction digits are
  // replaced, so only their presence matters, not their count.
  const options =
    base.signDisplay === "negative" ? { ...base, signDisplay: "auto" as const } : base;
  const borrowed = integer === 0n && magnitude !== 0n;
  const template = borrowed ? 1n : integer;
  const templateDigits = Math.min(fraction.length, MAX_LEGACY_FRACTION_DIGITS);
  const numberFormat = formatter(locales, options, templateDigits, templateDigits);
  const digits = new Intl.NumberFormat(locales, {
    numberingSystem: numberFormat.resolvedOptions().numberingSystem,
    useGrouping: false,
  });

  const numeric = numberFormat.formatToParts(negative ? -template : template).map((part) => {
    if (part.type === "fraction") return { type: part.type, value: localize(digits, fraction) };
    if (part.type === "integer" && borrowed) {
      return { type: part.type, value: localize(digits, "0") };
    }
    return part;
  });
  if (!hasPluralWords(options)) return numeric;
  const proxy = pluralProxy(negative, integer, fraction);
  if (proxy === undefined) return numeric;
  const words = formatter(locales, options, proxy.fractionDigits, proxy.fractionDigits)
    // A short decimal string, exact even where Intl converts it to a float (see pluralProxy).
    .formatToParts(proxy.text as Intl.StringNumericLiteral);
  return spliceNumber(words, numeric);
}

/** Whether the words around the number depend on its plural category ("1 euro", "2 euros"). */
function hasPluralWords(options: BaseOptions): boolean {
  return (
    options.style === "unit" || (options.style === "currency" && options.currencyDisplay === "name")
  );
}

/** Significant digits that a float always holds exactly (DBL_DIG): decimal -> double -> decimal. */
const FLOAT_SAFE_DIGITS = 15;
/** ICU derives the plural operand `i` from the last 18 digits of the integer part. */
const ICU_INTEGER_LIMIT = 10n ** 18n;
/**
 * Largest modulus in the CLDR cardinal plural rules (`i % 1000000 = 0`, the "many" category of
 * Spanish, French, Italian, Portuguese and Catalan).
 */
const PROXY_INTEGER_MODULUS = 10n ** 6n;
/** Fraction digits of a reduced proxy (see compressFraction). */
const PROXY_FRACTION_DIGITS = 8;

/**
 * @internal The decimal string whose words (currency name, unit) are those of the shown value
 * `[-]integer.fraction`, as `{ text, fractionDigits }`, or `undefined` when the template's own
 * words already are. ICU picks the words by the plural category of the formatted digits (CLDR
 * TR35 operands: `n` the absolute value, `i` the integer digits, `v` the number of fraction
 * digits, `f` and `t` the fraction digits with and without trailing zeros, `w` the count of the
 * latter). Three cases:
 *
 * 1. Only zeros after the point: the template has the same operands (`v` at most 20 instead of
 *    more, which no rule tells apart).
 * 2. At most 15 significant digits and 20 decimals: the value's own text. Every float holds it
 *    exactly, so ICU computes exactly the operands of the exact path, on every engine.
 * 3. Otherwise ICU's own exact path works from approximations (`n` is a double, `i` keeps the last
 *    18 integer digits, `f` and `t` the first 19 fraction digits), which no short decimal can
 *    reproduce in general. The proxy keeps what the rules observe of the exact value: the last 18
 *    integer digits as ICU does, reduced modulo 10^6 (the largest modulus in the rules) above
 *    10^6, and the fraction compressed to 8 digits (see compressFraction). The words can then
 *    differ from the exact path's, never the digits.
 */
export function pluralProxy(
  negative: boolean,
  integer: bigint,
  fraction: string,
): { readonly text: string; readonly fractionDigits: number } | undefined {
  const trimmed = fraction.replace(/0+$/, "");
  if (trimmed === "") return undefined;
  const significant = `${integer.toString()}${trimmed}`.replace(/^0+/, "");
  let i = integer;
  let f = fraction;
  if (significant.length > FLOAT_SAFE_DIGITS || fraction.length > MAX_LEGACY_FRACTION_DIGITS) {
    i = integer % ICU_INTEGER_LIMIT;
    if (i >= PROXY_INTEGER_MODULUS) i = PROXY_INTEGER_MODULUS + (i % PROXY_INTEGER_MODULUS);
    if (f.length > PROXY_FRACTION_DIGITS) f = compressFraction(f);
  }
  return { text: `${negative ? "-" : ""}${i.toString()}.${f}`, fractionDigits: f.length };
}

/**
 * A fraction of more than {@link PROXY_FRACTION_DIGITS} digits, not all zeros, as exactly that
 * many digits with what the rules observe of `f` and `t` (residues modulo at most 100, equality
 * with small numbers): the significant digits of `t` keep their last three behind a leading 1 when
 * there are more than three (so `t` keeps its residue modulo 1000 and stays at least 1000), at
 * most three trailing zeros are kept (so `f` does too), and leading zeros pad the result. `v`
 * becomes 8, which the rules (`v = 0`, `v = 2`) do not tell apart from any larger count.
 */
function compressFraction(fraction: string): string {
  const trimmed = fraction.replace(/0+$/, "");
  const zeros = Math.min(fraction.length - trimmed.length, 3);
  const significant = trimmed.replace(/^0+/, "");
  const kept = significant.length <= 3 ? significant : `1${significant.slice(-3)}`;
  return kept.padStart(PROXY_FRACTION_DIGITS - zeros, "0") + "0".repeat(zeros);
}

const NUMBER_PART_TYPES: ReadonlySet<string> = new Set(["integer", "group", "decimal", "fraction"]);

/** `words` with its number (integer, group, decimal and fraction parts) replaced by `number`'s. */
function spliceNumber(
  words: readonly Intl.NumberFormatPart[],
  number: readonly Intl.NumberFormatPart[],
): Intl.NumberFormatPart[] {
  const [wordsStart, wordsEnd] = numberRange(words);
  const [numberStart, numberEnd] = numberRange(number);
  return [
    ...words.slice(0, wordsStart),
    ...number.slice(numberStart, numberEnd),
    ...words.slice(wordsEnd),
  ];
}

/** Start and end (exclusive) of the contiguous number parts; Intl always emits an integer. */
function numberRange(parts: readonly Intl.NumberFormatPart[]): readonly [number, number] {
  let start = 0;
  while (start < parts.length && !isNumberPart(parts[start])) start += 1;
  let end = start;
  while (end < parts.length && isNumberPart(parts[end])) end += 1;
  return [start, end];
}

function isNumberPart(part: Intl.NumberFormatPart | undefined): boolean {
  return part !== undefined && NUMBER_PART_TYPES.has(part.type);
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
