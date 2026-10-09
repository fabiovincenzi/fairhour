import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  absBig,
  amountArb,
  currencyArb,
  decimalArb,
  directedModeArb,
  halfModeArb,
  isCorrectRounding,
  modeArb,
  moneyIn,
  nonNegativeDecimalArb,
} from "../test/arbitraries";
import { allocate, convert, divide, multiply, percentage } from "./arithmetic";
import { minorUnitExponent } from "./currency";
import type { CurrencyCode } from "./currency";
import { DECIMAL_HUNDRED, DECIMAL_ONE, decimal, decimalFromInteger, makeDecimal } from "./decimal";
import type { Decimal } from "./decimal";
import { DivisionByZeroError, InvalidAmountError, InvalidCurrencyError } from "./errors";
import { money, multiplyByInteger, sum } from "./money";
import type { Money } from "./money";
import { parseMoney, toDecimalString } from "./parse";
import { ROUNDING_MODES } from "./rounding";
import type { RoundingMode } from "./rounding";

const eur = (text: string) => parseMoney(text, "EUR");
const d = decimal;
const amounts = (values: readonly Money[]) => values.map(toDecimalString);

type ModeTable = Readonly<Record<RoundingMode, string>>;

/** Design test plan item 4: ties and near-ties in every mode, with the negative mirror. */
const PERCENTAGE_CASES: readonly (readonly [string, string, ModeTable])[] = [
  // 22 % of €0.25 = 0.055
  [
    "0.25",
    "22",
    {
      halfUp: "0.06",
      halfEven: "0.06",
      halfDown: "0.05",
      up: "0.06",
      down: "0.05",
      ceiling: "0.06",
      floor: "0.05",
    },
  ],
  // 10 % of €0.25 = 0.025
  [
    "0.25",
    "10",
    {
      halfUp: "0.03",
      halfEven: "0.02",
      halfDown: "0.02",
      up: "0.03",
      down: "0.02",
      ceiling: "0.03",
      floor: "0.02",
    },
  ],
  // 4 % of €0.13 = 0.0052
  [
    "0.13",
    "4",
    {
      halfUp: "0.01",
      halfEven: "0.01",
      halfDown: "0.01",
      up: "0.01",
      down: "0.00",
      ceiling: "0.01",
      floor: "0.00",
    },
  ],
  // 22 % of €1,040.00 = 228.80 (exact)
  [
    "1040.00",
    "22",
    {
      halfUp: "228.80",
      halfEven: "228.80",
      halfDown: "228.80",
      up: "228.80",
      down: "228.80",
      ceiling: "228.80",
      floor: "228.80",
    },
  ],
  // 20 % of €1,234.57 = 246.914
  [
    "1234.57",
    "20",
    {
      halfUp: "246.91",
      halfEven: "246.91",
      halfDown: "246.91",
      up: "246.92",
      down: "246.91",
      ceiling: "246.92",
      floor: "246.91",
    },
  ],
];

function mirror(table: ModeTable): ModeTable {
  const neg = (text: string) => (/^0(\.0+)?$/.test(text) ? text : `-${text}`);
  return {
    halfUp: neg(table.halfUp),
    halfEven: neg(table.halfEven),
    halfDown: neg(table.halfDown),
    up: neg(table.up),
    down: neg(table.down),
    ceiling: neg(table.floor),
    floor: neg(table.ceiling),
  };
}

