import { type CurrencyCode, type Decimal, type Price, convertPrice } from "@fairhour/money";
import { RateCurrencyMismatchError } from "./errors";

export type RateSource = "task" | "project" | "client" | "workspace";

/** An explicit exchange rate: `rate` units of the target currency per 1 unit of `from`. */
export interface RateExchange {
  readonly from: CurrencyCode;
  readonly rate: Decimal;
}

export interface RateLevels {
  /** Hourly rate set on the task, project and client; absent (or `null`, as stored) means "not set". */
  readonly task?: Price | null | undefined;
  readonly project?: Price | null | undefined;
  readonly client?: Price | null | undefined;
  /** The workspace default: always there, so a rate can always be resolved. */
  readonly workspace: Price;
  /**
   * The currency the rate must be in (the client's currency). When omitted the winning rate is
   * returned in its own currency. When given and the winning rate is in another currency, an
   * entry of `exchangeRates` for that currency converts it; without one the call throws.
   */
  readonly currency?: CurrencyCode;
  readonly exchangeRates?: readonly RateExchange[];
}

export interface ResolvedRate {
  /** The rate to bill with, in `currency` when one was requested. */
  readonly rate: Price;
  /** The level the rate was configured at. */
  readonly source: RateSource;
  /** Set when the configured rate had to be converted: the rate as configured and the exchange rate used. */
  readonly converted?: { readonly from: Price; readonly exchangeRate: Decimal };
}

/**
 * Resolves the hourly rate: task, then project, then client, then the workspace default; levels
 * that are not set are skipped. A rate of zero is a real rate (pro bono work), not "not set".
 *
 * Currencies are never mixed silently: when `currency` is given and the winning rate is in
 * another one, the matching `exchangeRates` entry converts it exactly (`convertPrice`: the result
 * keeps every decimal, so rescale it where a document limits them); otherwise the call throws.
 * @throws RateCurrencyMismatchError, InvalidAmountError (a non-positive exchange rate)
 */
export function resolveRate(levels: RateLevels): ResolvedRate {
  const ordered = [
    ["task", levels.task],
    ["project", levels.project],
    ["client", levels.client],
  ] as const;
  let source: RateSource = "workspace";
  let rate = levels.workspace;
  for (const [level, candidate] of ordered) {
    if (candidate !== null && candidate !== undefined) {
      source = level;
      rate = candidate;
      break;
    }
  }

  const { currency } = levels;
  if (currency === undefined || rate.currency === currency) return { rate, source };
  const exchange = levels.exchangeRates?.find((entry) => entry.from === rate.currency);
  if (exchange === undefined) throw new RateCurrencyMismatchError(rate.currency, currency);
  return {
    rate: convertPrice(rate, currency, exchange.rate),
    source,
    converted: { from: rate, exchangeRate: exchange.rate },
  };
}
