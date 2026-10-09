import { describe, expect, it } from "vitest";

import {
  CURRENCY_CODES,
  assertCurrencyCode,
  currencyInfo,
  isCurrencyCode,
  minorUnitExponent,
} from "./currency";
import type { CurrencyCode } from "./currency";
import { InvalidCurrencyError } from "./errors";

/** The rows the design (section 3.2) requires, with exactly these values. */
const MANDATORY: readonly (readonly [CurrencyCode, string, number])[] = [
  ["EUR", "978", 2],
  ["USD", "840", 2],
  ["GBP", "826", 2],
  ["CHF", "756", 2],
  ["JPY", "392", 0],
  ["SEK", "752", 2],
  ["NOK", "578", 2],
  ["PLN", "985", 2],
  ["CZK", "203", 2],
  ["HUF", "348", 2],
  ["RON", "946", 2],
  ["BGN", "975", 2],
  ["CAD", "124", 2],
  ["DKK", "208", 2],
  ["AUD", "036", 2],
  ["NZD", "554", 2],
  ["BRL", "986", 2],
  ["MXN", "484", 2],
  ["INR", "356", 2],
  ["CNY", "156", 2],
  ["KRW", "410", 0],
  ["ZAR", "710", 2],
  ["TRY", "949", 2],
  ["KWD", "414", 3],
  ["BHD", "048", 3],
  ["TND", "788", 3],
  ["ISK", "352", 0],
  ["CLP", "152", 0],
];

/** Every code whose exponent is not 2, as a complete list. */
const NOT_TWO: Readonly<Record<0 | 3 | 4, readonly string[]>> = {
  0: [
    "BIF",
    "CLP",
    "DJF",
    "GNF",
    "ISK",
    "JPY",
    "KMF",
    "KRW",
    "PYG",
    "RWF",
    "UGX",
    "UYI",
    "VND",
    "VUV",
    "XAF",
    "XOF",
    "XPF",
  ],
  3: ["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"],
  4: ["CLF", "UYW"],
};

describe("currency table", () => {
  it.each(MANDATORY)("%s has numeric %s and exponent %i", (code, numeric, exponent) => {
    const info = currencyInfo(code);
    expect(info.code).toBe(code);
    expect(info.numeric).toBe(numeric);
    expect(info.exponent).toBe(exponent);
    expect(minorUnitExponent(code)).toBe(exponent);
  });

  it("lists every code whose exponent is not 2, and nothing else", () => {
    for (const exponent of [0, 3, 4] as const) {
      expect(CURRENCY_CODES.filter((code) => minorUnitExponent(code) === exponent)).toEqual(
        NOT_TWO[exponent],
      );
    }
    const others = CURRENCY_CODES.filter((code) => minorUnitExponent(code) !== 2);
    expect(others).toHaveLength(NOT_TWO[0].length + NOT_TWO[3].length + NOT_TWO[4].length);
  });

  it("excludes precious metals, units of account without minor unit and test codes", () => {
    const excluded = ["XAU", "XAG", "XPD", "XPT", "XBA", "XBB", "XBC", "XBD"];
    excluded.push("XDR", "XSU", "XUA", "XTS", "XXX");
    for (const code of excluded) expect(isCurrencyCode(code)).toBe(false);
  });

  it("is sorted, unique, frozen and well formed", () => {
    expect(CURRENCY_CODES.length).toBe(166);
    expect([...CURRENCY_CODES].sort()).toEqual(CURRENCY_CODES);
    expect(new Set(CURRENCY_CODES).size).toBe(CURRENCY_CODES.length);
    expect(Object.isFrozen(CURRENCY_CODES)).toBe(true);
    const numerics = new Set<string>();
    for (const code of CURRENCY_CODES) {
      const info = currencyInfo(code);
      expect(code).toMatch(/^[A-Z]{3}$/);
      expect(info.numeric).toMatch(/^\d{3}$/);
      expect(info.name.trim()).toBe(info.name);
      expect(info.name.length).toBeGreaterThan(0);
      expect(Object.isFrozen(info)).toBe(true);
      expect(Object.keys(info)).toEqual(["code", "numeric", "exponent", "name"]);
      numerics.add(info.numeric);
    }
    // Numeric codes are unique except for currencies sharing one (none in this snapshot).
    expect(numerics.size).toBe(CURRENCY_CODES.length);
  });

  it("returns the same frozen info object every time", () => {
    expect(currencyInfo("EUR")).toBe(currencyInfo("EUR"));
    expect(currencyInfo("EUR").name).toBe("Euro");
  });
});

describe("guards", () => {
  it.each(["EUR", "JPY", "KWD", "CLF", "BGN", "XCG", "ZWG"])("accepts %s", (code) => {
    expect(isCurrencyCode(code)).toBe(true);
    expect(assertCurrencyCode(code)).toBe(code);
  });

  it.each(["eur", "Eur", " EUR", "EUR ", "", "EURO", "€", "XXX", "HRK", "toString", "__proto__"])(
    "rejects %j",
    (value) => {
      expect(isCurrencyCode(value)).toBe(false);
      expect(() => assertCurrencyCode(value)).toThrow(InvalidCurrencyError);
    },
  );

  it("rejects non-strings from untyped callers", () => {
    const value = 978 as unknown as string;
    expect(isCurrencyCode(value)).toBe(false);
    expect(() => assertCurrencyCode(value)).toThrow(
      expect.objectContaining({ code: "invalid-currency", value: "<number>" }),
    );
  });

  it("currencyInfo and minorUnitExponent throw for unknown codes from untyped callers", () => {
    expect(() => currencyInfo("ABC" as CurrencyCode)).toThrow(InvalidCurrencyError);
    expect(() => minorUnitExponent("eur" as CurrencyCode)).toThrow(InvalidCurrencyError);
  });
});
