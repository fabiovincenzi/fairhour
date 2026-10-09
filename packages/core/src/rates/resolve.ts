import { type CurrencyCode, type Decimal, type Price, convertPrice } from "@fairhour/money";
import { DuplicateExchangeRateError, MissingRateError, RateCurrencyMismatchError } from "./errors";
import type { RateUnit, UnitRate } from "./unit";

export type RateSource = "task" | "project" | "client" | "workspace";

/** An explicit exchange rate: `rate` units of the target currency per 1 unit of `from`. */
export interface RateExchange {
  readonly from: CurrencyCode;
  readonly rate: Decimal;
}

export interface RateLevels {
  /**
   * The unit to resolve: `hour` for hourly billing, `day` for day-rate billing. Only levels whose
   * rate is per this unit count; a rate per the other unit is skipped, never converted or reused.
   */
  readonly unit: RateUnit;
  /** The rate set on the task, project and client; absent (or `null`, as stored) means "not set". */
  readonly task?: UnitRate | null | undefined;
  readonly project?: UnitRate | null | undefined;
  readonly client?: UnitRate | null | undefined;
  /** The workspace default. */
  readonly workspace: UnitRate;
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
  /** What `rate` is per: the unit that was asked for. */
  readonly unit: RateUnit;
  /** The level the rate was configured at. */
  readonly source: RateSource;
  /** Set when the configured rate had to be converted: the rate as configured and the exchange rate used. */
  readonly converted?: { readonly from: Price; readonly exchangeRate: Decimal };
}

function assertDistinctCurrencies(exchangeRates: readonly RateExchange[]): void {
  const seen = new Set<CurrencyCode>();
  for (const { from } of exchangeRates) {
    if (seen.has(from)) throw new DuplicateExchangeRateError(from);
    seen.add(from);
  }
}

/** The first level, in priority order, with a rate per `levels.unit`. */
function winningRate(levels: RateLevels): { source: RateSource; rate: Price } {
  const ordered = [
    ["task", levels.task],
    ["project", levels.project],
    ["client", levels.client],
    ["workspace", levels.workspace],
  ] as const;
  for (const [source, candidate] of ordered) {
    if (candidate?.unit === levels.unit) return { source, rate: candidate.price };
  }
  throw new MissingRateError(levels.unit);
}

/**
 * Resolves the rate per `levels.unit`: task, then project, then client, then the workspace
 * default; levels that are not set, or whose rate is per the other unit, are skipped. A rate of
 * zero is a real rate (pro bono work), not "not set".
 *
 * An hourly rate and a day rate are never mixed: if no level has a rate per the requested unit
 * the call throws, instead of billing days at the hourly rate (or the reverse).
 *
 * Currencies are never mixed silently: when `currency` is given and the winning rate is in
 * another one, the matching `exchangeRates` entry converts it exactly (`convertPrice`: the result
 * keeps every decimal, so rescale it where a document limits them); otherwise the call throws.
 * @throws MissingRateError, RateCurrencyMismatchError, DuplicateExchangeRateError (two exchange
 *         rates for one currency), InvalidAmountError (a non-positive exchange rate)
 */
export function resolveRate(levels: RateLevels): ResolvedRate {
  const { unit, currency, exchangeRates = [] } = levels;
  assertDistinctCurrencies(exchangeRates);
  const { source, rate } = winningRate(levels);
  if (currency === undefined || rate.currency === currency) return { rate, unit, source };
  const exchange = exchangeRates.find((entry) => entry.from === rate.currency);
  if (exchange === undefined) throw new RateCurrencyMismatchError(rate.currency, currency);
  return {
    rate: convertPrice(rate, currency, exchange.rate),
    unit,
    source,
    converted: { from: rate, exchangeRate: exchange.rate },
  };
}