describe("percentage and multiply", () => {
  describe.each(PERCENTAGE_CASES)("%s × %s %%", (amount, rate, expected) => {
    it.each(ROUNDING_MODES)("%s", (mode) => {
      expect(toDecimalString(percentage(eur(amount), d(rate), mode))).toBe(expected[mode]);
      // percentage(m, r) is multiply(m, r / 100)
      const factor = makeDecimal(d(rate).coefficient, d(rate).scale + 2);
      expect(toDecimalString(multiply(eur(amount), factor, mode))).toBe(expected[mode]);
      // Negative amounts mirror the positive ones (ceiling and floor swap).
      expect(toDecimalString(percentage(eur(`-${amount}`), d(rate), mode))).toBe(
        mirror(expected)[mode],
      );
    });
  });

  it.each([
    ["10.00", "1.25", "halfUp", "12.50"],
    ["0.10", "0.4253", "halfUp", "0.04"],
    ["100.00", "0.4253", "halfUp", "42.53"],
    ["1.00", "3", "down", "3.00"],
    ["-1.00", "0.333", "floor", "-0.34"],
  ] as const)("%s × %s with %s is %s", (amount, factor, mode, expected) => {
    expect(toDecimalString(multiply(eur(amount), d(factor), mode))).toBe(expected);
  });

  it("works with other exponents", () => {
    expect(percentage(money(1001n, "JPY"), d("10"), "halfUp")).toEqual(money(100n, "JPY"));
    expect(percentage(money(1005n, "JPY"), d("10"), "halfEven")).toEqual(money(100n, "JPY"));
    expect(percentage(money(1234n, "KWD"), d("5"), "halfUp")).toEqual(money(62n, "KWD"));
  });

  it("keeps the result frozen and in the same currency", () => {
    const result = multiply(money(5n, "CHF"), d("2"), "halfUp");
    expect(result).toEqual(money(10n, "CHF"));
    expect(Object.isFrozen(result)).toBe(true);
  });
});

describe("divide", () => {
  it.each([
    ["10.00", "3", "halfUp", "3.33"],
    ["10.00", "3", "up", "3.34"],
    ["-10.00", "3", "floor", "-3.34"],
    ["1.00", "0.5", "halfUp", "2.00"],
    ["1000.00", "8", "halfUp", "125.00"],
    ["0.05", "2", "halfEven", "0.02"],
    ["0.05", "2", "halfUp", "0.03"],
    ["1.00", "-4", "halfUp", "-0.25"],
  ] as const)("%s / %s with %s is %s", (amount, divisor, mode, expected) => {
    expect(toDecimalString(divide(eur(amount), d(divisor), mode))).toBe(expected);
  });

  it("throws on division by zero", () => {
    expect(() => divide(eur("1.00"), d("0.000"), "halfUp")).toThrow(DivisionByZeroError);
  });
});

