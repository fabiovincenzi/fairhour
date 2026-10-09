import {
  type EntryTimes,
  type LocalDate,
  NANOSECONDS_PER_SECOND,
  instantFromEpochSeconds,
  parseNow,
  resolveInterval,
  withinDateRange,
  zonedAt,
} from "./instant";

/** The piece of an entry that falls on one local calendar day. */
export interface DayPart {
  /** The local date of the piece, in the requested time zone. */
  readonly date: LocalDate;
  /** UTC instants (`2026-03-28T23:00:00Z`) bounding the piece. */
  readonly start: string;
  readonly end: string;
  /** Whole seconds of elapsed time in the piece (23 h or 25 h on a DST day). */
  readonly seconds: bigint;
}

interface EpochDayPart {
  readonly date: LocalDate;
  readonly startSeconds: bigint;
  readonly endSeconds: bigint;
}

/**
 * Splits `[startSeconds, endSeconds]` at every local midnight of `timeZone`. A local midnight is
 * the start of the next calendar day as Temporal defines it, so a day shortened or lengthened by
 * a DST shift (23 h, 25 h, Lord Howe's 23.5 h and 24.5 h) is cut at the right instants, and a day
 * whose midnight does not exist starts at the first valid instant after the gap.
 * A zero-length interval yields one empty part.
 * @throws InvalidDateError when the interval reaches the last date Temporal supports
 */
export function splitEpochByLocalDay(
  startSeconds: bigint,
  endSeconds: bigint,
  timeZone: string,
): readonly EpochDayPart[] {
  const parts: EpochDayPart[] = [];
  let cursor = startSeconds;
  for (;;) {
    const zoned = zonedAt(cursor, timeZone);
    const date = zoned.toPlainDate();
    const nextMidnight = withinDateRange(
      () => date.add({ days: 1 }).toZonedDateTime(timeZone).epochNanoseconds,
    );
    const nextSeconds = nextMidnight / NANOSECONDS_PER_SECOND;
    const partEnd = nextSeconds < endSeconds ? nextSeconds : endSeconds;
    parts.push({ date: date.toString(), startSeconds: cursor, endSeconds: partEnd });
    if (partEnd === endSeconds) return parts;
    cursor = partEnd;
  }
}

/**
 * Splits an entry that spans local midnight(s) into one part per local day, for reporting. The
 * parts are contiguous, in chronological order, and their seconds add up to the entry's duration.
 * A running entry is measured up to `now`.
 * @throws InvalidInstantError, InvalidIntervalError, InvalidTimeZoneError, MissingClockError,
 *         InvalidDateError (an entry on the very last date Temporal supports)
 */
export function splitByLocalDay(entry: EntryTimes, timeZone: string, now?: string): DayPart[] {
  const { startSeconds, endSeconds } = resolveInterval(entry, parseNow(now));
  return splitEpochByLocalDay(startSeconds, endSeconds, timeZone).map((part) => ({
    date: part.date,
    start: instantFromEpochSeconds(part.startSeconds),
    end: instantFromEpochSeconds(part.endSeconds),
    seconds: part.endSeconds - part.startSeconds,
  }));
}
