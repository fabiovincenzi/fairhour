import * as z from "zod";
import { InvalidDurationError } from "../errors";
import { type EntryTimes, SECONDS_PER_MINUTE, parseNow, resolveInterval } from "./instant";

/**
 * Duration of an entry in whole seconds. A running entry (`end: null`) is measured up to the
 * injected `now` (an ISO 8601 instant); the package never reads the system clock.
 * @throws InvalidInstantError, InvalidIntervalError, MissingClockError
 */
export function entryDurationSeconds(entry: EntryTimes, now?: string): bigint {
  const { startSeconds, endSeconds } = resolveInterval(entry, parseNow(now));
  return endSeconds - startSeconds;
}

/** Sum of the durations of `entries`, in whole seconds. */
export function totalDurationSeconds(entries: readonly EntryTimes[], now?: string): bigint {
  const nowSeconds = parseNow(now);
  let total = 0n;
  for (const entry of entries) {
    const { startSeconds, endSeconds } = resolveInterval(entry, nowSeconds);
    total += endSeconds - startSeconds;
  }
  return total;
}

/**
 * How a project rounds tracked time before billing it (CORE-003). `step` rounds to a multiple of
 * 6, 15 or 30 minutes (0.1, 0.25 or 0.5 hours):
 *
 * - `up` takes the next multiple (a multiple stays as it is),
 * - `down` the previous one,
 * - `nearest` the closest one, and **a tie rounds up** (7 min 30 s to the 15-minute step is 15 min).
 */
export type DurationRounding =
  | { readonly kind: "none" }
  | {
      readonly kind: "step";
      readonly minutes: 6 | 15 | 30;
      readonly direction: "up" | "nearest" | "down";
    };

/** Validates untrusted configuration (project settings, API input) into a `DurationRounding`. */
export const durationRoundingSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("none") }),
  z.strictObject({
    kind: z.literal("step"),
    minutes: z.union([z.literal(6), z.literal(15), z.literal(30)]),
    direction: z.enum(["up", "nearest", "down"]),
  }),
]) satisfies z.ZodType<DurationRounding>;

/**
 * Rounds a duration in whole seconds with a project's rounding rule. Pure integer arithmetic.
 * @throws InvalidDurationError when `seconds` is negative
 */
export function roundDuration(seconds: bigint, rounding: DurationRounding): bigint {
  if (seconds < 0n) throw new InvalidDurationError();
  if (rounding.kind === "none") return seconds;
  const step = BigInt(rounding.minutes) * SECONDS_PER_MINUTE;
  const floor = (seconds / step) * step;
  const remainder = seconds - floor;
  if (remainder === 0n) return seconds;
  switch (rounding.direction) {
    case "down":
      return floor;
    case "up":
      return floor + step;
    case "nearest":
      return remainder * 2n >= step ? floor + step : floor;
  }
}