describe("allocate", () => {
  const ones = (count: number) => Array.from({ length: count }, () => DECIMAL_ONE);

  it.each([
    ["1.00", ["1", "1", "1"], ["0.34", "0.33", "0.33"]],
    ["-1.00", ["1", "1", "1"], ["-0.34", "-0.33", "-0.33"]],
    ["0.05", ["0", "1"], ["0.00", "0.05"]],
    ["10.00", ["0.3", "0.7"], ["3.00", "7.00"]],
    ["100.00", ["50", "50"], ["50.00", "50.00"]],
    ["0.02", ["1", "1", "1"], ["0.01", "0.01", "0.00"]],
    ["0.00", ["1", "2"], ["0.00", "0.00"]],
    ["5.00", ["1"], ["5.00"]],
    ["1.01", ["0", "1", "0", "1"], ["0.00", "0.51", "0.00", "0.50"]],
    // Largest remainder wins: 0.10 × (1/6, 2/6, 3/6) = 0.0166, 0.0333, 0.05
    ["0.10", ["1", "2", "3"], ["0.02", "0.03", "0.05"]],
  ] as const)("splits %s by %j", (amount, ratios, expected) => {
    const result = allocate(
      eur(amount),
      ratios.map((ratio) => d(ratio)),
    );
    expect(amounts(result)).toEqual(expected);
    expect(Object.isFrozen(result)).toBe(true);
    for (const share of result) expect(Object.isFrozen(share)).toBe(true);
  });

  it("splits ¥100 by 1:2 into 33 and 67", () => {
    expect(allocate(money(100n, "JPY"), [d("1"), d("2")])).toEqual([
      money(33n, "JPY"),
      money(67n, "JPY"),
    ]);
  });

  it("handles 1 000 ratios", () => {
    const result = allocate(eur("12345.67"), ones(1000));
    expect(result).toHaveLength(1000);
    expect(sum(result, "EUR")).toEqual(eur("12345.67"));
    // 1234567 cents / 1000 = 1234 r 567: the first 567 shares get one more cent.
    expect(result.filter((share) => share.amount === 1235n)).toHaveLength(567);
    expect(result.filter((share) => share.amount === 1234n)).toHaveLength(433);
    expect(result[566]!.amount).toBe(1235n);
    expect(result[567]!.amount).toBe(1234n);
  });

  it("rejects empty, negative and all-zero ratios", () => {
    expect(() => allocate(eur("1.00"), [])).toThrow(
      expect.objectContaining({ code: "invalid-amount", reason: "no-ratios" }),
    );
    expect(() => allocate(eur("1.00"), [d("1"), d("-1")])).toThrow(
      expect.objectContaining({ reason: "negative-ratio" }),
    );
    expect(() => allocate(eur("1.00"), [d("0"), d("0.00")])).toThrow(DivisionByZeroError);
  });

  describe("properties", () => {
    const ratiosArb = fc
      .array(nonNegativeDecimalArb, { minLength: 1, maxLength: 30 })
      .filter((ratios) => ratios.some((ratio) => ratio.coefficient > 0n));
    const caseArb = fc.tuple(currencyArb.chain(moneyIn), ratiosArb);

    /** Integer weights at a common scale, as the algorithm defines them. */
    function weights(ratios: readonly Decimal[]): bigint[] {
      const scale = Math.max(...ratios.map((ratio) => ratio.scale));
      return ratios.map((ratio) => ratio.coefficient * 10n ** BigInt(scale - ratio.scale));
    }

    it("shares sum to the input, each within one unit of its exact value", () => {
      fc.assert(
        fc.property(caseArb, ([value, ratios]) => {
          const result = allocate(value, ratios);
          expect(result).toHaveLength(ratios.length);
          expect(sum(result, value.currency)).toEqual(value);
          const w = weights(ratios);
          const total = w.reduce((acc, weight) => acc + weight, 0n);
          result.forEach((share, index) => {
            const exactTimesTotal = value.amount * w[index]!;
            expect(absBig(share.amount * total - exactTimesTotal) < total).toBe(true);
            if (w[index] === 0n) expect(share.amount).toBe(0n);
          });
        }),
      );
    });

    it("equal ratios give shares that differ by at most one unit", () => {
      fc.assert(
        fc.property(currencyArb.chain(moneyIn), fc.integer({ min: 1, max: 50 }), (value, count) => {
          const result = allocate(value, ones(count)).map((share) => share.amount);
          const low = result.reduce((a, b) => (a < b ? a : b));
          const high = result.reduce((a, b) => (a > b ? a : b));
          expect(high - low <= 1n).toBe(true);
        }),
      );
    });

    it("is invariant under scaling of the ratios and deterministic", () => {
      fc.assert(
        fc.property(
          caseArb,
          fc.bigInt({ min: 1n, max: 1000n }),
          fc.integer({ min: 0, max: 6 }),
          ([value, ratios], factor, shift) => {
            const result = allocate(value, ratios);
            const scaled = ratios.map((ratio) =>
              makeDecimal(ratio.coefficient * factor, ratio.scale + shift),
            );
            expect(allocate(value, scaled)).toEqual(result);
            expect(allocate(value, ratios)).toEqual(result);
          },
        ),
      );
    });

    it("negating the amount negates every share", () => {
      fc.assert(
        fc.property(caseArb, ([value, ratios]) => {
          const positive = allocate(value, ratios).map((share) => share.amount);
          const negative = allocate(money(-value.amount, value.currency), ratios).map(
            (share) => share.amount,
          );
          expect(negative).toEqual(positive.map((amount) => -amount));
        }),
      );
    });
  });
});

