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
    for (const name of ["makeMoney", "makeDecimal", "pow10", "exactParts", "fallbackParts"]) {
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

  it("works end to end: 22 % VAT on 7.5 h at €60", () => {
    const net = api.extend(api.price("60", "EUR"), api.decimal("7.5"), "halfUp");
    const vat = api.percentage(net, api.decimal("22"), "halfUp");
    const total = api.add(net, vat);
    expect(api.toDecimalString(total)).toBe("549.00");
    expect(api.moneyToJson(total)).toEqual({ amount: "549.00", currency: "EUR" });
    expect(api.formatMoney(total, "en-US")).toBe("€549.00");
  });
});
