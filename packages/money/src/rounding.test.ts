import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { isCorrectRounding, modeArb, tieArb, tieRounding } from "../test/arbitraries";
import { DivisionByZeroError } from "./errors";
import { ROUNDING_MODES, assertRoundingMode, divideAndRound, isRoundingMode } from "./rounding";
import type { RoundingMode } from "./rounding";

/** The reference table of design section 3.3: exact value as numerator / 10, then each mode. */
const REFERENCE: readonly (readonly [string, bigint, Record<RoundingMode, bigint>])[] = [
  [
    "2.5",
    25n,
    { halfUp: 3n, halfEven: 2n, halfDown: 2n, up: 3n, down: 2n, ceiling: 3n, floor: 2n },
  ],
  [
    "-2.5",
    -25n,
    { halfUp: -3n, halfEven: -2n, halfDown: -2n, up: -3n, down: -2n, ceiling: -2n, floor: -3n },
  ],
  [
    "3.5",
    35n,
    { halfUp: 4n, halfEven: 4n, halfDown: 3n, up: 4n, down: 3n, ceiling: 4n, floor: 3n },
  ],
  [
    "2.4",
    24n,
    { halfUp: 2n, halfEven: 2n, halfDown: 2n, up: 3n, down: 2n, ceiling: 3n, floor: 2n },
  ],
  [
    "-2.6",
    -26n,
    { halfUp: -3n, halfEven: -3n, halfDown: -3n, up: -3n, down: -2n, ceiling: -2n, floor: -3n },
  ],
  ["0.5", 5n, { halfUp: 1n, halfEven: 0n, halfDown: 0n, up: 1n, down: 0n, ceiling: 1n, floor: 0n }],
  [
    "-0.5",
    -5n,
    { halfUp: -1n, halfEven: 0n, halfDown: 0n, up: -1n, down: 0n, ceiling: 0n, floor: -1n },
  ],
  ["7", 70n, { halfUp: 7n, halfEven: 7n, halfDown: 7n, up: 7n, down: 7n, ceiling: 7n, floor: 7n }],
  // Beyond the reference table: more ties and non-ties on both sides of zero.
  [
    "-3.5",
    -35n,
    { halfUp: -4n, halfEven: -4n, halfDown: -3n, up: -4n, down: -3n, ceiling: -3n, floor: -4n },
  ],
  [
    "2.6",
    26n,
    { halfUp: 3n, halfEven: 3n, halfDown: 3n, up: 3n, down: 2n, ceiling: 3n, floor: 2n },
  ],
  [
    "-2.4",
    -24n,
    { halfUp: -2n, halfEven: -2n, halfDown: -2n, up: -3n, down: -2n, ceiling: -2n, floor: -3n },
  ],
  [
    "-2.1",
    -21n,
    { halfUp: -2n, halfEven: -2n, halfDown: -2n, up: -3n, down: -2n, ceiling: -2n, floor: -3n },
  ],
  [
    "2.9",
    29n,
    { halfUp: 3n, halfEven: 3n, halfDown: 3n, up: 3n, down: 2n, ceiling: 3n, floor: 2n },
  ],
  ["0.1", 1n, { halfUp: 0n, halfEven: 0n, halfDown: 0n, up: 1n, down: 0n, ceiling: 1n, floor: 0n }],
  [
    "-0.1",
    -1n,
    { halfUp: 0n, halfEven: 0n, halfDown: 0n, up: -1n, down: 0n, ceiling: 0n, floor: -1n },
  ],
  ["0", 0n, { halfUp: 0n, halfEven: 0n, halfDown: 0n, up: 0n, down: 0n, ceiling: 0n, floor: 0n }],
];

