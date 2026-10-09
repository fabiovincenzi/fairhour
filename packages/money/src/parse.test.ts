import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { currencyArb, decimalArb, isCorrectRounding, modeArb, moneyArb } from "../test/arbitraries";
import { minorUnitExponent } from "./currency";
import type { CurrencyCode } from "./currency";
import { decimal, decimalToString } from "./decimal";
import { InvalidAmountError, InvalidCurrencyError } from "./errors";
import { money } from "./money";
import { fromDecimal, parseMoney, toDecimal, toDecimalString } from "./parse";

const NINES_80 = "9".repeat(80);

/** Design test plan item 3. [input, currency, minor units or error reason] */
const CASES: readonly (readonly [string, CurrencyCode, bigint | string])[] = [
  ["0", "EUR", 0n],
  ["0.5", "EUR", 50n],
  ["1.230", "EUR", 123n],
  ["1.235", "EUR", "too-precise"],
  ["-0.50", "EUR", -50n],
  ["1234.56", "EUR", 123456n],
  ["-0", "EUR", 0n],
  [`${"9".repeat(78)}.99`, "EUR", 10n ** 80n - 1n],
  [`${"9".repeat(79)}.99`, "EUR", "out-of-range"],
  ["1,5", "EUR", "syntax"],
  ["€1.50", "EUR", "syntax"],
  ["0", "JPY", 0n],
  ["0.5", "JPY", "too-precise"],
  ["1234", "JPY", 1234n],
  ["1234.000", "JPY", 1234n],
  ["-1234", "JPY", -1234n],
  [NINES_80, "JPY", 10n ** 80n - 1n],
  [`${NINES_80}9`, "JPY", "out-of-range"],
  ["0", "KWD", 0n],
  ["0.5", "KWD", 500n],
  ["1.234", "KWD", 1234n],
  ["1.2340", "KWD", 1234n],
  ["1.2345", "KWD", "too-precise"],
  ["-0.001", "KWD", -1n],
  ["0", "CLF", 0n],
  ["0.5", "CLF", 5000n],
  ["1.23450", "CLF", 12345n],
  ["1.23456", "CLF", "too-precise"],
  [`${"9".repeat(76)}.9999`, "CLF", 10n ** 80n - 1n],
];

describe("parseMoney", () => {
  it.each(CASES)("%j in %s -> %s", (text, currency, expected) => {
    if (typeof expected === "bigint") {
      const value = parseMoney(text, currency);
      expect(value).toEqual(money(expected, currency));
      expect(Object.isFrozen(value)).toBe(true);
    } else {
      expect(() => parseMoney(text, currency)).toThrow(
        expect.objectContaining({ code: "invalid-amount", reason: expected }),
      );
    }
  });

  it("validates the currency and keeps amounts out of messages", () => {
    expect(() => parseMoney("1", "eur" as CurrencyCode)).toThrow(InvalidCurrencyError);
    try {
      parseMoney("1234.567", "EUR");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidAmountError);
      expect((error as Error).message).not.toContain("1234");
    }
  });
});

describe("toDecimalString", () => {
  it.each([
    [-50n, "EUR", "-0.50"],
    [5n, "EUR", "0.05"],
    [0n, "EUR", "0.00"],
    [123456n, "EUR", "1234.56"],
    [1234n, "JPY", "1234"],
    [-1234n, "JPY", "-1234"],
    [1234n, "KWD", "1.234"],
    [1n, "CLF", "0.0001"],
    [-123456789n, "CLF", "-12345.6789"],
    [10n ** 30n, "EUR", `1${"0".repeat(28)}.00`],
  ] as const)("%s %s -> %s", (amount, currency, expected) => {
    expect(toDecimalString(money(amount, currency))).toBe(expected);
  });
});

describe("toDecimal and fromDecimal", () => {
  it("converts to an exact decimal with the currency's scale", () => {
    const value = toDecimal(money(-1234n, "KWD"));
    expect([value.coefficient, value.scale]).toEqual([-1234n, 3]);
    expect(Object.isFrozen(value)).toBe(true);
    expect(decimalToString(toDecimal(money(5n, "EUR")))).toBe("0.05");
  });

  it.each([
    ["1.005", "EUR", "halfUp", 101n],
    ["1.005", "EUR", "halfEven", 100n],
    ["-1.005", "EUR", "halfUp", -101n],
    ["2.5", "JPY", "halfEven", 2n],
    ["2.5", "JPY", "halfUp", 3n],
    ["12", "KWD", "halfUp", 12000n],
    ["0.12345", "CLF", "down", 1234n],
  ] as const)("%s to %s with %s is %s", (text, currency, mode, expected) => {
    expect(fromDecimal(decimal(text), currency, mode)).toEqual(money(expected, currency));
  });

  it("rejects unknown currencies", () => {
    expect(() => fromDecimal(decimal("1"), "ABC" as CurrencyCode, "halfUp")).toThrow(
      InvalidCurrencyError,
    );
  });
});

describe("properties", () => {
  it("parseMoney(toDecimalString(m)) = m", () => {
    fc.assert(
      fc.property(moneyArb, (value) => {
        expect(parseMoney(toDecimalString(value), value.currency)).toEqual(value);
      }),
    );
  });

  it("toDecimalString has exactly the currency exponent's decimals", () => {
    fc.assert(
      fc.property(moneyArb, (value) => {
        const exponent = minorUnitExponent(value.currency);
        const fraction = toDecimalString(value).split(".")[1] ?? "";
        expect(fraction).toHaveLength(exponent);
      }),
    );
  });

  it("fromDecimal(toDecimal(m)) = m in every mode, and rounds arbitrary decimals correctly", () => {
    fc.assert(
      fc.property(moneyArb, decimalArb, currencyArb, modeArb, (value, raw, currency, mode) => {
        expect(fromDecimal(toDecimal(value), value.currency, mode)).toEqual(value);
        const rounded = fromDecimal(raw, currency, mode);
        const k = minorUnitExponent(currency) - raw.scale;
        return isCorrectRounding(
          rounded.amount,
          raw.coefficient * 10n ** BigInt(Math.max(k, 0)),
          10n ** BigInt(Math.max(-k, 0)),
          mode,
        );
      }),
    );
  });
});