describe("convert", () => {
  it.each([
    // €12.34 at 161.25 JPY/EUR: 1989.825 -> ¥1,990
    [["12.34", "EUR"], "JPY", "161.25", "halfUp", "1990"],
    [["12.34", "EUR"], "JPY", "161.25", "down", "1989"],
    // ¥1,990 at 0.0062 EUR/JPY: 12.338 -> €12.34
    [["1990", "JPY"], "EUR", "0.0062", "halfUp", "12.34"],
    // €100.00 at 0.3312 KWD/EUR: KWD 33.120 exactly
    [["100.00", "EUR"], "KWD", "0.3312", "halfUp", "33.120"],
    // A rate with six decimals: $1.085432 -> $1.09 / $1.08
    [["1.00", "EUR"], "USD", "1.085432", "halfEven", "1.09"],
    [["1.00", "EUR"], "USD", "1.085432", "down", "1.08"],
    // Shift ≥ 0: ¥100 at 2 CLF/JPY is exactly CLF 200.0000
    [["100", "JPY"], "CLF", "2", "halfUp", "200.0000"],
    // Negative amounts round symmetrically with halfUp
    [["-12.34", "EUR"], "JPY", "161.25", "halfUp", "-1990"],
    [["-12.34", "EUR"], "JPY", "161.25", "floor", "-1990"],
    [["-12.34", "EUR"], "JPY", "161.25", "ceiling", "-1989"],
  ] as const)("%j to %s at %s with %s is %s", ([amount, from], to, rate, mode, expected) => {
    const result = convert(parseMoney(amount, from), to, d(rate), mode);
    expect(result.currency).toBe(to);
    expect(toDecimalString(result)).toBe(expected);
  });

  it("converts to the same currency only at a rate of exactly 1", () => {
    const value = parseMoney("12.34", "EUR");
    expect(convert(value, "EUR", d("1"), "halfUp")).toBe(value);
    expect(convert(value, "EUR", d("1.000"), "halfUp")).toBe(value);
    expect(() => convert(value, "EUR", d("1.01"), "halfUp")).toThrow(
      expect.objectContaining({ reason: "same-currency-rate" }),
    );
  });

  it("rejects non-positive rates and unknown currencies", () => {
    const value = parseMoney("12.34", "EUR");
    expect(() => convert(value, "USD", d("0"), "halfUp")).toThrow(
      expect.objectContaining({ reason: "non-positive-rate" }),
    );
    expect(() => convert(value, "USD", d("-1.1"), "halfUp")).toThrow(InvalidAmountError);
    expect(() => convert(value, "usd" as CurrencyCode, d("1.1"), "halfUp")).toThrow(
      InvalidCurrencyError,
    );
  });

  describe("properties", () => {
    const pairArb = fc.tuple(currencyArb, currencyArb).filter(([from, to]) => from !== to);
    /** Rates 2^a × 5^b, whose inverses 2^-a × 5^-b are exact decimals too. */
    const rateArb = fc
      .tuple(fc.integer({ min: -6, max: 6 }), fc.integer({ min: -6, max: 6 }))
      .map(([a, b]) => [powerRate(a, b), powerRate(-a, -b)] as const);

    function powerRate(twos: number, fives: number): Decimal {
      // 2^a × 5^b = (2^max(a,0) × 5^max(-a,0) × 5^max(b,0) × 2^max(-b,0)) / 10^(max(-a,0) + max(-b,0))
      const coefficient =
        2n ** BigInt(Math.max(twos, 0)) *
        5n ** BigInt(Math.max(-twos, 0)) *
        5n ** BigInt(Math.max(fives, 0)) *
        2n ** BigInt(Math.max(-fives, 0));
      return makeDecimal(coefficient, Math.max(-twos, 0) + Math.max(-fives, 0));
    }

    it("rounds the exact converted value correctly", () => {
      fc.assert(
        fc.property(
          pairArb,
          amountArb,
          decimalArb,
          modeArb,
          ([from, to], amount, rawRate, mode) => {
            const rate =
              rawRate.coefficient === 0n
                ? DECIMAL_ONE
                : makeDecimal(absBig(rawRate.coefficient), rawRate.scale);
            const result = convert(money(amount, from), to, rate, mode);
            // exact = amount × c × 10^(e_t - e_f - s)
            const k = minorUnitExponent(to) - minorUnitExponent(from) - rate.scale;
            const numerator = amount * rate.coefficient * 10n ** BigInt(Math.max(k, 0));
            const denominator = 10n ** BigInt(Math.max(-k, 0));
            return isCorrectRounding(result.amount, numerator, denominator, mode);
          },
        ),
      );
    });

    it("convert then convert back stays within the rounding bound", () => {
      const run = (
        modeArbitrary: fc.Arbitrary<RoundingMode>,
        bound: (slack: bigint, unit: bigint) => bigint,
      ): void => {
        fc.assert(
          fc.property(
            pairArb,
            amountArb,
            rateArb,
            modeArbitrary,
            ([from, to], amount, [rate, inverse], mode) => {
              const original = money(amount, from);
              const there = convert(original, to, rate, mode);
              const back = convert(there, from, inverse, mode);
              // |back - original| ≤ ½ + ½ × inverse × 10^(e_f - e_t) for the half modes
              // (< 1 + inverse × 10^(e_f - e_t) for the directed modes). In units of 1 / unit:
              const shift = minorUnitExponent(from) - minorUnitExponent(to);
              const unit = 10n ** BigInt(inverse.scale + Math.max(-shift, 0));
              const slack = inverse.coefficient * 10n ** BigInt(Math.max(shift, 0));
              expect(absBig(back.amount - amount) * unit <= bound(slack, unit)).toBe(true);
            },
          ),
        );
      };
      run(halfModeArb, (slack, unit) => (unit + slack) / 2n);
      run(directedModeArb, (slack, unit) => unit + slack);
    });
  });
});

