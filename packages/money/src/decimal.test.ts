import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  decimalArb,
  decimalTieArb,
  isCorrectRounding,
  modeArb,
  tieRounding,
} from "../test/arbitraries";
import {
  DECIMAL_HUNDRED,
  DECIMAL_ONE,
  DECIMAL_ZERO,
  MAX_DECIMAL_DIGITS,
  MAX_DECIMAL_SCALE,
  absDecimal,
  addDecimal,
  compareDecimal,
  decimal,
  decimalEquals,
  decimalFromInteger,
  decimalToString,
  digitsToString,
  divideDecimal,
  encodeDigits,
  isDecimal,
  isDecimalString,
  isZeroDecimal,
  multiplyDecimal,
  negateDecimal,
  normalizeDecimal,
  rescaleDecimal,
  signDecimal,
  subtractDecimal,
  tryDecimal,
} from "./decimal";
import type { Decimal } from "./decimal";
import { DivisionByZeroError, InvalidAmountError } from "./errors";
import { ROUNDING_MODES } from "./rounding";

const d = decimal;

function parts(value: Decimal): [bigint, number] {
  return [value.coefficient, value.scale];
}

const VALID: readonly (readonly [string, bigint, number])[] = [
  ["0", 0n, 0],
  ["22", 22n, 0],
  ["0.5", 5n, 1],
  ["-1.25", -125n, 2],
  ["1.50", 150n, 2],
  ["-0", 0n, 0],
  ["-0.00", 0n, 2],
  ["0.000", 0n, 3],
  ["100", 100n, 0],
  ["161.25", 16125n, 2],
  ["0.4253", 4253n, 4],
  ["0.00000001", 1n, 8],
  ["-1234567.89", -123456789n, 2],
  ["9007199254740993", 9007199254740993n, 0],
  ["1." + "0".repeat(40), 10n ** 40n, 40],
  ["9".repeat(80), 10n ** 80n - 1n, 0],
  ["-" + "9".repeat(40) + "." + "9".repeat(40), -(10n ** 80n - 1n), 40],
];

const SYNTAX: readonly string[] = [
  "",
  "+1",
  "1.",
  ".5",
  "01",
  "00",
  "-01",
  "1e3",
  "1E3",
  "1,5",
  "1.000,5",
  " 1",
  "1 ",
  "1_000",
  "NaN",
  "Infinity",
  "-Infinity",
  "0x10",
  "--1",
  "-",
  "-.5",
  "1..5",
  "1.5.5",
  "١٢",
  "１",
  "1\n",
];

const OUT_OF_RANGE: readonly string[] = [
  "1".repeat(MAX_DECIMAL_DIGITS + 1),
  "0." + "1".repeat(MAX_DECIMAL_SCALE + 1),
  "1".repeat(41) + "." + "1".repeat(40),
  "1".repeat(1000),
];

describe("decimal parser", () => {
  it.each(VALID)("parses %j", (text, coefficient, scale) => {
    const value = d(text);
    expect(parts(value)).toEqual([coefficient, scale]);
    expect(Object.isFrozen(value)).toBe(true);
    expect(tryDecimal(text)).toEqual(value);
    expect(isDecimalString(text)).toBe(true);
  });

  it.each(VALID.filter(([text]) => !text.startsWith("-0")))("round-trips %j", (text) => {
    expect(decimalToString(d(text))).toBe(text);
  });

  it("prints negative zero as zero, keeping the scale", () => {
    expect(decimalToString(d("-0"))).toBe("0");
    expect(decimalToString(d("-0.0"))).toBe("0.0");
  });

  it.each(SYNTAX)("rejects %j as a syntax error", (text) => {
    expect(() => d(text)).toThrow(
      expect.objectContaining({ code: "invalid-amount", reason: "syntax" }),
    );
    expect(tryDecimal(text)).toBeUndefined();
    expect(isDecimalString(text)).toBe(false);
  });

  it.each(OUT_OF_RANGE.map((text) => [text.length, text] as const))(
    "rejects a %i-character string as out of range",
    (_length, text) => {
      expect(() => d(text)).toThrow(
        expect.objectContaining({ code: "invalid-amount", reason: "out-of-range" }),
      );
      expect(tryDecimal(text)).toBeUndefined();
    },
  );

  it("never puts the input in the error message", () => {
    try {
      d("12345.678,9");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidAmountError);
      expect((error as Error).message).not.toContain("12345");
      expect((error as Error).message).toContain("length 11");
    }
  });

  it("rejects non-strings from untyped callers", () => {
    expect(() => d(12 as unknown as string)).toThrow(InvalidAmountError);
    expect(isDecimalString(null as unknown as string)).toBe(false);
  });

  it("round-trips every decimal through its string form", () => {
    fc.assert(
      fc.property(decimalArb, (value) => {
        const again = d(decimalToString(value));
        return again.coefficient === value.coefficient && again.scale === value.scale;
      }),
    );
  });
});

