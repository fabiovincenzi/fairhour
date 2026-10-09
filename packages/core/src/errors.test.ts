import { describe, expect, it } from "vitest";
import {
  CoreError,
  EntryMergeError,
  EntrySplitError,
  InvalidBillingModeError,
  InvalidBudgetError,
  InvalidDateError,
  InvalidDurationError,
  InvalidInstantError,
  InvalidIntervalError,
  InvalidTimeZoneError,
  MissingClockError,
} from "./errors";
import {
  DuplicateExchangeRateError,
  MissingRateError,
  RateCurrencyMismatchError,
} from "./rates/errors";

const errors: CoreError[] = [
  new InvalidInstantError("x"),
  new InvalidDateError(),
  new InvalidIntervalError(),
  new InvalidTimeZoneError("Nowhere"),
  new InvalidDurationError(),
  new MissingClockError(),
  new EntrySplitError("outside"),
  new EntryMergeError("gap"),
  new RateCurrencyMismatchError("USD", "EUR"),
  new MissingRateError("day"),
  new DuplicateExchangeRateError("USD"),
  new InvalidBillingModeError("non-positive-half-day"),
  new InvalidBudgetError("non-positive-budget"),
];

describe("CoreError", () => {
  it.each(errors.map((error) => [error.constructor.name, error] as const))(
    "%s names itself with a literal, and has a stable code",
    (className, error) => {
      // A literal name survives minification, `new.target.name` does not.
      expect(error.name).toBe(className);
      expect(error.code).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(error).toBeInstanceOf(CoreError);
      expect(error).toBeInstanceOf(Error);
      expect(String(error)).toBe(`${className}: ${error.message}`);
    },
  );

  it("has one distinct code per error class", () => {
    const codes = errors.map((error) => error.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
