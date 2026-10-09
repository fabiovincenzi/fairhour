import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { currencyArb, decimalArb, isCorrectRounding, modeArb, moneyIn } from "../test/arbitraries";
import { minorUnitExponent } from "./currency";
import type { CurrencyCode } from "./currency";
import { decimal, decimalToString } from "./decimal";
import { InvalidAmountError, InvalidCurrencyError } from "./errors";
import { money } from "./money";
import { parseMoney, toDecimalString } from "./parse";
import { convertPrice, extend, isPrice, price, priceFromMoney } from "./price";
import { ROUNDING_MODES } from "./rounding";

const d = decimal;

describe("price", () => {
  it("keeps sub-minor-unit precision and the given scale", () => {
    const value = price("0.4253", "EUR");
    expect(decimalToString(value.amount)).toBe("0.4253");
    expect(value.currency).toBe("EUR");
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.keys(value)).toEqual(["amount", "currency"]);
    expect(decimalToString(price("50", "EUR").amount)).toBe("50");
  });

  it("rejects invalid amounts and currencies", () => {
    expect(() => price("0,4253", "EUR")).toThrow(InvalidAmountError);
    expect(() => price("1", "eur" as CurrencyCode)).toThrow(InvalidCurrencyError);
  });

  it("converts a Money exactly", () => {
    const value = priceFromMoney(money(-1234n, "KWD"));
    expect(decimalToString(value.amount)).toBe("-1.234");
    expect(priceFromMoney(money(1234n, "JPY")).amount.scale).toBe(0);
  });

  it("recognizes prices structurally", () => {
    expect(isPrice(price("1.5", "USD"))).toBe(true);
    for (const value of [
      null,
      "1.5",
      { amount: "1.5", currency: "USD" },
      { amount: d("1.5"), currency: "usd" },
      { amount: d("1.5"), currency: 840 },
      { amount: d("1.5") },
      { currency: "USD" },
      money(150n, "USD"),
    ]) {
      expect(isPrice(value)).toBe(false);
    }
  });
});

describe("extend", () => {
  it.each([
    // 123.45 km at €0.4253 = 52.502785 -> €52.50
    ["0.4253", "EUR", "123.45", "halfUp", "52.50"],
    // 7.5 h at €60 = 450.00
    ["60", "EUR", "7.5", "halfUp", "450.00"],
    // 1.25 h at €50.10 = 62.625: a tie in cents
    ["50.10", "EUR", "1.25", "halfUp", "62.63"],
    ["50.10", "EUR", "1.25", "halfEven", "62.62"],
    ["50.10", "EUR", "1.25", "halfDown", "62.62"],
    ["50.10", "EUR", "1.25", "down", "62.62"],
    // A FatturaPA unit price with 8 decimals
    ["0.12345678", "EUR", "1000", "halfUp", "123.46"],
    ["1500", "JPY", "0.5", "halfEven", "750"],
    ["1500.5", "JPY", "3", "halfUp", "4502"],
    ["0.4253", "KWD", "2", "halfUp", "0.851"],
    ["-10.005", "EUR", "1", "halfUp", "-10.01"],
    ["-10.005", "EUR", "1", "ceiling", "-10.00"],
  ] as const)("%s %s × %s with %s = %s", (unit, currency, quantity, mode, expected) => {
    const total = extend(price(unit, currency), d(quantity), mode);
    expect(total.currency).toBe(currency);
    expect(toDecimalString(total)).toBe(expected);
    expect(Object.isFrozen(total)).toBe(true);
  });

  it("rounds the exact product once, correctly, in every mode", () => {
    fc.assert(
      fc.property(
        currencyArb,
        decimalArb,
        decimalArb,
        modeArb,
        (currency, unit, quantity, mode) => {
          const total = extend({ amount: unit, currency }, quantity, mode);
          const k = minorUnitExponent(currency) - unit.scale - quantity.scale;
          const numerator = unit.coefficient * quantity.coefficient * 10n ** BigInt(Math.max(k, 0));
          const denominator = 10n ** BigInt(Math.max(-k, 0));
          return isCorrectRounding(total.amount, numerator, denominator, mode);
        },
      ),
    );
  });

  it("extending a Money price by 1 gives the Money back", () => {
    fc.assert(
      fc.property(currencyArb.chain(moneyIn), (value) => {
        for (const mode of ROUNDING_MODES) {
          expect(extend(priceFromMoney(value), d("1"), mode)).toEqual(value);
        }
      }),
    );
  });
});

describe("convertPrice", () => {
  it("converts exactly, without rounding", () => {
    const converted = convertPrice(price("0.4253", "EUR"), "JPY", d("161.25"));
    expect(converted.currency).toBe("JPY");
    expect(decimalToString(converted.amount)).toBe("68.579625");
    expect(Object.isFrozen(converted)).toBe(true);
  });

  it("follows the same rules as convert", () => {
    const value = price("10", "EUR");
    expect(convertPrice(value, "EUR", d("1.0"))).toBe(value);
    expect(() => convertPrice(value, "EUR", d("2"))).toThrow(
      expect.objectContaining({ reason: "same-currency-rate" }),
    );
    expect(() => convertPrice(value, "USD", d("0"))).toThrow(
      expect.objectContaining({ reason: "non-positive-rate" }),
    );
    expect(() => convertPrice(value, "XYZ" as CurrencyCode, d("1"))).toThrow(InvalidCurrencyError);
  });

  it("agrees with convert when the price is a Money", () => {
    const value = parseMoney("12.34", "EUR");
    const rate = d("161.25");
    const viaPrice = extend(convertPrice(priceFromMoney(value), "JPY", rate), d("1"), "halfUp");
    expect(toDecimalString(viaPrice)).toBe("1990");
  });
});
