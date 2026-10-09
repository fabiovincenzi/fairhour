import type { CurrencyCode } from "@fairhour/money";
import { CoreError } from "../errors";

/**
 * A rate is in another currency than the one requested and no exchange rate for it was provided
 * (mixing currencies without an explicit rate is an error, CORE-005).
 */
export class RateCurrencyMismatchError extends CoreError {
  readonly code = "rate-currency-mismatch";
  readonly from: CurrencyCode;
  readonly to: CurrencyCode;

  constructor(from: CurrencyCode, to: CurrencyCode) {
    super(`No exchange rate from ${from} to ${to}`);
    this.from = from;
    this.to = to;
  }
}
