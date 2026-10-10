import { describe, expect, it } from "vitest";

import * as api from "./index";
import * as zodApi from "./zod";

describe("public API", () => {
  it("exports exactly the documented runtime values (design section 3)", () => {
    expect(Object.keys(api).sort()).toEqual(
      [
        // errors
        "CurrencyMismatchError",
        "DivisionByZeroError",
        "InvalidAmountError",
        "InvalidCurrencyError",
        "MoneyError",
        // currency
        "CURRENCY_CODES",
        "assertCurrencyCode",
        "currencyInfo",
        "isCurrencyCode",
        "minorUnitExponent",
        // rounding
        "ROUNDING_MODES",
        "divideAndRound",
        "isRoundingMode",
        // decimal
        "DECIMAL_HUNDRED",
        "DECIMAL_ONE",
        "DECIMAL_ZERO",
        "MAX_DECIMAL_DIGITS",
        "MAX_DECIMAL_SCALE",
        "absDecimal",
        "addDecimal",
        "compareDecimal",
        "decimal",
        "decimalEquals",
        "decimalFromInteger",
        "decimalToString",
        "divideDecimal",
        "isDecimal",
        "isDecimalString",
        "isZeroDecimal",
        "multiplyDecimal",
        "negateDecimal",
        "normalizeDecimal",
        "rescaleDecimal",
        "signDecimal",
        "subtractDecimal",
        "tryDecimal",
        // money
        "abs",
        "add",
        "compare",
        "equals",
        "greaterThan",
        "greaterThanOrEqual",
        "isMoney",
        "isNegative",
        "isPositive",
        "isZero",
        "lessThan",
        "lessThanOrEqual",
        "max",
        "min",
        "money",
        "multiplyByInteger",
        "negate",
        "subtract",
        "sum",
        "zero",
        // arithmetic
        "allocate",
        "convert",
        "divide",
        "multiply",
        "percentage",
        // price
        "convertPrice",
        "extend",
        "isPrice",
        "price",
        "priceFromMoney",
        // parse
        "fromDecimal",
        "parseMoney",
        "toDecimal",
        "toDecimalString",
        // format
        "formatDecimal",
        "formatMoney",
        "formatMoneyToParts",
        "formatPercent",
        "formatPrice",
        "supportsExactStringFormatting",
        // json
        "moneyFromJson",
        "moneyToJson",
        "priceFromJson",
        "priceToJson",
      ].sort(),
    );
  });

  it("keeps internals out of the entry point", () => {
    for (const name of [
      "makeMoney",
      "makeDecimal",
      "pow10",
      "encodeDigits",
      "shiftAndRound",
      "assertRoundingMode",
      "exactParts",
      "fallbackParts",
      "pluralProxy",
    ]) {
      expect(name in api).toBe(false);
    }
  });

  it("exports the zod schemas from the zod entry point only", () => {
    expect(Object.keys(zodApi).sort()).toEqual([
      "currencyCodeSchema",
      "decimalSchema",
      "decimalStringSchema",
      "moneyJsonSchema",
      "moneyStringSchema",
      "priceJsonSchema",
    ]);
    expect("moneyJsonSchema" in api).toBe(false);
  });

  describe("rejects an unknown rounding mode in every function that takes one", () => {
    const eur = api.money(1234n, "EUR");
    const d = api.decimal;
    // Each call needs no rounding with a valid mode: the mode must be checked anyway.
    const CALLS: readonly (readonly [string, (mode: api.RoundingMode) => unknown])[] = [
      ["divideAndRound", (mode) => api.divideAndRound(4n, 2n, mode)],
      ["rescaleDecimal, same scale", (mode) => api.rescaleDecimal(d("1.50"), 2, mode)],
      ["rescaleDecimal, more digits", (mode) => api.rescaleDecimal(d("1.5"), 4, mode)],
      ["divideDecimal", (mode) => api.divideDecimal(d("4"), d("2"), 0, mode)],
      ["multiply", (mode) => api.multiply(eur, d("2"), mode)],
      ["percentage", (mode) => api.percentage(eur, d("100"), mode)],
      ["divide", (mode) => api.divide(eur, d("1"), mode)],
      ["convert, same currency", (mode) => api.convert(eur, "EUR", d("1"), mode)],
      ["convert, more digits", (mode) => api.convert(api.money(5n, "JPY"), "EUR", d("2"), mode)],
      ["extend", (mode) => api.extend(api.price("60", "EUR"), d("7.5"), mode)],
      ["fromDecimal", (mode) => api.fromDecimal(d("1.00"), "EUR", mode)],
    ];
    const BAD_MODES: readonly unknown[] = ["bogus", "HALF_UP", "halfup", "", undefined, null, 1];

    it.each(CALLS)("%s", (_name, call) => {
      for (const mode of api.ROUNDING_MODES) expect(() => call(mode)).not.toThrow();
      for (const mode of BAD_MODES) {
        expect(() => call(mode as api.RoundingMode), String(mode)).toThrow(TypeError);
      }
    });
  });

  it("works end to end: 22 % VAT on 7.5 h at €60", () => {
    const net = api.extend(api.price("60", "EUR"), api.decimal("7.5"), "halfUp");
    const vat = api.percentage(net, api.decimal("22"), "halfUp");
    const total = api.add(net, vat);
    expect(api.toDecimalString(total)).toBe("549.00");
    expect(api.moneyToJson(total)).toEqual({ amount: "549.00", currency: "EUR" });
    expect(api.formatMoney(total, "en-US")).toBe("€549.00");
  });
});