describe("constants and constructors", () => {
  it("has frozen constants", () => {
    expect(parts(DECIMAL_ZERO)).toEqual([0n, 0]);
    expect(parts(DECIMAL_ONE)).toEqual([1n, 0]);
    expect(parts(DECIMAL_HUNDRED)).toEqual([100n, 0]);
    for (const value of [DECIMAL_ZERO, DECIMAL_ONE, DECIMAL_HUNDRED]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
    expect([MAX_DECIMAL_SCALE, MAX_DECIMAL_DIGITS]).toEqual([40, 80]);
  });

  it("builds a decimal from an integer", () => {
    expect(parts(decimalFromInteger(-42n))).toEqual([-42n, 0]);
    expect(() => decimalFromInteger(42 as unknown as bigint)).toThrow(TypeError);
  });

  it("recognizes decimals structurally", () => {
    expect(isDecimal(d("1.5"))).toBe(true);
    expect(isDecimal({ coefficient: 15n, scale: 1 })).toBe(true);
    for (const value of [
      null,
      undefined,
      "1.5",
      15n,
      {},
      { coefficient: 15, scale: 1 },
      { coefficient: 15n },
      { scale: 1 },
      { coefficient: 15n, scale: 1.5 },
      { coefficient: 15n, scale: -1 },
      { coefficient: 15n, scale: 41 },
      { coefficient: 15n, scale: "1" },
    ]) {
      expect(isDecimal(value)).toBe(false);
    }
  });
});

describe("encodeDigits (internal, for the JSON and zod encoders)", () => {
  const NINES = (count: number) => 10n ** BigInt(count) - 1n;

  it.each([
    [0n, 0, "0"],
    [5n, 2, "0.05"],
    [-5n, 2, "-0.05"],
    [NINES(80), 0, "9".repeat(80)],
    [-NINES(80), 40, `-${"9".repeat(40)}.${"9".repeat(40)}`],
    [NINES(40), 40, `0.${"9".repeat(40)}`],
    [1n, 40, `0.${"0".repeat(39)}1`],
  ] as const)("encodes %s at scale %i as %j, which decimal() reads back", (c, scale, text) => {
    expect(encodeDigits(c, scale)).toBe(text);
    expect(parts(d(text))).toEqual([c, scale]);
  });

  it.each([
    [NINES(81), 0],
    [-NINES(81), 0],
    [NINES(81), 1],
    [-NINES(81), 40],
    [1n, MAX_DECIMAL_SCALE + 1],
  ] as const)("rejects %s at scale %i (out-of-range), as decimal() would", (c, scale) => {
    expect(() => d(digitsToString(c, scale))).toThrow(InvalidAmountError);
    expect(() => encodeDigits(c, scale)).toThrow(
      expect.objectContaining({ code: "invalid-amount", reason: "out-of-range" }),
    );
  });

  it("accepts exactly what decimal() accepts", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: -(10n ** 85n), max: 10n ** 85n }),
        fc.integer({ min: 0, max: MAX_DECIMAL_SCALE + 5 }),
        (c, scale) => {
          const text = digitsToString(c, scale);
          if (isDecimalString(text)) {
            expect(encodeDigits(c, scale)).toBe(text);
          } else {
            expect(() => encodeDigits(c, scale)).toThrow(InvalidAmountError);
          }
        },
      ),
    );
  });
});

describe("normalizeDecimal", () => {
  it.each([
    ["1.50", "1.5"],
    ["2.000", "2"],
    ["0.00", "0"],
    ["0", "0"],
    ["-10.10", "-10.1"],
    ["100", "100"],
    ["0.0001000", "0.0001"],
  ])("%s -> %s", (input, expected) => {
    expect(decimalToString(normalizeDecimal(d(input)))).toBe(expected);
  });

  it("returns the same object when nothing changes", () => {
    const value = d("1.25");
    expect(normalizeDecimal(value)).toBe(value);
    expect(normalizeDecimal(DECIMAL_ZERO)).toBe(DECIMAL_ZERO);
  });
});