describe("divideAndRound", () => {
  describe.each(REFERENCE)("%s", (_label, numerator, expected) => {
    it.each(ROUNDING_MODES)("%s", (mode) => {
      expect(divideAndRound(numerator, 10n, mode)).toBe(expected[mode]);
      // A negative denominator gives the same result as negating both operands.
      expect(divideAndRound(-numerator, -10n, mode)).toBe(expected[mode]);
    });
  });

  it("handles a negative denominator with a positive numerator", () => {
    expect(divideAndRound(5n, -2n, "halfUp")).toBe(-3n);
    expect(divideAndRound(5n, -2n, "ceiling")).toBe(-2n);
    expect(divideAndRound(5n, -2n, "floor")).toBe(-3n);
    expect(divideAndRound(5n, -2n, "halfEven")).toBe(-2n);
    expect(divideAndRound(7n, -2n, "halfEven")).toBe(-4n);
  });

  it("returns zero for a zero numerator in every mode", () => {
    for (const mode of ROUNDING_MODES) {
      expect(divideAndRound(0n, 7n, mode)).toBe(0n);
      expect(divideAndRound(0n, -7n, mode)).toBe(0n);
    }
  });

  it("is exact for huge operands", () => {
    const big = 10n ** 60n + 5n;
    expect(divideAndRound(big, 10n, "halfUp")).toBe(10n ** 59n + 1n);
    expect(divideAndRound(big, 10n, "halfEven")).toBe(10n ** 59n);
    expect(divideAndRound(-big, 10n, "halfDown")).toBe(-(10n ** 59n));
  });

  it("throws DivisionByZeroError for a zero denominator", () => {
    for (const mode of ROUNDING_MODES) {
      expect(() => divideAndRound(1n, 0n, mode)).toThrow(DivisionByZeroError);
    }
  });

  it("rejects non-bigint operands and unknown modes from untyped callers", () => {
    expect(() => divideAndRound(1 as unknown as bigint, 2n, "halfUp")).toThrow(TypeError);
    expect(() => divideAndRound(1n, 2 as unknown as bigint, "halfUp")).toThrow(TypeError);
    expect(() => divideAndRound(4n, 2n, "nearest" as RoundingMode)).toThrow(TypeError);
    // The mode is checked before the division by zero, too.
    expect(() => divideAndRound(4n, 0n, "nearest" as RoundingMode)).toThrow(TypeError);
  });

  describe("properties", () => {
    const numeratorArb = fc.bigInt({ min: -(10n ** 30n), max: 10n ** 30n });
    const denominatorArb = fc.bigInt({ min: 1n, max: 10n ** 20n });

    it("is within half a unit for half modes and less than one unit otherwise", () => {
      fc.assert(
        fc.property(numeratorArb, denominatorArb, modeArb, (n, d, mode) =>
          isCorrectRounding(divideAndRound(n, d, mode), n, d, mode),
        ),
      );
    });

    it("rounds exact ties in the direction of each mode, whatever the sign", () => {
      fc.assert(
        fc.property(tieArb, modeArb, ({ numerator, denominator, quotient, negative }, mode) => {
          const expected = tieRounding(quotient, negative, mode);
          expect(divideAndRound(numerator, denominator, mode)).toBe(expected);
          expect(divideAndRound(-numerator, -denominator, mode)).toBe(expected);
          expect(isCorrectRounding(expected, numerator, denominator, mode)).toBe(true);
        }),
      );
    });

    it("checks the tie direction in its oracle (swapped half modes are caught)", () => {
      fc.assert(
        fc.property(tieArb, ({ numerator, denominator, quotient, negative }) => {
          const up = tieRounding(quotient, negative, "halfUp");
          const down = tieRounding(quotient, negative, "halfDown");
          expect(isCorrectRounding(down, numerator, denominator, "halfUp")).toBe(false);
          expect(isCorrectRounding(up, numerator, denominator, "halfDown")).toBe(false);
          const odd = quotient % 2n === 0n ? up : down;
          expect(isCorrectRounding(odd, numerator, denominator, "halfEven")).toBe(false);
        }),
      );
    });

    it("is monotonic", () => {
      fc.assert(
        fc.property(numeratorArb, numeratorArb, denominatorArb, modeArb, (a, b, d, mode) => {
          const [low, high] = a <= b ? [a, b] : [b, a];
          return divideAndRound(low, d, mode) <= divideAndRound(high, d, mode);
        }),
      );
    });

    it("is exact on multiples and orders the directed modes", () => {
      fc.assert(
        fc.property(numeratorArb, denominatorArb, (n, d) => {
          for (const mode of ROUNDING_MODES) expect(divideAndRound(n * d, d, mode)).toBe(n);
          const floor = divideAndRound(n, d, "floor");
          const ceiling = divideAndRound(n, d, "ceiling");
          expect(floor * d <= n && n <= ceiling * d).toBe(true);
          expect(ceiling - floor).toBe(n % d === 0n ? 0n : 1n);
        }),
      );
    });

    it("is symmetric for the sign-symmetric modes; ceiling mirrors floor", () => {
      fc.assert(
        fc.property(numeratorArb, denominatorArb, (n, d) => {
          for (const mode of ["halfUp", "halfEven", "halfDown", "up", "down"] as const) {
            expect(divideAndRound(-n, d, mode)).toBe(-divideAndRound(n, d, mode));
          }
          expect(divideAndRound(-n, d, "ceiling")).toBe(-divideAndRound(n, d, "floor"));
        }),
      );
    });
  });
});

describe("rounding modes", () => {
  it("lists the seven modes", () => {
    expect(ROUNDING_MODES).toEqual([
      "halfUp",
      "halfEven",
      "halfDown",
      "up",
      "down",
      "ceiling",
      "floor",
    ]);
    expect(Object.isFrozen(ROUNDING_MODES)).toBe(true);
  });

  it("recognizes modes", () => {
    for (const mode of ROUNDING_MODES) expect(isRoundingMode(mode)).toBe(true);
    for (const value of ["HALF_UP", "halfup", "nearest", "", "round"]) {
      expect(isRoundingMode(value)).toBe(false);
    }
  });

  it("asserts modes with a TypeError that lists the valid ones", () => {
    for (const mode of ROUNDING_MODES) {
      expect(() => {
        assertRoundingMode(mode);
      }).not.toThrow();
    }
    for (const value of ["HALF_UP", "", undefined, null, 2, {}]) {
      expect(() => {
        assertRoundingMode(value as RoundingMode);
      }).toThrow(
        new TypeError(
          "Unknown rounding mode: expected one of halfUp, halfEven, halfDown, up, down, ceiling, floor",
        ),
      );
    }
  });
});
