import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { InvalidDateError, InvalidTimeZoneError, MissingClockError } from "../errors";
import { epochSeconds } from "./instant";
import { type DayPart, splitByLocalDay } from "./local-days";

const h = (hours: number): bigint => BigInt(hours) * 3600n;

function simplified(parts: DayPart[]): [string, string, string, bigint][] {
  return parts.map((p) => [p.date, p.start, p.end, p.seconds]);
}

describe("splitByLocalDay", () => {
  it("returns a single part for an entry inside one local day", () => {
    expect(
      simplified(
        splitByLocalDay(
          { start: "2026-03-02T08:00:00Z", end: "2026-03-02T09:30:00Z" },
          "Europe/Rome",
        ),
      ),
    ).toEqual([["2026-03-02", "2026-03-02T08:00:00Z", "2026-03-02T09:30:00Z", 5400n]]);
  });

  it("splits at local midnight, not at UTC midnight", () => {
    // 22:30 to 00:30 in Rome (UTC+1 in winter): the cut is at 23:00Z.
    expect(
      simplified(
        splitByLocalDay(
          { start: "2026-03-02T21:30:00Z", end: "2026-03-02T23:30:00Z" },
          "Europe/Rome",
        ),
      ),
    ).toEqual([
      ["2026-03-02", "2026-03-02T21:30:00Z", "2026-03-02T23:00:00Z", 5400n],
      ["2026-03-03", "2026-03-02T23:00:00Z", "2026-03-02T23:30:00Z", 1800n],
    ]);
  });

  it("does not split an entry that ends exactly at local midnight", () => {
    expect(
      simplified(
        splitByLocalDay(
          { start: "2026-03-02T22:00:00Z", end: "2026-03-02T23:00:00Z" },
          "Europe/Rome",
        ),
      ),
    ).toEqual([["2026-03-02", "2026-03-02T22:00:00Z", "2026-03-02T23:00:00Z", 3600n]]);
  });

  it("keeps a zero-length entry as one empty part", () => {
    expect(
      simplified(
        splitByLocalDay(
          { start: "2026-03-02T23:00:00Z", end: "2026-03-02T23:00:00Z" },
          "Europe/Rome",
        ),
      ),
    ).toEqual([["2026-03-03", "2026-03-02T23:00:00Z", "2026-03-02T23:00:00Z", 0n]]);
  });

  it("splits a multi-day entry into one part per day, middle days complete", () => {
    const parts = splitByLocalDay(
      { start: "2026-03-02T12:00:00Z", end: "2026-03-05T12:00:00Z" },
      "UTC",
    );
    expect(parts.map((p) => [p.date, p.seconds])).toEqual([
      ["2026-03-02", h(12)],
      ["2026-03-03", h(24)],
      ["2026-03-04", h(24)],
      ["2026-03-05", h(12)],
    ]);
  });

  it("measures a running entry up to now", () => {
    const parts = splitByLocalDay(
      { start: "2026-03-02T21:30:00Z", end: null },
      "Europe/Rome",
      "2026-03-02T23:30:00Z",
    );
    expect(parts.map((p) => p.seconds)).toEqual([5400n, 1800n]);
    expect(() => splitByLocalDay({ start: "2026-03-02T21:30:00Z", end: null }, "UTC")).toThrow(
      MissingClockError,
    );
  });

  it("rejects an unknown zone", () => {
    expect(() =>
      splitByLocalDay(
        { start: "2026-03-02T08:00:00Z", end: "2026-03-02T09:00:00Z" },
        "Nowhere/Land",
      ),
    ).toThrow(InvalidTimeZoneError);
  });

  describe("DST transitions", () => {
    // [name, zone, start, end, expected [date, start, end, seconds][]]
    // Instants below were derived by hand from the published UTC offsets of each zone:
    //   Europe/Rome       CET +01:00 -> CEST +02:00 on 2026-03-29 01:00Z; back on 2026-10-25 01:00Z
    //   America/New_York  EST -05:00 -> EDT -04:00 on 2026-03-08 07:00Z; back on 2026-11-01 06:00Z
    //   Australia/Lord_Howe  LHDT +11:00 -> LHST +10:30 on 2026-04-04 15:00Z (half-hour shift),
    //                        and +10:30 -> +11:00 on 2026-10-03 15:30Z
    const cases: [string, string, string, string, [string, string, string, bigint][]][] = [
      [
        "Rome spring forward (23 h day)",
        "Europe/Rome",
        "2026-03-28T22:30:00Z",
        "2026-03-29T22:30:00Z",
        [
          ["2026-03-28", "2026-03-28T22:30:00Z", "2026-03-28T23:00:00Z", 1800n],
          ["2026-03-29", "2026-03-28T23:00:00Z", "2026-03-29T22:00:00Z", h(23)],
          ["2026-03-30", "2026-03-29T22:00:00Z", "2026-03-29T22:30:00Z", 1800n],
        ],
      ],
      [
        "Rome fall back (25 h day)",
        "Europe/Rome",
        "2026-10-24T21:00:00Z",
        "2026-10-26T00:00:00Z",
        [
          ["2026-10-24", "2026-10-24T21:00:00Z", "2026-10-24T22:00:00Z", 3600n],
          ["2026-10-25", "2026-10-24T22:00:00Z", "2026-10-25T23:00:00Z", h(25)],
          ["2026-10-26", "2026-10-25T23:00:00Z", "2026-10-26T00:00:00Z", 3600n],
        ],
      ],
      [
        "New York spring forward (23 h day)",
        "America/New_York",
        "2026-03-08T04:00:00Z",
        "2026-03-09T05:00:00Z",
        [
          ["2026-03-07", "2026-03-08T04:00:00Z", "2026-03-08T05:00:00Z", 3600n],
          ["2026-03-08", "2026-03-08T05:00:00Z", "2026-03-09T04:00:00Z", h(23)],
          ["2026-03-09", "2026-03-09T04:00:00Z", "2026-03-09T05:00:00Z", 3600n],
        ],
      ],
      [
        "New York fall back (25 h day)",
        "America/New_York",
        "2026-11-01T03:00:00Z",
        "2026-11-02T06:00:00Z",
        [
          ["2026-10-31", "2026-11-01T03:00:00Z", "2026-11-01T04:00:00Z", 3600n],
          ["2026-11-01", "2026-11-01T04:00:00Z", "2026-11-02T05:00:00Z", h(25)],
          ["2026-11-02", "2026-11-02T05:00:00Z", "2026-11-02T06:00:00Z", 3600n],
        ],
      ],
      [
        "Lord Howe DST starts (23.5 h day)",
        "Australia/Lord_Howe",
        "2026-10-03T13:00:00Z",
        "2026-10-04T13:30:00Z",
        [
          ["2026-10-03", "2026-10-03T13:00:00Z", "2026-10-03T13:30:00Z", 1800n],
          ["2026-10-04", "2026-10-03T13:30:00Z", "2026-10-04T13:00:00Z", 84_600n],
          ["2026-10-05", "2026-10-04T13:00:00Z", "2026-10-04T13:30:00Z", 1800n],
        ],
      ],
      [
        "Lord Howe DST ends (24.5 h day)",
        "Australia/Lord_Howe",
        "2026-04-04T12:30:00Z",
        "2026-04-05T14:00:00Z",
        [
          ["2026-04-04", "2026-04-04T12:30:00Z", "2026-04-04T13:00:00Z", 1800n],
          ["2026-04-05", "2026-04-04T13:00:00Z", "2026-04-05T13:30:00Z", 88_200n],
          ["2026-04-06", "2026-04-05T13:30:00Z", "2026-04-05T14:00:00Z", 1800n],
        ],
      ],
    ];

    it.each(cases)("%s", (_name, zone, start, end, expected) => {
      expect(simplified(splitByLocalDay({ start, end }, zone))).toEqual(expected);
    });

    it.each([
      [
        "Europe/Rome 23 h day",
        "Europe/Rome",
        "2026-03-28T23:00:00Z",
        "2026-03-29T22:00:00Z",
        "2026-03-29",
        h(23),
      ],
      [
        "Europe/Rome 25 h day",
        "Europe/Rome",
        "2026-10-24T22:00:00Z",
        "2026-10-25T23:00:00Z",
        "2026-10-25",
        h(25),
      ],
      [
        "New York 23 h day",
        "America/New_York",
        "2026-03-08T05:00:00Z",
        "2026-03-09T04:00:00Z",
        "2026-03-08",
        h(23),
      ],
      [
        "New York 25 h day",
        "America/New_York",
        "2026-11-01T04:00:00Z",
        "2026-11-02T05:00:00Z",
        "2026-11-01",
        h(25),
      ],
      [
        "Lord Howe 23.5 h day",
        "Australia/Lord_Howe",
        "2026-10-03T13:30:00Z",
        "2026-10-04T13:00:00Z",
        "2026-10-04",
        84_600n,
      ],
      [
        "Lord Howe 24.5 h day",
        "Australia/Lord_Howe",
        "2026-04-04T13:00:00Z",
        "2026-04-05T13:30:00Z",
        "2026-04-05",
        88_200n,
      ],
    ])("a whole local day is one part: %s", (_name, zone, start, end, date, seconds) => {
      expect(simplified(splitByLocalDay({ start, end }, zone))).toEqual([
        [date, start, end, seconds],
      ]);
    });

    it("a local day that has no midnight (America/Sao_Paulo 2018-11-04) starts at 01:00", () => {
      // Brazil used to spring forward at 00:00 -> 01:00: local midnight did not exist that day.
      const parts = splitByLocalDay(
        { start: "2018-11-04T00:00:00Z", end: "2018-11-05T06:00:00Z" },
        "America/Sao_Paulo",
      );
      expect(parts.map((p) => p.date)).toEqual(["2018-11-03", "2018-11-04", "2018-11-05"]);
      expect(parts[1]?.start).toBe("2018-11-04T03:00:00Z");
      expect(parts[1]?.seconds).toBe(h(23));
    });
  });

  it("parts are contiguous, ordered and add up to the entry duration (any zone, any length)", () => {
    const zones = [
      "UTC",
      "Europe/Rome",
      "America/New_York",
      "Australia/Lord_Howe",
      "Asia/Kolkata",
      "Pacific/Kiritimati",
      "America/St_Johns",
      "Pacific/Apia",
    ];
    fc.assert(
      fc.property(
        fc.constantFrom(...zones),
        fc.bigInt({ min: 1_577_836_800n, max: 1_893_456_000n }), // 2020 .. 2029
        fc.bigInt({ min: 0n, max: 40n * 86_400n }),
        (zone, startSeconds, length) => {
          const start = new Date(Number(startSeconds) * 1000).toISOString();
          const end = new Date(Number(startSeconds + length) * 1000).toISOString();
          const parts = splitByLocalDay({ start, end }, zone);
          expect(parts.reduce((sum, p) => sum + p.seconds, 0n)).toBe(length);
          expect(epochSeconds(parts[0]?.start ?? "")).toBe(startSeconds);
          expect(epochSeconds(parts.at(-1)?.end ?? "")).toBe(startSeconds + length);
          parts.forEach((part, i) => {
            if (i > 0) expect(part.start).toBe(parts[i - 1]?.end);
            if (length > 0n) expect(part.seconds > 0n).toBe(true);
            expect(part.seconds <= 25n * 3600n).toBe(true);
          });
          expect(new Set(parts.map((p) => p.date)).size).toBe(parts.length);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("the last date Temporal supports", () => {
  it("is an InvalidDateError, not a bare RangeError", () => {
    const entry = { start: "+275760-09-13T00:00:00Z", end: "+275760-09-13T00:00:00Z" };
    expect(() => splitByLocalDay(entry, "UTC")).toThrow(InvalidDateError);
    expect(() => splitByLocalDay(entry, "UTC")).not.toThrow(RangeError);
  });
});