describe("rescaleDecimal", () => {
  it("adds zeros exactly", () => {
    expect(decimalToString(rescaleDecimal(d("1.5"), 4, "down"))).toBe("1.5000");
    expect(decimalToString(rescaleDecimal(d("-3"), 2, "up"))).toBe("-3.00");
  });

  it.each([
    ["1.005", 2, "halfUp", "1.01"],
    ["1.005", 2, "halfEven", "1.00"],
    ["1.015", 2, "halfEven", "1.02"],
    ["1.005", 2, "halfDown", "1.00"],
    ["-1.005", 2, "halfUp", "-1.01"],
    ["-1.005", 2, "halfDown", "-1.00"],
    ["1.001", 2, "up", "1.01"],
    ["1.009", 2, "down", "1.00"],
    ["-1.001", 2, "ceiling", "-1.00"],
    ["-1.001", 2, "floor", "-1.01"],
    ["0.4253", 0, "halfUp", "0"],
    ["2.5", 0, "halfEven", "2"],
  ] as const)("%s to scale %i with %s is %s", (input, scale, mode, expected) => {
    expect(decimalToString(rescaleDecimal(d(input), scale, mode))).toBe(expected);
  });

  it("returns the same object for the same scale", () => {
    const value = d("1.50");
    expect(rescaleDecimal(value, 2, "halfUp")).toBe(value);
  });

  it.each([-1, 41, 1.5, Number.NaN])("rejects scale %d", (scale) => {
    expect(() => rescaleDecimal(d("1"), scale, "halfUp")).toThrow(
      expect.objectContaining({ reason: "out-of-range" }),
    );
  });

  it("rounds correctly in every mode", () => {
    fc.assert(
      fc.property(decimalArb, fc.integer({ min: 0, max: 8 }), modeArb, (value, scale, mode) => {
        const result = rescaleDecimal(value, scale, mode);
        expect(result.scale).toBe(scale);
        if (scale >= value.scale) return decimalEquals(result, value);
        const denominator = 10n ** BigInt(value.scale - scale);
        return isCorrectRounding(result.coefficient, value.coefficient, denominator, mode);
      }),
    );
  });
});

