import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  InvalidDurationError,
  InvalidInstantError,
  InvalidIntervalError,
  MissingClockError,
} from "../errors";
import {
  type DurationRounding,
  durationRoundingSchema,
  entryDurationSeconds,
  roundDuration,
  totalDurationSeconds,
} from "./duration";

describe("entryDurationSeconds", () => {
  it.each([
    ["one hour", "2026-03-02T08:00:00Z", "2026-03-02T09:00:00Z", 3600n],
    ["zero length", "2026-03-02T08:00:00Z", "2026-03-02T08:00:00Z", 0n],
    ["mixed offsets", "2026-03-02T09:00:00+01:00", "2026-03-02T03:30:00-05:00", 1800n],
    ["sub-second is floored", "2026-03-02T08:00:00.900Z", "2026-03-02T08:00:01.100Z", 1n],
    ["across a day", "2026-03-02T23:00:00Z", "2026-03-03T01:30:15Z", 9015n],
    ["before 1970", "1969-12-31T23:00:00Z", "1970-01-01T01:00:00Z", 7200n],
  ])("%s", (_name, start, end, expected) => {
    expect(entryDurationSeconds({ start, end })).toBe(expected);
  });

  it("measures a running entry up to the injected clock", () => {
    const entry = { start: "2026-03-02T08:00:00Z", end: null };
    expect(entryDurationSeconds(entry, "2026-03-02T08:45:00Z")).toBe(2700n);
  });

  it("never goes negative when the clock is behind the start of a running entry", () => {
    const entry = { start: "2026-03-02T08:00:00Z", end: null };
    expect(entryDurationSeconds(entry, "2026-03-02T07:59:00Z")).toBe(0n);
  });

  it("ignores the clock for a stopped entry", () => {
    const entry = { start: "2026-03-02T08:00:00Z", end: "2026-03-02T09:00:00Z" };
    expect(entryDurationSeconds(entry, "2030-01-01T00:00:00Z")).toBe(3600n);
  });

  it("throws typed errors", () => {
    const start = "2026-03-02T08:00:00Z";
    expect(() => entryDurationSeconds({ start, end: null })).toThrow(MissingClockError);
    expect(() => entryDurationSeconds({ start, end: "2026-03-02T07:00:00Z" })).toThrow(
      InvalidIntervalError,
    );
    expect(() => entryDurationSeconds({ start: "soon", end: start })).toThrow(InvalidInstantError);
    // An invalid clock is rejected even when the entry is stopped: fail fast.
    expect(() => entryDurationSeconds({ start, end: start }, "tomorrow")).toThrow(
      InvalidInstantError,
    );
  });
});

describe("totalDurationSeconds", () => {
  it("sums stopped and running entries", () => {
    const entries = [
      { start: "2026-03-02T08:00:00Z", end: "2026-03-02T09:00:00Z" },
      { start: "2026-03-02T10:00:00Z", end: null },
    ];
    expect(totalDurationSeconds(entries, "2026-03-02T10:30:00Z")).toBe(5400n);
    expect(totalDurationSeconds([])).toBe(0n);
    expect(() => totalDurationSeconds(entries)).toThrow(MissingClockError);
  });
});

const step = (minutes: 6 | 15 | 30, direction: "up" | "nearest" | "down"): DurationRounding => ({
  kind: "step",
  minutes,
  direction,
});

