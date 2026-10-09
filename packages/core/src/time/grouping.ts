import { Temporal } from "temporal-polyfill";
import {
  type EntryTimes,
  type LocalDate,
  compareBigint,
  instantFromEpochSeconds,
  parseNow,
  resolveInterval,
  withinDateRange,
  zonedAt,
} from "./instant";
import { splitEpochByLocalDay } from "./local-days";

export type GroupPeriod = "day" | "week" | "month";

export interface GroupOptions {
  /** IANA time zone the periods are measured in (`Europe/Rome`). */
  readonly timeZone: string;
  readonly period: GroupPeriod;
  /** ISO 8601 instant used to measure running entries. */
  readonly now?: string;
  /**
   * `true` (default): an entry spanning local midnight(s) is cut into one slice per local day, as
   * reports need. `false`: the entry is one slice that belongs to the local day it starts on, as
   * invoicing needs (design §7, step 1).
   */
  readonly splitAtMidnight?: boolean;
}

/** The whole entry, or the piece of it on one local day, inside a group. */
export interface EntrySlice<E extends EntryTimes> {
  readonly entry: E;
  /** The local day of the slice. */
  readonly date: LocalDate;
  /** UTC instants bounding the slice. */
  readonly start: string;
  readonly end: string;
  readonly seconds: bigint;
}

export interface PeriodGroup<E extends EntryTimes> {
  /** `2026-03-02` (day), `2026-W10` (ISO week) or `2026-03` (month). */
  readonly key: string;
  readonly period: GroupPeriod;
  /** First and last local day of the period (inclusive). A week runs Monday to Sunday. */
  readonly from: LocalDate;
  readonly to: LocalDate;
  /** Elapsed seconds of all slices. */
  readonly seconds: bigint;
  /** Chronological, ties in input order. */
  readonly slices: readonly EntrySlice<E>[];
}

interface Bucket {
  key: string;
  from: LocalDate;
  to: LocalDate;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

/** ISO 8601 week: the week (Monday to Sunday) belongs to the year of its Thursday. */
function isoWeekBucket(date: Temporal.PlainDate): Bucket {
  const monday = date.subtract({ days: date.dayOfWeek - 1 });
  const thursday = monday.add({ days: 3 });
  const daysIntoYear = thursday.dayOfYear - 1;
  const week = (daysIntoYear - (daysIntoYear % 7)) / 7 + 1;
  return {
    key: `${pad(thursday.year, 4)}-W${pad(week, 2)}`,
    from: monday.toString(),
    to: monday.add({ days: 6 }).toString(),
  };
}

function bucketOf(date: Temporal.PlainDate, period: GroupPeriod): Bucket {
  switch (period) {
    case "day": {
      const text = date.toString();
      return { key: text, from: text, to: text };
    }
    case "week":
      return isoWeekBucket(date);
    case "month":
      return {
        key: `${pad(date.year, 4)}-${pad(date.month, 2)}`,
        from: date.with({ day: 1 }).toString(),
        to: date.with({ day: date.daysInMonth }).toString(),
      };
  }
}

/**
 * The ISO week key (`2026-W10`) of a local date.
 * @throws InvalidDateError when `date` is not a valid `YYYY-MM-DD` or too far in the past or future
 */
export function isoWeekKey(date: LocalDate): string {
  return withinDateRange(() => isoWeekBucket(Temporal.PlainDate.from(date)).key);
}

interface OrderedSlice<E extends EntryTimes> {
  readonly slice: EntrySlice<E>;
  readonly startSeconds: bigint;
  readonly order: number;
}

/**
 * Groups entries by local day, ISO week (Monday start) or month in any IANA time zone, correct
 * across DST changes (a day can be 23, 23.5, 24.5 or 25 hours long). Groups come back in
 * chronological order; periods with no entries are not listed.
 * @throws InvalidInstantError, InvalidIntervalError, InvalidTimeZoneError, MissingClockError,
 *         InvalidDateError (an entry so close to the first or last date Temporal supports that its
 *         period, or its day, cannot be computed)
 */
export function groupEntries<E extends EntryTimes>(
  entries: readonly E[],
  options: GroupOptions,
): PeriodGroup<E>[] {
  const { timeZone, period, splitAtMidnight = true } = options;
  const nowSeconds = parseNow(options.now);
  const groups = new Map<string, { bucket: Bucket; slices: OrderedSlice<E>[] }>();
  let order = 0;

  for (const entry of entries) {
    const { startSeconds, endSeconds } = resolveInterval(entry, nowSeconds);
    const parts = splitAtMidnight
      ? splitEpochByLocalDay(startSeconds, endSeconds, timeZone)
      : [
          {
            date: zonedAt(startSeconds, timeZone).toPlainDate().toString(),
            startSeconds,
            endSeconds,
          },
        ];
    for (const part of parts) {
      const bucket = withinDateRange(() => bucketOf(Temporal.PlainDate.from(part.date), period));
      let group = groups.get(bucket.key);
      if (group === undefined) {
        group = { bucket, slices: [] };
        groups.set(bucket.key, group);
      }
      group.slices.push({
        startSeconds: part.startSeconds,
        order: order++,
        slice: {
          entry,
          date: part.date,
          start: instantFromEpochSeconds(part.startSeconds),
          end: instantFromEpochSeconds(part.endSeconds),
          seconds: part.endSeconds - part.startSeconds,
        },
      });
    }
  }

  // ISO dates compare chronologically as text.
  return [...groups.values()]
    .sort((a, b) => (a.bucket.from < b.bucket.from ? -1 : 1))
    .map(({ bucket, slices }) => {
      slices.sort((a, b) => compareBigint(a.startSeconds, b.startSeconds) || a.order - b.order);
      return {
        key: bucket.key,
        period,
        from: bucket.from,
        to: bucket.to,
        seconds: slices.reduce((sum, item) => sum + item.slice.seconds, 0n),
        slices: slices.map((item) => item.slice),
      };
    });
}
