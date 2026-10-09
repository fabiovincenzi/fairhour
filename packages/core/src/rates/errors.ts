import type { CurrencyCode } from "@fairhour/money";
import { CoreError } from "../errors";
import type { RateUnit } from "./unit";

/**
 * A rate (or a fixed amount) is in another currency than the one requested and no exchange rate
 * for it was provided (mixing currencies without an explicit rate is an error, CORE-005).
 */
export class RateCurrencyMismatchError extends CoreError {
  override readonly name = "RateCurrencyMismatchError";
  readonly code = "rate-currency-mismatch";
  readonly from: CurrencyCode;
  readonly to: CurrencyCode;

  constructor(from: CurrencyCode, to: CurrencyCode) {
    super(`No exchange rate from ${from} to ${to}`);
    this.from = from;
    this.to = to;
  }
}

/**
 * No rate per `unit` is set at any level, or the rate given for billing is per the other unit. A
 * day rate is never used as an hourly rate, nor the other way round.
 */
export class MissingRateError extends CoreError {
  override readonly name = "MissingRateError";
  readonly code = "missing-rate";
  readonly unit: RateUnit;

  constructor(unit: RateUnit) {
    super(
      `No rate per ${unit} is set (a rate per ${unit === "hour" ? "day" : "hour"} does not apply)`,
    );
    this.unit = unit;
  }
}

/** Two exchange rates for the same currency: which one is meant is not for the code to guess. */
export class DuplicateExchangeRateError extends CoreError {
  override readonly name = "DuplicateExchangeRateError";
  readonly code = "duplicate-exchange-rate";
  readonly currency: CurrencyCode;

  constructor(currency: CurrencyCode) {
    super(`More than one exchange rate from ${currency}`);
    this.currency = currency;
  }
}