describe("roundDuration", () => {
  const m = (minutes: number, seconds = 0): bigint => BigInt(minutes * 60 + seconds);

  const cases: {
    name: string;
    seconds: bigint;
    rounding: DurationRounding;
    expected: bigint;
  }[] = [
    {
      name: "none keeps seconds",
      seconds: m(7, 31),
      rounding: { kind: "none" },
      expected: m(7, 31),
    },
    { name: "zero stays zero (up)", seconds: 0n, rounding: step(15, "up"), expected: 0n },
    { name: "6 up", seconds: m(1), rounding: step(6, "up"), expected: m(6) },
    { name: "6 up exact multiple", seconds: m(12), rounding: step(6, "up"), expected: m(12) },
    { name: "6 up one second over", seconds: m(12, 1), rounding: step(6, "up"), expected: m(18) },
    { name: "6 down", seconds: m(11, 59), rounding: step(6, "down"), expected: m(6) },
    { name: "6 nearest below tie", seconds: m(2, 59), rounding: step(6, "nearest"), expected: 0n },
    {
      name: "6 nearest tie rounds up",
      seconds: m(3),
      rounding: step(6, "nearest"),
      expected: m(6),
    },
    {
      name: "6 nearest above tie",
      seconds: m(8, 59),
      rounding: step(6, "nearest"),
      expected: m(6),
    },
    { name: "6 nearest second tie", seconds: m(9), rounding: step(6, "nearest"), expected: m(12) },
    { name: "15 up", seconds: m(16), rounding: step(15, "up"), expected: m(30) },
    { name: "15 down", seconds: m(29, 59), rounding: step(15, "down"), expected: m(15) },
    {
      name: "15 nearest below tie",
      seconds: m(7, 29),
      rounding: step(15, "nearest"),
      expected: 0n,
    },
    {
      name: "15 nearest tie rounds up",
      seconds: m(7, 30),
      rounding: step(15, "nearest"),
      expected: m(15),
    },
    {
      name: "15 nearest 52 minutes",
      seconds: m(52),
      rounding: step(15, "nearest"),
      expected: m(45),
    },
    {
      name: "15 nearest 53 minutes",
      seconds: m(53),
      rounding: step(15, "nearest"),
      expected: m(60),
    },
    { name: "30 up", seconds: m(31), rounding: step(30, "up"), expected: m(60) },
    { name: "30 down", seconds: m(59, 59), rounding: step(30, "down"), expected: m(30) },
    {
      name: "30 nearest below tie",
      seconds: m(14, 59),
      rounding: step(30, "nearest"),
      expected: 0n,
    },
    { name: "30 nearest tie", seconds: m(15), rounding: step(30, "nearest"), expected: m(30) },
    {
      name: "30 nearest long",
      seconds: m(8 * 60 + 14),
      rounding: step(30, "nearest"),
      expected: m(480),
    },
    { name: "one second up at 30", seconds: 1n, rounding: step(30, "up"), expected: m(30) },
  ];

  it.each(cases)("$name", ({ seconds, rounding, expected }) => {
    expect(roundDuration(seconds, rounding)).toBe(expected);
  });

  it("rejects negative durations", () => {
    expect(() => roundDuration(-1n, { kind: "none" })).toThrow(InvalidDurationError);
    expect(() => roundDuration(-1n, step(15, "up"))).toThrow(InvalidDurationError);
  });

  const roundings = fc.record({
    kind: fc.constant("step" as const),
    minutes: fc.constantFrom(6 as const, 15 as const, 30 as const),
    direction: fc.constantFrom("up" as const, "nearest" as const, "down" as const),
  });
  const seconds = fc.bigInt({ min: 0n, max: 10n ** 9n });

  it("lands on a multiple of the step, within one step of the input", () => {
    fc.assert(
      fc.property(seconds, roundings, (value, rounding) => {
        const size = BigInt(rounding.minutes) * 60n;
        const rounded = roundDuration(value, rounding);
        expect(rounded % size).toBe(0n);
        const distance = rounded > value ? rounded - value : value - rounded;
        expect(distance < size).toBe(true);
        if (rounding.direction === "up") expect(rounded >= value).toBe(true);
        if (rounding.direction === "down") expect(rounded <= value).toBe(true);
        if (rounding.direction === "nearest") expect(distance * 2n <= size).toBe(true);
      }),
    );
  });

  it("is idempotent and monotone", () => {
    fc.assert(
      fc.property(seconds, seconds, roundings, (a, b, rounding) => {
        const once = roundDuration(a, rounding);
        expect(roundDuration(once, rounding)).toBe(once);
        const [low, high] = a <= b ? [a, b] : [b, a];
        expect(roundDuration(low, rounding) <= roundDuration(high, rounding)).toBe(true);
      }),
    );
  });

  it("orders down <= nearest <= up", () => {
    fc.assert(
      fc.property(
        seconds,
        fc.constantFrom(6 as const, 15 as const, 30 as const),
        (value, minutes) => {
          const down = roundDuration(value, step(minutes, "down"));
          const nearest = roundDuration(value, step(minutes, "nearest"));
          const up = roundDuration(value, step(minutes, "up"));
          expect(down <= nearest && nearest <= up).toBe(true);
        },
      ),
    );
  });
});

describe("durationRoundingSchema", () => {
  it.each([
    { kind: "none" },
    { kind: "step", minutes: 6, direction: "up" },
    { kind: "step", minutes: 15, direction: "nearest" },
    { kind: "step", minutes: 30, direction: "down" },
  ])("accepts %j", (value) => {
    expect(durationRoundingSchema.parse(value)).toEqual(value);
  });

  it.each([
    { kind: "step", minutes: 10, direction: "up" },
    { kind: "step", minutes: 15 },
    { kind: "step", minutes: 15, direction: "sideways" },
    { kind: "none", minutes: 15 },
    { kind: "weekly" },
    "none",
    null,
  ])("rejects %j", (value) => {
    expect(durationRoundingSchema.safeParse(value).success).toBe(false);
  });
});
