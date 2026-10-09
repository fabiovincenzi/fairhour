import { InvalidAmountError } from "./errors";
import { divideAndRound } from "./rounding";
import type { RoundingMode } from "./rounding";

/**
 * Exact decimal: value = coefficient × 10^(-scale). Used for rates, quantities, exchange rates
 * and unit prices. Not normalized: `"1.50"` keeps scale 2. Values are deeply frozen.
 */
export interface Decimal {
  readonly coefficient: bigint;
  /** Integer, 0 ≤ scale ≤ MAX_DECIMAL_SCALE. */
  readonly scale: number;
}

export const MAX_DECIMAL_SCALE = 40;
/** Maximum number of digits accepted by the parser (integer + fraction), a DoS guard. */
export const MAX_DECIMAL_DIGITS = 80;

/**
 * The strict grammar: `["-"] ("0" | nonzero digit*) ["." digit+]`. Locale-independent, no
 * exponent, no grouping, no surrounding whitespace. Internal: shared with the zod schemas.
 */
export const DECIMAL_PATTERN = /^(-?)(0|[1-9]\d*)(?:\.(\d+))?$/;

/** @internal Frozen constructor without validation, for results of exact arithmetic. */
export function makeDecimal(coefficient: bigint, scale: number): Decimal {
  return Object.freeze({ coefficient, scale });
}

/** @internal 10^exponent as a bigint (exponent ≥ 0). */
export function pow10(exponent: number): bigint {
  return 10n ** BigInt(exponent);
}

/** 0, scale 0. */
export const DECIMAL_ZERO: Decimal = makeDecimal(0n, 0);
/** 1, scale 0. */
export const DECIMAL_ONE: Decimal = makeDecimal(1n, 0);
/** 100, scale 0. */
export const DECIMAL_HUNDRED: Decimal = makeDecimal(100n, 0);

type ParseResult =
  | { readonly ok: true; readonly value: Decimal }
  | { readonly ok: false; readonly reason: "syntax" | "out-of-range"; readonly length: number };

function parse(value: string): ParseResult {
  if (typeof value !== "string") return { ok: false, reason: "syntax", length: 0 };
  const match = DECIMAL_PATTERN.exec(value);
  if (match === null) return { ok: false, reason: "syntax", length: value.length };
  const [, sign = "", integer = "", fraction = ""] = match;
  if (
    integer.length + fraction.length > MAX_DECIMAL_DIGITS ||
    fraction.length > MAX_DECIMAL_SCALE
  ) {
    return { ok: false, reason: "out-of-range", length: value.length };
  }
  const magnitude = BigInt(integer + fraction);
  return { ok: true, value: makeDecimal(sign === "-" ? -magnitude : magnitude, fraction.length) };
}

/**
 * Strict parser for decimal strings: `"22"`, `"0.5"`, `"-1.25"`, `"1.50"` (keeps scale 2),
 * `"-0"` (becomes 0). Rejects `""`, `"+1"`, `"1."`, `".5"`, `"01"`, `"1e3"`, `"1,5"`, `" 1"`,
 * `"1_000"`, `"NaN"`, `"Infinity"`, `"0x10"`.
 *
 * @throws InvalidAmountError reason `"syntax"`, or `"out-of-range"` above `MAX_DECIMAL_DIGITS`
 *   digits or `MAX_DECIMAL_SCALE` fractional digits
 */
export function decimal(value: string): Decimal {
  const result = parse(value);
  if (result.ok) return result.value;
  throw result.reason === "syntax"
    ? new InvalidAmountError(
        "syntax",
        `Invalid decimal string (input length ${result.length}): expected digits with an optional "-" and "." such as "-1234.56"`,
      )
    : new InvalidAmountError(
        "out-of-range",
        `Decimal string out of range (input length ${result.length}): at most ${MAX_DECIMAL_DIGITS} digits and ${MAX_DECIMAL_SCALE} decimals`,
      );
}

/** Like {@link decimal}, but returns `undefined` instead of throwing. */
export function tryDecimal(value: string): Decimal | undefined {
  const result = parse(value);
  return result.ok ? result.value : undefined;
}

/** True when {@link decimal} would accept `value`. */
export function isDecimalString(value: string): boolean {
  return parse(value).ok;
}

/** Structural guard: a bigint coefficient and an integer scale in `0..MAX_DECIMAL_SCALE`. */
export function isDecimal(value: unknown): value is Decimal {
  return (
    typeof value === "object" &&
    value !== null &&
    "coefficient" in value &&
    "scale" in value &&
    typeof value.coefficient === "bigint" &&
    isValidScale(value.scale)
  );
}

function isValidScale(scale: unknown): scale is number {
  return (
    typeof scale === "number" && Number.isInteger(scale) && scale >= 0 && scale <= MAX_DECIMAL_SCALE
  );
}

function assertScale(scale: number): void {
  if (!isValidScale(scale)) {
    throw new InvalidAmountError(
      "out-of-range",
      `Scale must be an integer between 0 and ${MAX_DECIMAL_SCALE}`,
    );
  }
}

/** The integer `value` as a decimal with scale 0. */
export function decimalFromInteger(value: bigint): Decimal {
  if (typeof value !== "bigint") throw new TypeError("decimalFromInteger expects a bigint");
  return makeDecimal(value, 0);
}

