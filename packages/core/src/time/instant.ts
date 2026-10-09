import { Temporal } from "temporal-polyfill";
import {
  InvalidInstantError,
  InvalidIntervalError,
  InvalidTimeZoneError,
  MissingClockError,
} from "../errors";

/** A calendar date in the ISO 8601 form `YYYY-MM-DD`, always local to some time zone. */
export type LocalDate = string;

/**
 * The time span of an entry. `start` and `end` are ISO 8601 instants carrying `Z` or a numeric UTC
 * offset (`2026-03-02T08:00:00Z`). A running entry has `end: null`.
 */
export interface EntryTimes {
  readonly start: string;
  readonly end: string | null;
}

export const NANOSECONDS_PER_SECOND = 1_000_000_000n;
export const SECONDS_PER_MINUTE = 60n;

/** Integer division rounding toward negative infinity (`/` on `bigint` truncates toward zero). */
export function floorDivide(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  const hasRemainder = numerator % denominator !== 0n;
  return hasRemainder && numerator < 0n !== denominator < 0n ? quotient - 1n : quotient;
}

export function compareBigint(a: bigint, b: bigint): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Seconds since the Unix epoch of an ISO 8601 instant. Sub-second precision is dropped (floored):
 * every duration in the package is a whole number of seconds, and flooring each instant first
 * keeps durations additive when an entry is split at any point.
 * @throws InvalidInstantError
 */
export function epochSeconds(instant: string): bigint {
  let nanoseconds: bigint;
  try {
    nanoseconds = Temporal.Instant.from(instant).epochNanoseconds;
  } catch {
    throw new InvalidInstantError(instant);
  }
  return floorDivide(nanoseconds, NANOSECONDS_PER_SECOND);
}

/** The canonical UTC text (`2026-03-02T08:00:00Z`) of a number of seconds since the epoch. */
export function instantFromEpochSeconds(seconds: bigint): string {
  return Temporal.Instant.fromEpochNanoseconds(seconds * NANOSECONDS_PER_SECOND).toString();
}

/** The wall-clock view of an instant in an IANA time zone. @throws InvalidTimeZoneError */
export function zonedAt(seconds: bigint, timeZone: string): Temporal.ZonedDateTime {
  try {
    return new Temporal.ZonedDateTime(seconds * NANOSECONDS_PER_SECOND, timeZone);
  } catch {
    throw new InvalidTimeZoneError(timeZone);
  }
}

/** The local calendar date of an instant in `timeZone`. */
export function localDateOf(instant: string, timeZone: string): LocalDate {
  return zonedAt(epochSeconds(instant), timeZone).toPlainDate().toString();
}

export interface EpochInterval {
  readonly startSeconds: bigint;
  readonly endSeconds: bigint;
}

/** `now` as epoch seconds, or `undefined` when no clock was injected. */
export function parseNow(now: string | undefined): bigint | undefined {
  return now === undefined ? undefined : epochSeconds(now);
}

/**
 * Resolves an entry to epoch seconds. A running entry ends at `now`, clamped to its start so that
 * a little clock skew between devices never yields a negative duration.
 * @throws InvalidInstantError, InvalidIntervalError (a stopped entry ends before it starts),
 *         MissingClockError (a running entry and no `now`)
 */
export function resolveInterval(entry: EntryTimes, nowSeconds: bigint | undefined): EpochInterval {
  const startSeconds = epochSeconds(entry.start);
  if (entry.end === null) {
    if (nowSeconds === undefined) throw new MissingClockError();
    return { startSeconds, endSeconds: nowSeconds > startSeconds ? nowSeconds : startSeconds };
  }
  const endSeconds = epochSeconds(entry.end);
  if (endSeconds < startSeconds) throw new InvalidIntervalError();
  return { startSeconds, endSeconds };
}
