import fc from "fast-check";
import { Temporal } from "temporal-polyfill";
import { describe, expect, it } from "vitest";
import { InvalidTimeZoneError, MissingClockError } from "../errors";
import { groupEntries, isoWeekKey } from "./grouping";

const h = (hours: number): bigint => BigInt(hours) * 3600n;

function summary<E extends { start: string; end: string | null }>(
  groups: ReturnType<typeof groupEntries<E>>,
): [string, string, string, bigint][] {
  return groups.map((g) => [g.key, g.from, g.to, g.seconds]);
}

describe("isoWeekKey", () => {
  it.each([
    ["2026-01-01", "2026-W01"], // Thursday: week 1 holds the year's first Thursday
    ["2025-12-29", "2026-W01"], // Monday of that week, still in December
    ["2026-01-04", "2026-W01"], // Sunday
    ["2026-01-05", "2026-W02"],
    ["2026-12-31", "2026-W53"], // 2026 has 53 weeks
    ["2027-01-01", "2026-W53"], // Friday belonging to the previous ISO year
    ["2027-01-04", "2027-W01"],
    ["2024-12-30", "2025-W01"],
    ["2021-01-03", "2020-W53"],
    ["2026-03-02", "2026-W10"],
    ["2026-03-08", "2026-W10"], // Sunday
  ])("%s is %s", (date, expected) => {
    expect(isoWeekKey(date)).toBe(expected);
  });

  it("agrees with Temporal's own ISO week number on every date", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 40_000 }), (offset) => {
        const date = Temporal.PlainDate.from("1950-01-01").add({ days: offset });
        const week = String(date.weekOfYear).padStart(2, "0");
        expect(isoWeekKey(date.toString())).toBe(`${String(date.yearOfWeek)}-W${week}`);
      }),
      { numRuns: 500 },
    );
  });
});