/** @internal Canonical text of `coefficient × 10^(-scale)`, exactly `scale` fractional digits. */
export function digitsToString(coefficient: bigint, scale: number): string {
  const negative = coefficient < 0n;
  const digits = (negative ? -coefficient : coefficient).toString().padStart(scale + 1, "0");
  const integer = digits.slice(0, digits.length - scale);
  const text = scale === 0 ? integer : `${integer}.${digits.slice(digits.length - scale)}`;
  return negative ? `-${text}` : text;
}

/** Canonical text keeping the scale: `decimal("1.50")` -> `"1.50"`, `decimal("-0.0")` -> `"0.0"`. */
export function decimalToString(value: Decimal): string {
  return digitsToString(value.coefficient, value.scale);
}

/** Strips trailing fractional zeros: 1.50 -> 1.5, 2.000 -> 2, 0.00 -> 0. */
export function normalizeDecimal(value: Decimal): Decimal {
  let { coefficient, scale } = value;
  if (coefficient === 0n) return scale === 0 ? value : DECIMAL_ZERO;
  while (scale > 0 && coefficient % 10n === 0n) {
    coefficient /= 10n;
    scale -= 1;
  }
  return scale === value.scale ? value : makeDecimal(coefficient, scale);
}

/**
 * Changes the scale, rounding with `mode` when digits are dropped (exact when digits are added).
 * @throws InvalidAmountError reason `"out-of-range"` for a scale outside `0..MAX_DECIMAL_SCALE`
 */
export function rescaleDecimal(value: Decimal, scale: number, mode: RoundingMode): Decimal {
  assertScale(scale);
  if (scale === value.scale) return value;
  if (scale > value.scale) {
    return makeDecimal(value.coefficient * pow10(scale - value.scale), scale);
  }
  return makeDecimal(divideAndRound(value.coefficient, pow10(value.scale - scale), mode), scale);
}

/** Coefficients of `a` and `b` brought to their common (larger) scale. */
function align(
  a: Decimal,
  b: Decimal,
): { readonly a: bigint; readonly b: bigint; readonly scale: number } {
  const scale = Math.max(a.scale, b.scale);
  return {
    a: a.coefficient * pow10(scale - a.scale),
    b: b.coefficient * pow10(scale - b.scale),
    scale,
  };
}

/** Exact `a + b`; scale = max(a.scale, b.scale). */
export function addDecimal(a: Decimal, b: Decimal): Decimal {
  const aligned = align(a, b);
  return makeDecimal(aligned.a + aligned.b, aligned.scale);
}

/** Exact `a - b`; scale = max(a.scale, b.scale). */
export function subtractDecimal(a: Decimal, b: Decimal): Decimal {
  const aligned = align(a, b);
  return makeDecimal(aligned.a - aligned.b, aligned.scale);
}

/**
 * Exact `a × b`; scale = a.scale + b.scale, normalized (trailing zeros stripped) if it exceeds
 * `MAX_DECIMAL_SCALE`.
 * @throws InvalidAmountError reason `"scale-overflow"` if the normalized scale still exceeds it
 */
export function multiplyDecimal(a: Decimal, b: Decimal): Decimal {
  const product = makeDecimal(a.coefficient * b.coefficient, a.scale + b.scale);
  if (product.scale <= MAX_DECIMAL_SCALE) return product;
  const normalized = normalizeDecimal(product);
  if (normalized.scale > MAX_DECIMAL_SCALE) {
    throw new InvalidAmountError(
      "scale-overflow",
      `Product needs more than ${MAX_DECIMAL_SCALE} decimals: rescale an operand first`,
    );
  }
  return normalized;
}

/**
 * `a / b` rounded with `mode` to `scale` fractional digits.
 * @throws DivisionByZeroError when `b` is zero
 * @throws InvalidAmountError reason `"out-of-range"` for a scale outside `0..MAX_DECIMAL_SCALE`
 */
export function divideDecimal(a: Decimal, b: Decimal, scale: number, mode: RoundingMode): Decimal {
  assertScale(scale);
  // a / b × 10^scale = (ca / cb) × 10^(b.scale - a.scale + scale)
  const k = b.scale - a.scale + scale;
  const numerator = k >= 0 ? a.coefficient * pow10(k) : a.coefficient;
  const denominator = k >= 0 ? b.coefficient : b.coefficient * pow10(-k);
  return makeDecimal(divideAndRound(numerator, denominator, mode), scale);
}

export function negateDecimal(value: Decimal): Decimal {
  return value.coefficient === 0n ? value : makeDecimal(-value.coefficient, value.scale);
}

export function absDecimal(value: Decimal): Decimal {
  return value.coefficient < 0n ? makeDecimal(-value.coefficient, value.scale) : value;
}

/** Compares by value: `-1` when a < b, `0` when equal (whatever the scales), `1` when a > b. */
export function compareDecimal(a: Decimal, b: Decimal): -1 | 0 | 1 {
  const aligned = align(a, b);
  return aligned.a < aligned.b ? -1 : aligned.a > aligned.b ? 1 : 0;
}

/** Equality by value: `decimal("1.5")` equals `decimal("1.50")`. */
export function decimalEquals(a: Decimal, b: Decimal): boolean {
  return compareDecimal(a, b) === 0;
}

export function isZeroDecimal(value: Decimal): boolean {
  return value.coefficient === 0n;
}

export function signDecimal(value: Decimal): -1 | 0 | 1 {
  return value.coefficient < 0n ? -1 : value.coefficient > 0n ? 1 : 0;
}