describe("exact arithmetic", () => {
  it.each([
    ["1.5", "2.25", "3.75", "-0.75"],
    ["0.1", "0.2", "0.3", "-0.1"],
    ["-1", "0.001", "-0.999", "-1.001"],
    ["100", "0", "100", "100"],
  ])("%s and %s", (a, b, sumText, difference) => {
    expect(decimalToString(addDecimal(d(a), d(b)))).toBe(sumText);
    expect(decimalToString(subtractDecimal(d(a), d(b)))).toBe(difference);
  });

  it("keeps the larger scale on addition", () => {
    expect(decimalToString(addDecimal(d("1.50"), d("1")))).toBe("2.50");
  });

  it.each([
    ["1.5", "2.25", "3.375"],
    ["22", "0.01", "0.22"],
    ["-0.5", "0.5", "-0.25"],
    ["1.10", "1.10", "1.2100"],
    ["0", "1.5", "0.0"],
  ])("%s × %s = %s", (a, b, product) => {
    expect(decimalToString(multiplyDecimal(d(a), d(b)))).toBe(product);
  });

  it("normalizes a product whose scale exceeds the maximum", () => {
    const a = d("1." + "0".repeat(30));
    const b = d("2.5" + "0".repeat(19));
    expect(decimalToString(multiplyDecimal(a, b))).toBe("2.5");
  });

  it("throws scale-overflow when the normalized product still needs too many decimals", () => {
    const a = d("0." + "0".repeat(29) + "1");
    expect(() => multiplyDecimal(a, a)).toThrow(
      expect.objectContaining({ code: "invalid-amount", reason: "scale-overflow" }),
    );
  });

  it.each([
    ["1", "3", 4, "halfUp", "0.3333"],
    ["2", "3", 4, "halfUp", "0.6667"],
    ["2", "3", 4, "down", "0.6666"],
    ["-2", "3", 2, "floor", "-0.67"],
    ["-2", "3", 2, "ceiling", "-0.66"],
    ["1", "8", 2, "halfEven", "0.12"],
    ["3", "8", 2, "halfEven", "0.38"],
    ["7200", "3600", 2, "halfUp", "2.00"],
    ["5400", "3600", 2, "halfUp", "1.50"],
    ["1", "0.0001", 0, "halfUp", "10000"],
    ["0.00012", "120", 6, "halfUp", "0.000001"],
    ["10", "-4", 1, "halfUp", "-2.5"],
  ] as const)("%s / %s to %i decimals with %s = %s", (a, b, scale, mode, expected) => {
    expect(decimalToString(divideDecimal(d(a), d(b), scale, mode))).toBe(expected);
  });

  it("throws on division by zero and on an invalid scale", () => {
    expect(() => divideDecimal(d("1"), d("0.00"), 2, "halfUp")).toThrow(DivisionByZeroError);
    expect(() => divideDecimal(d("1"), d("3"), 41, "halfUp")).toThrow(InvalidAmountError);
  });

  it("negates, takes absolute values, compares and tests signs", () => {
    expect(decimalToString(negateDecimal(d("1.50")))).toBe("-1.50");
    expect(decimalToString(negateDecimal(d("-1.50")))).toBe("1.50");
    expect(negateDecimal(DECIMAL_ZERO)).toBe(DECIMAL_ZERO);
    expect(decimalToString(absDecimal(d("-2.5")))).toBe("2.5");
    const positive = d("2.5");
    expect(absDecimal(positive)).toBe(positive);

    expect(compareDecimal(d("1.5"), d("1.50"))).toBe(0);
    expect(compareDecimal(d("1.49"), d("1.5"))).toBe(-1);
    expect(compareDecimal(d("-1"), d("-1.001"))).toBe(1);
    expect(decimalEquals(d("1.5"), d("1.50"))).toBe(true);
    expect(decimalEquals(d("1.5"), d("1.51"))).toBe(false);

    expect(isZeroDecimal(d("0.000"))).toBe(true);
    expect(isZeroDecimal(d("0.001"))).toBe(false);
    expect([d("-0.1"), d("0.00"), d("3")].map(signDecimal)).toEqual([-1, 0, 1]);
  });

  describe("properties", () => {
    it("addition is commutative and associative, subtraction inverts it", () => {
      fc.assert(
        fc.property(decimalArb, decimalArb, decimalArb, (a, b, c) => {
          expect(decimalEquals(addDecimal(a, b), addDecimal(b, a))).toBe(true);
          expect(
            decimalEquals(addDecimal(addDecimal(a, b), c), addDecimal(a, addDecimal(b, c))),
          ).toBe(true);
          expect(decimalEquals(subtractDecimal(addDecimal(a, b), b), a)).toBe(true);
          expect(isZeroDecimal(subtractDecimal(a, a))).toBe(true);
        }),
      );
    });

    it("multiplication is commutative and exact against its scale", () => {
      fc.assert(
        fc.property(decimalArb, decimalArb, (a, b) => {
          const product = multiplyDecimal(a, b);
          expect(decimalEquals(product, multiplyDecimal(b, a))).toBe(true);
          expect(product.coefficient).toBe(a.coefficient * b.coefficient);
          expect(product.scale).toBe(a.scale + b.scale);
          expect(decimalEquals(multiplyDecimal(a, DECIMAL_ONE), a)).toBe(true);
        }),
      );
    });

    it("division rounds the exact quotient correctly", () => {
      fc.assert(
        fc.property(
          decimalArb,
          decimalArb.filter((b) => b.coefficient !== 0n),
          fc.integer({ min: 0, max: 12 }),
          modeArb,
          (a, b, scale, mode) => {
            const q = divideDecimal(a, b, scale, mode);
            // q ≈ a / b  <=>  q.c × 10^-scale ≈ (a.c × 10^-a.s) / (b.c × 10^-b.s)
            // Exact value of q.c: a.c × 10^(b.s + scale) / (b.c × 10^a.s); make the denominator positive.
            let numerator = a.coefficient * 10n ** BigInt(b.scale + scale);
            let denominator = b.coefficient * 10n ** BigInt(a.scale);
            if (denominator < 0n) [numerator, denominator] = [-numerator, -denominator];
            return isCorrectRounding(q.coefficient, numerator, denominator, mode);
          },
        ),
      );
    });

    it("compare agrees with subtraction and normalization keeps the value", () => {
      fc.assert(
        fc.property(decimalArb, decimalArb, (a, b) => {
          expect(compareDecimal(a, b)).toBe(signDecimal(subtractDecimal(a, b)));
          expect(decimalEquals(normalizeDecimal(a), a)).toBe(true);
          expect(decimalEquals(negateDecimal(negateDecimal(a)), a)).toBe(true);
          expect(signDecimal(absDecimal(a))).toBeGreaterThanOrEqual(0);
        }),
      );
    });
  });

  it("rescales and divides exact ties in the direction of each mode", () => {
    fc.assert(
      fc.property(decimalTieArb, modeArb, ({ numerator, digits, quotient, negative }, mode) => {
        // numerator × 10^-digits is ±(quotient + ½).
        const expected = tieRounding(quotient, negative, mode);
        const tie = decimal(decimalToString({ coefficient: numerator, scale: digits }));
        expect(rescaleDecimal(tie, 0, mode).coefficient).toBe(expected);
        const divisor = decimalFromInteger(10n ** BigInt(digits));
        expect(divideDecimal(decimalFromInteger(numerator), divisor, 0, mode).coefficient).toBe(
          expected,
        );
      }),
    );
  });

  it("covers every rounding mode in rescaling", () => {
    expect(
      ROUNDING_MODES.map((mode) => decimalToString(rescaleDecimal(d("-2.5"), 0, mode))),
    ).toEqual(["-3", "-2", "-2", "-3", "-2", "-2", "-3"]);
  });
});