describe("groupEntries", () => {
  const entries = [
    { id: "a", start: "2026-03-02T08:00:00Z", end: "2026-03-02T10:00:00Z" }, // Mon
    { id: "b", start: "2026-03-02T13:00:00Z", end: "2026-03-02T13:30:00Z" }, // Mon
    { id: "c", start: "2026-03-08T09:00:00Z", end: "2026-03-08T10:00:00Z" }, // Sun, same ISO week
    { id: "d", start: "2026-03-09T09:00:00Z", end: "2026-03-09T11:00:00Z" }, // next Monday
    { id: "e", start: "2026-04-01T09:00:00Z", end: "2026-04-01T10:00:00Z" }, // April
  ];

  it("groups by local day, chronologically, and skips empty days", () => {
    const groups = groupEntries(entries, { timeZone: "UTC", period: "day" });
    expect(summary(groups)).toEqual([
      ["2026-03-02", "2026-03-02", "2026-03-02", h(2) + 1800n],
      ["2026-03-08", "2026-03-08", "2026-03-08", h(1)],
      ["2026-03-09", "2026-03-09", "2026-03-09", h(2)],
      ["2026-04-01", "2026-04-01", "2026-04-01", h(1)],
    ]);
    expect(groups[0]?.slices.map((s) => s.entry.id)).toEqual(["a", "b"]);
    expect(groups[0]?.period).toBe("day");
  });

  it("groups by ISO week with Monday start and Sunday end", () => {
    const groups = groupEntries(entries, { timeZone: "UTC", period: "week" });
    expect(summary(groups)).toEqual([
      ["2026-W10", "2026-03-02", "2026-03-08", h(3) + 1800n],
      ["2026-W11", "2026-03-09", "2026-03-15", h(2)],
      ["2026-W14", "2026-03-30", "2026-04-05", h(1)],
    ]);
  });

  it("groups by month, including February of a leap year", () => {
    const groups = groupEntries(
      [...entries, { id: "f", start: "2028-02-29T12:00:00Z", end: "2028-02-29T13:00:00Z" }],
      { timeZone: "UTC", period: "month" },
    );
    expect(summary(groups)).toEqual([
      ["2026-03", "2026-03-01", "2026-03-31", h(5) + 1800n],
      ["2026-04", "2026-04-01", "2026-04-30", h(1)],
      ["2028-02", "2028-02-01", "2028-02-29", h(1)],
    ]);
  });

  it("uses the local calendar of the requested zone", () => {
    const late = [{ start: "2026-03-02T23:30:00Z", end: "2026-03-02T23:45:00Z" }];
    expect(groupEntries(late, { timeZone: "Europe/Rome", period: "day" })[0]?.key).toBe(
      "2026-03-03",
    );
    expect(groupEntries(late, { timeZone: "America/New_York", period: "day" })[0]?.key).toBe(
      "2026-03-02",
    );
    // Sunday evening in New York is already Monday in Rome: different ISO weeks.
    const sunday = [{ start: "2026-03-08T23:30:00Z", end: "2026-03-08T23:45:00Z" }];
    const weekIn = (timeZone: string) => groupEntries(sunday, { timeZone, period: "week" })[0]?.key;
    expect(weekIn("America/New_York")).toBe("2026-W10");
    expect(weekIn("Pacific/Honolulu")).toBe("2026-W10");
    expect(weekIn("Europe/Rome")).toBe("2026-W11");
  });

  it("splits an entry that spans local midnight across the days it touches", () => {
    const night = [{ id: "n", start: "2026-03-02T21:30:00Z", end: "2026-03-02T23:30:00Z" }];
    const groups = groupEntries(night, { timeZone: "Europe/Rome", period: "day" });
    expect(summary(groups)).toEqual([
      ["2026-03-02", "2026-03-02", "2026-03-02", 5400n],
      ["2026-03-03", "2026-03-03", "2026-03-03", 1800n],
    ]);
    expect(groups[1]?.slices[0]).toMatchObject({
      date: "2026-03-03",
      start: "2026-03-02T23:00:00Z",
      end: "2026-03-02T23:30:00Z",
      seconds: 1800n,
    });
    expect(groups[1]?.slices[0]?.entry).toBe(night[0]);
  });

  it("splits across a week and a month boundary", () => {
    // Sunday 2026-03-29 22:00 UTC to Monday 2026-03-30 02:00 UTC in UTC: week 13 / week 14.
    const sundayNight = [{ start: "2026-03-29T22:00:00Z", end: "2026-03-30T02:00:00Z" }];
    expect(summary(groupEntries(sundayNight, { timeZone: "UTC", period: "week" }))).toEqual([
      ["2026-W13", "2026-03-23", "2026-03-29", h(2)],
      ["2026-W14", "2026-03-30", "2026-04-05", h(2)],
    ]);
    const monthEnd = [{ start: "2026-03-31T22:00:00Z", end: "2026-04-01T01:00:00Z" }];
    expect(summary(groupEntries(monthEnd, { timeZone: "UTC", period: "month" }))).toEqual([
      ["2026-03", "2026-03-01", "2026-03-31", h(2)],
      ["2026-04", "2026-04-01", "2026-04-30", h(1)],
    ]);
  });

  it("can keep an entry whole on the local day it starts (invoicing)", () => {
    const night = [{ start: "2026-03-02T21:30:00Z", end: "2026-03-02T23:30:00Z" }];
    const groups = groupEntries(night, {
      timeZone: "Europe/Rome",
      period: "day",
      splitAtMidnight: false,
    });
    expect(summary(groups)).toEqual([["2026-03-02", "2026-03-02", "2026-03-02", h(2)]]);
  });

  it("measures running entries with the injected clock", () => {
    const running = [{ start: "2026-03-02T08:00:00Z", end: null }];
    const groups = groupEntries(running, {
      timeZone: "UTC",
      period: "day",
      now: "2026-03-02T08:20:00Z",
    });
    expect(groups[0]?.seconds).toBe(1200n);
    expect(groups[0]?.slices[0]?.end).toBe("2026-03-02T08:20:00Z");
    expect(() => groupEntries(running, { timeZone: "UTC", period: "day" })).toThrow(
      MissingClockError,
    );
  });

  it("orders slices by start, ties by input order, whatever the input order", () => {
    const shuffled = [
      { id: "late", start: "2026-03-02T15:00:00Z", end: "2026-03-02T16:00:00Z" },
      { id: "tie1", start: "2026-03-02T08:00:00Z", end: "2026-03-02T09:00:00Z" },
      { id: "tie2", start: "2026-03-02T08:00:00Z", end: "2026-03-02T08:30:00Z" },
    ];
    const group = groupEntries(shuffled, { timeZone: "UTC", period: "day" })[0];
    expect(group?.slices.map((s) => s.entry.id)).toEqual(["tie1", "tie2", "late"]);
  });

  it("returns nothing for no entries and rejects bad zones", () => {
    expect(groupEntries([], { timeZone: "UTC", period: "month" })).toEqual([]);
    expect(() =>
      groupEntries([{ start: "2026-03-02T08:00:00Z", end: "2026-03-02T09:00:00Z" }], {
        timeZone: "Atlantis",
        period: "day",
      }),
    ).toThrow(InvalidTimeZoneError);
  });

  describe("DST-safe totals", () => {
    // One continuous entry covering a whole local day lands in one group with the day's real length.
    it.each([
      ["Europe/Rome", "2026-03-28T23:00:00Z", "2026-03-29T22:00:00Z", "2026-03-29", h(23)],
      ["Europe/Rome", "2026-10-24T22:00:00Z", "2026-10-25T23:00:00Z", "2026-10-25", h(25)],
      ["America/New_York", "2026-03-08T05:00:00Z", "2026-03-09T04:00:00Z", "2026-03-08", h(23)],
      ["America/New_York", "2026-11-01T04:00:00Z", "2026-11-02T05:00:00Z", "2026-11-01", h(25)],
      [
        "Australia/Lord_Howe",
        "2026-10-03T13:30:00Z",
        "2026-10-04T13:00:00Z",
        "2026-10-04",
        84_600n,
      ],
      [
        "Australia/Lord_Howe",
        "2026-04-04T13:00:00Z",
        "2026-04-05T13:30:00Z",
        "2026-04-05",
        88_200n,
      ],
    ])("%s whole day %s", (zone, start, end, key, seconds) => {
      const groups = groupEntries([{ start, end }], { timeZone: zone, period: "day" });
      expect(summary(groups)).toEqual([[key, key, key, seconds]]);
    });

    it("a week containing the Rome spring-forward day is 1 h shorter than 7 x 24 h", () => {
      // Monday 2026-03-23 00:00 CET .. Monday 2026-03-30 00:00 CEST, tracked without a break.
      const entry = [{ start: "2026-03-22T23:00:00Z", end: "2026-03-29T22:00:00Z" }];
      const groups = groupEntries(entry, { timeZone: "Europe/Rome", period: "week" });
      expect(summary(groups)).toEqual([["2026-W13", "2026-03-23", "2026-03-29", h(7 * 24 - 1)]]);
      const days = groupEntries(entry, { timeZone: "Europe/Rome", period: "day" });
      expect(days.map((d) => d.seconds)).toEqual([h(24), h(24), h(24), h(24), h(24), h(24), h(23)]);
    });

    it("a month containing the New York fall-back day is 1 h longer", () => {
      const entry = [{ start: "2026-11-01T04:00:00Z", end: "2026-12-01T05:00:00Z" }];
      const groups = groupEntries(entry, { timeZone: "America/New_York", period: "month" });
      expect(summary(groups)).toEqual([["2026-11", "2026-11-01", "2026-11-30", h(30 * 24 + 1)]]);
    });
  });

  it("slice seconds add up to the entry durations, in every period", () => {
    const zone = fc.constantFrom("UTC", "Europe/Rome", "America/New_York", "Australia/Lord_Howe");
    const period = fc.constantFrom("day" as const, "week" as const, "month" as const);
    const spans = fc.array(
      fc.record({
        start: fc.bigInt({ min: 1_700_000_000n, max: 1_800_000_000n }),
        length: fc.bigInt({ min: 0n, max: 3n * 86_400n }),
      }),
      { maxLength: 8 },
    );
    fc.assert(
      fc.property(zone, period, spans, (timeZone, grouping, items) => {
        const input = items.map(({ start, length }) => ({
          start: new Date(Number(start) * 1000).toISOString(),
          end: new Date(Number(start + length) * 1000).toISOString(),
        }));
        const groups = groupEntries(input, { timeZone, period: grouping });
        const total = items.reduce((sum, item) => sum + item.length, 0n);
        expect(groups.reduce((sum, g) => sum + g.seconds, 0n)).toBe(total);
        for (const group of groups) {
          expect(group.slices.reduce((sum, s) => sum + s.seconds, 0n)).toBe(group.seconds);
        }
        const keys = groups.map((g) => g.from);
        expect([...keys].sort()).toEqual(keys);
      }),
      { numRuns: 100 },
    );
  });
});
