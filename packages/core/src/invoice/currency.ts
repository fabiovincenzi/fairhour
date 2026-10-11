import {
  type CurrencyCode,
  type Price,
  convertPrice,
  decimalToString,
  price as makePrice,
  rescaleDecimal,
} from "@fairhour/money";
import { type ExchangeRecord, MAX_INPUT_SCALE } from "@fairhour/tax-core";
import { DuplicateExchangeRateError } from "../rates/errors";
import { DraftError } from "./errors";
import type { DraftAdjustment } from "./types";

export interface ConvertedPrice {
  readonly price: Price;
  /** Set when the price had to be converted. */
  readonly adjustment?: DraftAdjustment;
}

export interface Converter {
  /**
   * `price` in the invoice currency: as it is when it already is, converted with the explicit
   * exchange rate for its currency otherwise. The exact product is rescaled to the 8 decimals
   * an invoice line takes, half up.
   * @throws DraftError `missing-exchange-rate`
   */
  convert(price: Price, lineId: string): ConvertedPrice;
  /** The exchange rates that were needed, in the order they were given. */
  used(): readonly ExchangeRecord[];
}

/**
 * Converts prices to `currency` with explicit exchange rates only: nothing is looked up or
 * assumed, so a price in another currency without a rate is an error.
 * @throws DuplicateExchangeRateError when two rates are given for one currency
 */
export function createConverter(
  currency: CurrencyCode,
  exchangeRates: readonly ExchangeRecord[],
): Converter {
  const byCurrency = new Map<CurrencyCode, ExchangeRecord>();
  for (const record of exchangeRates) {
    if (byCurrency.has(record.from)) throw new DuplicateExchangeRateError(record.from);
    byCurrency.set(record.from, record);
  }
  const needed = new Set<CurrencyCode>();
  return {
    convert(price, lineId) {
      if (price.currency === currency) return { price };
      const record = byCurrency.get(price.currency);
      if (record === undefined) throw new DraftError("missing-exchange-rate", price.currency);
      needed.add(record.from);
      const exact = convertPrice(price, currency, record.rate);
      const converted = makePrice(
        decimalToString(
          exact.amount.scale > MAX_INPUT_SCALE
            ? rescaleDecimal(exact.amount, MAX_INPUT_SCALE, "halfUp")
            : exact.amount,
        ),
        currency,
      );
      return {
        price: converted,
        adjustment: { kind: "price-converted", lineId, from: price, to: converted },
      };
    },
    used: () => exchangeRates.filter((record) => needed.has(record.from)),
  };
}
