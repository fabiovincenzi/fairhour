import { describe, expect, it } from "vitest";
import { COUNTRY_CODES_DATA } from "./countries.data";
import { InvalidInputError, InvalidIsoDateError } from "./errors";
import {
  RULE_ID_PATTERN,
  addDays,
  compareIsoDate,
  countryCode,
  daysBetweenInclusive,
  isCountryCode,
  isIsoDate,
  isJsonValue,
  isoDate,
  yearOf,
} from "./primitives";

describe("isoDate", () => {
  it.each([
    ["2026-10-09", true],
    ["1900-01-01", true],
    ["9999-12-31", true],
    ["2024-02-29", true], // leap year
    ["2000-02-29", true], // divisible by 400
    ["1900-02-29", false], // divisible by 100, not 400
    ["2023-02-29", false],
    ["2023-04-31", false],
    ["2023-06-30", true],
    ["2023-13-01", false],
    ["2023-00-10", false],
    ["2023-01-00", false],
    ["1899-12-31", false],
    ["2023-1-01", false],
    ["2023-01-01T00:00:00Z", false],
    [" 2023-01-01", false],
    ["", false],
    ["20230101", false],
  ])("%s -> %s", (value, valid) => {
    expect(isIsoDate(value)).toBe(valid);
    if (valid) expect(isoDate(value)).toBe(value);
    else expect(() => isoDate(value)).toThrow(InvalidIsoDateError);
  });

  it("rejects non-strings at runtime", () => {
    expect(isIsoDate(20230101 as unknown as string)).toBe(false);
    expect(() => isoDate(null as unknown as string)).toThrow(/got "null"/);
  });

  it("compares chronologically", () => {
    expect(compareIsoDate(isoDate("2023-01-01"), isoDate("2023-01-02"))).toBe(-1);
    expect(compareIsoDate(isoDate("2023-12-31"), isoDate("2023-01-02"))).toBe(1);
    expect(compareIsoDate(isoDate("2023-05-05"), isoDate("2023-05-05"))).toBe(0);
  });
});

describe("calendar arithmetic", () => {
  it.each([
    ["2024-02-28", 1, "2024-02-29"],
    ["2024-02-29", 1, "2024-03-01"],
    ["2023-02-28", 1, "2023-03-01"],
    ["2023-12-31", 1, "2024-01-01"],
    ["2024-01-01", -1, "2023-12-31"],
    ["2024-03-01", -1, "2024-02-29"],
    ["2023-01-31", 30, "2023-03-02"],
    ["2023-05-10", 0, "2023-05-10"],
    ["2023-01-01", 365, "2024-01-01"],
    ["2024-01-01", 366, "2025-01-01"],
    ["1900-03-01", -1, "1900-02-28"],
  ])("addDays(%s, %i) = %s", (date, days, expected) => {
    expect(addDays(isoDate(date), days)).toBe(expected);
  });

  it("refuses results outside 1900..9999 and non-integer offsets", () => {
    expect(() => addDays(isoDate("1900-01-01"), -1)).toThrow(InvalidIsoDateError);
    expect(() => addDays(isoDate("9999-12-31"), 1)).toThrow(InvalidIsoDateError);
    expect(() => addDays(isoDate("2023-01-01"), 1.5)).toThrow(RangeError);
    expect(() => addDays(isoDate("2023-01-01"), Number.MAX_SAFE_INTEGER)).toThrow(
      InvalidIsoDateError,
    );
  });

  it("rejects an invalid date given as IsoDate", () => {
    expect(() => addDays("2023-02-30" as ReturnType<typeof isoDate>, 1)).toThrow(
      InvalidIsoDateError,
    );
  });

  it.each([
    ["2023-01-01", "2023-12-31", 365],
    ["2024-01-01", "2024-12-31", 366],
    ["2023-03-01", "2023-12-31", 306], // the forfettario first-year example
    ["2023-05-05", "2023-05-05", 1],
    ["2023-05-06", "2023-05-05", 0],
    ["2023-05-10", "2023-05-05", 0],
  ])("daysBetweenInclusive(%s, %s) = %i", (from, to, days) => {
    expect(daysBetweenInclusive(isoDate(from), isoDate(to))).toBe(days);
  });

  it("gives the year", () => {
    expect(yearOf(isoDate("2026-10-09"))).toBe(2026);
    expect(yearOf(isoDate("1900-01-01"))).toBe(1900);
  });
});

describe("country codes", () => {
  it("has the 249 assigned ISO 3166-1 codes, sorted and unique", () => {
    expect(COUNTRY_CODES_DATA).toHaveLength(249);
    expect(new Set(COUNTRY_CODES_DATA).size).toBe(249);
    expect([...COUNTRY_CODES_DATA].sort()).toEqual([...COUNTRY_CODES_DATA]);
  });

  it.each([
    ["IT", true],
    ["US", true],
    ["GB", true],
    ["AQ", true],
    ["SS", true],
    ["it", false],
    ["UK", false], // exceptionally reserved, not assigned
    ["EU", false],
    ["EL", false],
    ["XK", false], // user-assigned
    ["ZZ", false],
    ["ITA", false],
    ["", false],
  ])("%s -> %s", (value, valid) => {
    expect(isCountryCode(value)).toBe(valid);
    if (valid) expect(countryCode(value)).toBe(value);
    else expect(() => countryCode(value)).toThrow(InvalidInputError);
  });

  it("reports the invalid-country issue code", () => {
    try {
      countryCode("XX");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidInputError);
      expect((error as InvalidInputError).issues.map((issue) => issue.code)).toEqual([
        "invalid-country",
      ]);
    }
  });

  it("is false for non-strings", () => {
    expect(isCountryCode(42 as unknown as string)).toBe(false);
  });
});

describe("RULE_ID_PATTERN", () => {
  it.each([
    ["it.ordinario.vat", true],
    ["it.common.inps-rivalsa", true],
    ["generic.tax", true],
    ["xx.a1.b-2-c", true],
    ["tax-pack.rule", true],
    ["it", false],
    ["It.vat", false],
    ["it..vat", false],
    ["it.vat.", false],
    ["it.-vat", false],
    ["it.vat-", false],
    ["it.Vat", false],
    ["1t.vat", false],
  ])("%s -> %s", (id, valid) => {
    expect(RULE_ID_PATTERN.test(id)).toBe(valid);
  });
});

describe("isJsonValue", () => {
  it.each([
    ["a string", "x", true],
    ["a number", 1.5, true],
    ["a boolean", false, true],
    ["null", null, true],
    ["nested data", { a: [1, "b", { c: null }] }, true],
    ["a null-prototype object", Object.assign(Object.create(null) as object, { a: 1 }), true],
    ["NaN", Number.NaN, false],
    ["Infinity", Number.POSITIVE_INFINITY, false],
    ["undefined", undefined, false],
    ["a bigint", 1n, false],
    ["a function", () => 1, false],
    ["a symbol", Symbol("x"), false],
    ["a Date", new Date(0), false],
    ["a Map", new Map(), false],
    ["an object with undefined", { a: undefined }, false],
    ["an array with a bigint", [1n], false],
  ])("%s -> %s", (_label, value, valid) => {
    expect(isJsonValue(value)).toBe(valid);
  });
});
