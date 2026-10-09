import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { currencyArb, decimalArb, moneyArb } from "../test/arbitraries";
import { decimal, decimalToString } from "./decimal";
import { InvalidAmountError, InvalidCurrencyError } from "./errors";
import { moneyFromJson, moneyToJson, priceFromJson, priceToJson } from "./json";
import type { MoneyJson, PriceJson } from "./json";
import { money } from "./money";
import { price } from "./price";

describe("money JSON", () => {
  it.each([
    [123456n, "EUR", "1234.56"],
    [-50n, "EUR", "-0.50"],
    [1234n, "JPY", "1234"],
    [1n, "KWD", "0.001"],
    [0n, "CLF", "0.0000"],
  ] as const)("%s %s <-> %j", (amount, currency, text) => {
    const value = money(amount, currency);
    const json = moneyToJson(value);
    expect(json).toEqual({ amount: text, currency });
    expect(Object.isFrozen(json)).toBe(true);
    expect(JSON.stringify(json)).toBe(`{"amount":"${text}","currency":"${currency}"}`);
    expect(moneyFromJson(json)).toEqual(value);
  });

  it("is strict when decoding", () => {
    expect(moneyFromJson({ amount: "1.230", currency: "EUR" })).toEqual(money(123n, "EUR"));
    expect(() => moneyFromJson({ amount: "1.235", currency: "EUR" })).toThrow(
      expect.objectContaining({ reason: "too-precise" }),
    );
    expect(() => moneyFromJson({ amount: "1,23", currency: "EUR" })).toThrow(
      expect.objectContaining({ reason: "syntax" }),
    );
    expect(() => moneyFromJson({ amount: "1.23", currency: "eur" })).toThrow(InvalidCurrencyError);
  });

  it("rejects malformed JSON shapes from untyped callers", () => {
    const bad = (value: unknown) => () => moneyFromJson(value as MoneyJson);
    expect(bad(null)).toThrow(InvalidAmountError);
    expect(bad("1.23 EUR")).toThrow(InvalidAmountError);
    expect(bad({ amount: 1.23, currency: "EUR" })).toThrow(
      expect.objectContaining({ reason: "syntax" }),
    );
    expect(bad({ amount: "1.23" })).toThrow(
      expect.objectContaining({ code: "invalid-currency", value: "<undefined>" }),
    );
    expect(bad({ currency: "EUR" })).toThrow(InvalidAmountError);
    expect(bad({ amount: 123n, currency: "EUR" })).toThrow(InvalidAmountError);
  });

  it("round-trips through JSON text", () => {
    fc.assert(
      fc.property(moneyArb, (value) => {
        const text = JSON.stringify(moneyToJson(value));
        expect(moneyFromJson(JSON.parse(text) as MoneyJson)).toEqual(value);
      }),
    );
  });
});

describe("price JSON", () => {
  it("keeps the price's own scale", () => {
    const value = price("0.4250", "EUR");
    const json = priceToJson(value);
    expect(json).toEqual({ amount: "0.4250", currency: "EUR" });
    expect(Object.isFrozen(json)).toBe(true);
    expect(priceFromJson(json)).toEqual(value);
  });

  it("is strict when decoding", () => {
    expect(() => priceFromJson({ amount: "0,42", currency: "EUR" })).toThrow(InvalidAmountError);
    expect(() => priceFromJson({ amount: "0.42", currency: "EURO" })).toThrow(InvalidCurrencyError);
    expect(() => priceFromJson(undefined as unknown as PriceJson)).toThrow(InvalidAmountError);
  });

  it("round-trips through JSON text", () => {
    fc.assert(
      fc.property(decimalArb, currencyArb, (amount, currency) => {
        const value = price(decimalToString(amount), currency);
        const back = priceFromJson(JSON.parse(JSON.stringify(priceToJson(value))) as PriceJson);
        expect(back).toEqual(value);
        expect(back.amount).toEqual(decimal(decimalToString(amount)));
      }),
    );
  });
});
