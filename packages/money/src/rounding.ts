import { DivisionByZeroError } from "./errors";

/**
 * How a value that falls between two integers is rounded. There is no default: every function
 * that can produce a fraction of a minor unit takes the mode as a required argument.
 *
 * - `halfUp`    ties away from zero (ECMA-402 "halfExpand", Java HALF_UP): 2.5 -> 3, -2.5 -> -3
 * - `halfEven`  ties to the even neighbour (banker's rounding):           2.5 -> 2,  3.5 -> 4
 * - `halfDown`  ties toward zero:                                          2.5 -> 2, -2.5 -> -2
 * - `up`        away from zero:                                            2.1 -> 3, -2.1 -> -3
 * - `down`      toward zero (truncation):                                  2.9 -> 2, -2.9 -> -2
 * - `ceiling`   toward +infinity:                                          2.1 -> 3, -2.9 -> -2
 * - `floor`     toward -infinity:                                          2.9 -> 2, -2.1 -> -3
 */
export type RoundingMode = "halfUp" | "halfEven" | "halfDown" | "up" | "down" | "ceiling" | "floor";

/** Every rounding mode, in the order of the documentation table. */
export const ROUNDING_MODES: readonly RoundingMode[] = Object.freeze([
  "halfUp",
  "halfEven",
  "halfDown",
  "up",
  "down",
  "ceiling",
  "floor",
] as const);

export function isRoundingMode(value: string): value is RoundingMode {
  return (ROUNDING_MODES as readonly string[]).includes(value);
}

/**
 * @internal Throws a `TypeError` for an unknown mode (a programming error, possible only from
 * untyped code). Every function that takes a mode calls it first, before any shortcut that does
 * not need to round, so that a wrong mode fails on every input rather than only on inexact ones.
 */
export function assertRoundingMode(mode: RoundingMode): void {
  if (!isRoundingMode(mode)) {
    throw new TypeError(`Unknown rounding mode: expected one of ${ROUNDING_MODES.join(", ")}`);
  }
}

/**
 * `numerator / denominator` rounded to an integer with `mode`.
 *
 * The single rounding primitive: every other function in the package delegates to it.
 *
 * @throws DivisionByZeroError when `denominator` is `0n`
 * @throws TypeError when called (from untyped code) with non-bigint operands or an unknown mode
 */
export function divideAndRound(numerator: bigint, denominator: bigint, mode: RoundingMode): bigint {
  if (typeof numerator !== "bigint" || typeof denominator !== "bigint") {
    throw new TypeError("divideAndRound expects bigint operands");
  }
  assertRoundingMode(mode);
  if (denominator === 0n) throw new DivisionByZeroError();

  // 1. Make the denominator positive, so that the sign of the numerator is the sign of the result.
  const n = denominator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const q = n / d; // truncates toward zero
  const r = n % d; // same sign as n
  if (r === 0n) return q;

  // 2. Direction away from zero, and how the remainder compares with half the denominator.
  const s = n < 0n ? -1n : 1n;
  const twiceRemainder = 2n * (r < 0n ? -r : r);
  const c = twiceRemainder < d ? -1 : twiceRemainder > d ? 1 : 0;

  // 3. Pick the neighbour.
  switch (mode) {
    case "down":
      return q;
    case "up":
      return q + s;
    case "ceiling":
      return s > 0n ? q + 1n : q;
    case "floor":
      return s < 0n ? q - 1n : q;
    case "halfUp":
      return c >= 0 ? q + s : q;
    case "halfDown":
      return c > 0 ? q + s : q;
    case "halfEven":
      if (c > 0) return q + s;
      if (c < 0) return q;
      return q % 2n === 0n ? q : q + s;
  }
}
