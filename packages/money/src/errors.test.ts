import { describe, expect, it } from "vitest";

import {
  CurrencyMismatchError,
  DivisionByZeroError,
  InvalidAmountError,
  InvalidCurrencyError,
  MoneyError,
} from "./errors";

describe("errors", () => {
  it("InvalidAmountError carries its code and reason", () => {
    const error = new InvalidAmountError("too-precise", "too many decimals");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(MoneyError);
    expect(error.name).toBe("InvalidAmountError");
    expect(error.code).toBe("invalid-amount");
    expect(error.reason).toBe("too-precise");
    expect(error.message).toBe("too many decimals");
  });

  it("InvalidCurrencyError names a three-letter code and only the length of anything else", () => {
    const lower = new InvalidCurrencyError("eur");
    expect(lower).toBeInstanceOf(MoneyError);
    expect(lower.name).toBe("InvalidCurrencyError");
    expect(lower.code).toBe("invalid-currency");
    expect(lower.value).toBe("eur");
    expect(lower.message).toContain('"eur"');

    const secret = new InvalidCurrencyError("1234.56 EUR");
    expect(secret.value).toBe("1234.56 EUR");
    expect(secret.message).not.toContain("1234");
    expect(secret.message).toContain("length 11");
  });

  it("CurrencyMismatchError names both currencies", () => {
    const error = new CurrencyMismatchError("EUR", "USD");
    expect(error).toBeInstanceOf(MoneyError);
    expect(error.name).toBe("CurrencyMismatchError");
    expect(error.code).toBe("currency-mismatch");
    expect([error.left, error.right]).toEqual(["EUR", "USD"]);
    expect(error.message).toContain("EUR and USD");
  });

  it("DivisionByZeroError has a default and a custom message", () => {
    const error = new DivisionByZeroError();
    expect(error).toBeInstanceOf(MoneyError);
    expect(error.name).toBe("DivisionByZeroError");
    expect(error.code).toBe("division-by-zero");
    expect(error.message).toBe("Division by zero");
    expect(new DivisionByZeroError("all ratios are zero").message).toBe("all ratios are zero");
  });
});
