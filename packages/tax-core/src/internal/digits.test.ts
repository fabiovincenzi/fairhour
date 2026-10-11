import { describe, expect, it } from "vitest";
import { digitsToInteger } from "./digits";

describe("digitsToInteger", () => {
  it.each([
    ["0", 0],
    ["7", 7],
    ["0042", 42],
    ["2024", 2024],
    ["9007199254740991", Number.MAX_SAFE_INTEGER],
  ])("reads %j as %d", (text, value) => {
    expect(digitsToInteger(text)).toBe(value);
  });

  it.each([
    ["an empty string", "", /at least one digit/],
    ["a sign", "-1", /only digits/],
    ["a plus sign", "+1", /only digits/],
    ["a decimal point", "1.5", /only digits/],
    ["an exponent", "1e3", /only digits/],
    ["a space", " 1", /only digits/],
    ["a trailing letter (parseInt would stop there)", "12px", /only digits/],
    ["a non-ASCII digit", "١٢", /only digits/],
    ["a value above MAX_SAFE_INTEGER", "9007199254740993", /MAX_SAFE_INTEGER/],
  ])("rejects %s", (_label, text, message) => {
    expect(() => digitsToInteger(text)).toThrow(RangeError);
    expect(() => digitsToInteger(text)).toThrow(message);
  });
});
