import type { CurrencyCode } from "./currency";

/** Machine-readable category of every error thrown by `@fairhour/money`. */
export type MoneyErrorCode =
  "invalid-amount" | "invalid-currency" | "currency-mismatch" | "division-by-zero";

/**
 * Base class of every error thrown by `@fairhour/money`, so callers can tell domain errors apart
 * from programming errors with `instanceof MoneyError` and switch on `code`.
 *
 * Messages never contain the offending amount (it may be user data that ends up in logs): they
 * name the reason and, for syntax errors, the length of the input.
 */
export abstract class MoneyError extends Error {
  abstract readonly code: MoneyErrorCode;
}

/** Why an amount, decimal, ratio list or rate was rejected. */
export type InvalidAmountReason =
  /** Not a strict decimal string (`"1,5"`, `"1e3"`, `" 1"`, `"+1"`, ...). */
  | "syntax"
  /** More than `MAX_DECIMAL_DIGITS` digits, or a scale outside `0..MAX_DECIMAL_SCALE`. */
  | "out-of-range"
  /** More fractional digits than the currency's minor unit allows (`"1.235"` in EUR). */
  | "too-precise"
  /** A product whose scale still exceeds `MAX_DECIMAL_SCALE` after normalization. */
  | "scale-overflow"
  /** `allocate` with an empty ratio list. */
  | "no-ratios"
  /** `allocate` with a negative ratio. */
  | "negative-ratio"
  /** A conversion rate that is zero or negative. */
  | "non-positive-rate"
  /** A conversion to the same currency with a rate other than 1. */
  | "same-currency-rate";

/** An amount, decimal string, ratio list or rate is not acceptable. */
export class InvalidAmountError extends MoneyError {
  override readonly name = "InvalidAmountError";
  readonly code = "invalid-amount";
  readonly reason: InvalidAmountReason;

  constructor(reason: InvalidAmountReason, message: string) {
    super(message);
    this.reason = reason;
  }
}

/** A string is not an ISO 4217 code of the snapshot (codes are exact and upper case). */
export class InvalidCurrencyError extends MoneyError {
  override readonly name = "InvalidCurrencyError";
  readonly code = "invalid-currency";
  readonly value: string;

  constructor(value: string) {
    super(
      /^[A-Za-z]{3}$/.test(value)
        ? `Unknown ISO 4217 currency code "${value}" (codes are upper case, e.g. "EUR")`
        : `Invalid currency code (input length ${value.length}): expected an ISO 4217 code such as "EUR"`,
    );
    this.value = value;
  }
}

/** A binary operation received amounts in two different currencies. Convert explicitly first. */
export class CurrencyMismatchError extends MoneyError {
  override readonly name = "CurrencyMismatchError";
  readonly code = "currency-mismatch";
  readonly left: CurrencyCode;
  readonly right: CurrencyCode;

  constructor(left: CurrencyCode, right: CurrencyCode) {
    super(`Currency mismatch: ${left} and ${right} (convert with an explicit rate first)`);
    this.left = left;
    this.right = right;
  }
}

/** A division, allocation or rescaling by zero. */
export class DivisionByZeroError extends MoneyError {
  override readonly name = "DivisionByZeroError";
  readonly code = "division-by-zero";

  constructor(message = "Division by zero") {
    super(message);
  }
}
