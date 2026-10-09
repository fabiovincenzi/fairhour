import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { amountArb, currencyArb, moneyIn } from "../test/arbitraries";
import type { CurrencyCode } from "./currency";
import { CurrencyMismatchError, InvalidCurrencyError } from "./errors";
import {
  abs,
  add,
  compare,
  equals,
  greaterThan,
  greaterThanOrEqual,
  isMoney,
  isNegative,
  isPositive,
  isZero,
  lessThan,
  lessThanOrEqual,
  max,
  min,
  money,
  multiplyByInteger,
  negate,
  subtract,
  sum,
  zero,
} from "./money";

const eur = (amount: bigint) => money(amount, "EUR");
const usd = (amount: bigint) => money(amount, "USD");

describe("constructors and guards", () => {
  it("builds frozen plain objects with a stable key order", () => {
    const value = money(1234n, "EUR");
    expect(value).toEqual({ amount: 1234n, currency: "EUR" });
    expect(Object.keys(value)).toEqual(["amount", "currency"]);
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
  });

  it("builds zero", () => {
    expect(zero("JPY")).toEqual({ amount: 0n, currency: "JPY" });
    expect(Object.isFrozen(zero("JPY"))).toBe(true);
  });

  it("rejects unknown currencies and non-bigint amounts", () => {
    expect(() => money(1n, "eur" as CurrencyCode)).toThrow(InvalidCurrencyError);
    expect(() => zero("ABC" as CurrencyCode)).toThrow(InvalidCurrencyError);
    expect(() => money(12.34 as unknown as bigint, "EUR")).toThrow(TypeError);
    expect(() => money("1234" as unknown as bigint, "EUR")).toThrow(TypeError);
  });

  it("recognizes money structurally", () => {
    expect(isMoney(eur(1n))).toBe(true);
    expect(isMoney({ amount: 1n, currency: "JPY" })).toBe(true);
    for (const value of [
      null,
      undefined,
      1n,
      "1 EUR",
      {},
      { amount: 1, currency: "EUR" },
      { amount: 1n, currency: "eur" },
      { amount: 1n, currency: 978 },
      { amount: 1n },
      { currency: "EUR" },
    ]) {
      expect(isMoney(value)).toBe(false);
    }
  });
});

describe("addition and friends", () => {
  it("adds, subtracts, negates and takes absolute values", () => {
    expect(add(eur(150n), eur(-50n))).toEqual(eur(100n));
    expect(subtract(eur(150n), eur(200n))).toEqual(eur(-50n));
    expect(negate(eur(5n))).toEqual(eur(-5n));
    expect(negate(eur(0n)).amount).toBe(0n);
    expect(abs(eur(-5n))).toEqual(eur(5n));
    const positive = eur(5n);
    expect(abs(positive)).toBe(positive);
    expect(Object.isFrozen(add(eur(1n), eur(2n)))).toBe(true);
  });

  it("is exact far beyond 2^53", () => {
    const big = eur(2n ** 80n + 1n);
    expect(add(big, eur(1n)).amount).toBe(2n ** 80n + 2n);
  });

  it("never mixes currencies", () => {
    expect(() => add(eur(1n), usd(1n))).toThrow(CurrencyMismatchError);
    expect(() => subtract(eur(1n), usd(1n))).toThrow(
      expect.objectContaining({ code: "currency-mismatch", left: "EUR", right: "USD" }),
    );
  });

  it("sums a list, including the empty list", () => {
    expect(sum([eur(1n), eur(2n), eur(3n)], "EUR")).toEqual(eur(6n));
    expect(sum([], "KWD")).toEqual(money(0n, "KWD"));
    expect(() => sum([eur(1n), usd(2n)], "EUR")).toThrow(
      expect.objectContaining({ left: "EUR", right: "USD" }),
    );
    expect(() => sum([eur(1n)], "USD")).toThrow(CurrencyMismatchError);
    expect(() => sum([], "usd" as CurrencyCode)).toThrow(InvalidCurrencyError);
  });

  it("multiplies by an integer exactly", () => {
    expect(multiplyByInteger(eur(1234n), -3n)).toEqual(eur(-3702n));
    expect(multiplyByInteger(eur(1234n), 0n)).toEqual(eur(0n));
    expect(() => multiplyByInteger(eur(1n), 1.5 as unknown as bigint)).toThrow(TypeError);
  });
});