describe("identities", () => {
  it("percentage(m, 100) = m, multiply(m, 1) = m, multiply by an integer = multiplyByInteger", () => {
    fc.assert(
      fc.property(
        currencyArb.chain(moneyIn),
        modeArb,
        fc.bigInt({ min: -1000n, max: 1000n }),
        (value, mode, factor) => {
          expect(percentage(value, DECIMAL_HUNDRED, mode)).toEqual(value);
          expect(percentage(value, d("100.000"), mode)).toEqual(value);
          expect(multiply(value, DECIMAL_ONE, mode)).toEqual(value);
          expect(multiply(value, decimalFromInteger(factor), mode)).toEqual(
            multiplyByInteger(value, factor),
          );
          expect(divide(value, DECIMAL_ONE, mode)).toEqual(value);
        },
      ),
    );
  });

  it("multiply rounds within half a unit (half modes) or one unit (directed modes)", () => {
    fc.assert(
      fc.property(currencyArb.chain(moneyIn), decimalArb, modeArb, (value, factor, mode) => {
        const result = multiply(value, factor, mode);
        return isCorrectRounding(
          result.amount,
          value.amount * factor.coefficient,
          10n ** BigInt(factor.scale),
          mode,
        );
      }),
    );
  });

  it("symmetric modes satisfy round(-x) = -round(x); floor ≤ exact ≤ ceiling", () => {
    fc.assert(
      fc.property(currencyArb.chain(moneyIn), decimalArb, (value, factor) => {
        const negated = money(-value.amount, value.currency);
        for (const mode of ["halfUp", "halfEven", "halfDown", "up", "down"] as const) {
          expect(multiply(negated, factor, mode).amount).toBe(
            -multiply(value, factor, mode).amount,
          );
        }
        expect(multiply(negated, factor, "ceiling").amount).toBe(
          -multiply(value, factor, "floor").amount,
        );
        const floor = multiply(value, factor, "floor").amount;
        const ceiling = multiply(value, factor, "ceiling").amount;
        const scale = 10n ** BigInt(factor.scale);
        const exact = value.amount * factor.coefficient;
        expect(floor * scale <= exact && exact <= ceiling * scale).toBe(true);
        expect(absBig(multiply(value, factor, "down").amount * scale) <= absBig(exact)).toBe(true);
      }),
    );
  });
});