describe("comparisons", () => {
  it("compares amounts in the same currency", () => {
    expect(compare(eur(1n), eur(2n))).toBe(-1);
    expect(compare(eur(2n), eur(2n))).toBe(0);
    expect(compare(eur(3n), eur(2n))).toBe(1);
    expect(lessThan(eur(1n), eur(2n))).toBe(true);
    expect(lessThan(eur(2n), eur(2n))).toBe(false);
    expect(lessThanOrEqual(eur(2n), eur(2n))).toBe(true);
    expect(lessThanOrEqual(eur(3n), eur(2n))).toBe(false);
    expect(greaterThan(eur(3n), eur(2n))).toBe(true);
    expect(greaterThan(eur(2n), eur(2n))).toBe(false);
    expect(greaterThanOrEqual(eur(2n), eur(2n))).toBe(true);
    expect(greaterThanOrEqual(eur(1n), eur(2n))).toBe(false);
  });

  it("throws when comparing different currencies, except for equals", () => {
    for (const fn of [compare, lessThan, lessThanOrEqual, greaterThan, greaterThanOrEqual]) {
      expect(() => fn(eur(1n), usd(1n))).toThrow(CurrencyMismatchError);
    }
    expect(equals(eur(1n), usd(1n))).toBe(false);
    expect(equals(eur(1n), eur(1n))).toBe(true);
    expect(equals(eur(1n), eur(2n))).toBe(false);
  });

  it("finds the minimum and maximum, keeping the first on ties", () => {
    const first = eur(5n);
    const second = eur(5n);
    expect(min(eur(3n), eur(-1n), eur(2n))).toEqual(eur(-1n));
    expect(max(eur(3n), eur(-1n), eur(7n))).toEqual(eur(7n));
    expect(min(first, second)).toBe(first);
    expect(max(first, second)).toBe(first);
    expect(min(first)).toBe(first);
    expect(() => min(eur(1n), usd(0n))).toThrow(CurrencyMismatchError);
    expect(() => max(eur(1n), eur(2n), usd(0n))).toThrow(CurrencyMismatchError);
  });

  it("tests signs", () => {
    expect([isZero(eur(0n)), isZero(eur(1n))]).toEqual([true, false]);
    expect([isPositive(eur(1n)), isPositive(eur(0n)), isPositive(eur(-1n))]).toEqual([
      true,
      false,
      false,
    ]);
    expect([isNegative(eur(-1n)), isNegative(eur(0n)), isNegative(eur(1n))]).toEqual([
      true,
      false,
      false,
    ]);
  });
});

describe("properties", () => {
  const triple = currencyArb.chain((currency) =>
    fc.tuple(moneyIn(currency), moneyIn(currency), moneyIn(currency)),
  );

  it("add is associative and commutative, zero is neutral", () => {
    fc.assert(
      fc.property(triple, ([a, b, c]) => {
        expect(add(add(a, b), c)).toEqual(add(a, add(b, c)));
        expect(add(a, b)).toEqual(add(b, a));
        expect(add(a, zero(a.currency))).toEqual(a);
      }),
    );
  });

  it("subtract(a, a) is zero and negate is an involution", () => {
    fc.assert(
      fc.property(currencyArb.chain(moneyIn), (a) => {
        expect(subtract(a, a)).toEqual(zero(a.currency));
        expect(negate(negate(a))).toEqual(a);
        expect(add(a, negate(a))).toEqual(zero(a.currency));
        expect(abs(a).amount >= 0n).toBe(true);
      }),
    );
  });

  it("sum equals a left fold of add", () => {
    fc.assert(
      fc.property(
        currencyArb.chain((currency) =>
          fc.tuple(fc.constant(currency), fc.array(moneyIn(currency), { maxLength: 20 })),
        ),
        ([currency, items]) => {
          expect(sum(items, currency)).toEqual(items.reduce(add, zero(currency)));
        },
      ),
    );
  });

  it("compare is consistent with subtraction, min and max", () => {
    fc.assert(
      fc.property(amountArb, amountArb, (x, y) => {
        const [a, b] = [eur(x), eur(y)];
        const sign = subtract(a, b).amount;
        expect(compare(a, b)).toBe(sign < 0n ? -1 : sign > 0n ? 1 : 0);
        expect(lessThanOrEqual(min(a, b), max(a, b))).toBe(true);
        expect(equals(add(min(a, b), max(a, b)), add(a, b))).toBe(true);
      }),
    );
  });
});
