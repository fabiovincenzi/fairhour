import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  InvalidInstantError,
  InvalidIntervalError,
  InvalidTimeZoneError,
  MissingClockError,
} from "../errors";
import {
  compareBigint,
  epochSeconds,
  floorDivide,
  instantFromEpochSeconds,
  localDateOf,
  parseNow,
  resolveInterval,
  zonedAt,
} from "./instant";

describe("floorDivide", () => {
  it.each([
    [7n, 2n, 3n],
    [-7n, 2n, -4n],
    [7n, -2n, -4n],
    [-7n, -2n, 3n],
    [6n, 3n, 2n],
    [-6n, 3n, -2n],
    [0n, 5n, 0n],
  ])("%d / %d = %d", (a, b, expected) => {
    expect(floorDivide(a, b)).toBe(expected);
  });

  it("agrees with the mathematical floor for any operands", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: -(10n ** 15n), max: 10n ** 15n }),
        fc.bigInt({ min: 1n, max: 10n ** 6n }),
        (a, b) => {
          const q = floorDivide(a, b);
          expect(q * b <= a && a < (q + 1n) * b).toBe(true);
        },
      ),
    );
  });
});

describe("compareBigint", () => {
  it("orders", () => {
    expect([compareBigint(1n, 2n), compareBigint(2n, 2n), compareBigint(3n, 2n)]).toEqual([
      -1, 0, 1,
    ]);
  });
});

describe("epochSeconds", () => {
  it.each([
    ["1970-01-01T00:00:00Z", 0n],
    ["2026-03-02T08:00:00Z", 1772438400n],
    ["2026-03-02T09:00:00+01:00", 1772438400n],
    ["2026-03-02T03:00:00-05:00", 1772438400n],
    ["2026-03-02T08:00:00.999Z", 1772438400n],
    ["1969-12-31T23:59:59.500Z", -1n],
    ["1969-12-31T23:59:59Z", -1n],
  ])("%s -> %d", (text, expected) => {
    expect(epochSeconds(text)).toBe(expected);
  });

  it.each(["", "2026-03-02", "2026-03-02T08:00:00", "yesterday", "2026-13-01T00:00:00Z"])(
    "rejects %j",
    (text) => {
      expect(() => epochSeconds(text)).toThrow(InvalidInstantError);
    },
  );

  it("round-trips through instantFromEpochSeconds", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: -5_000_000_000n, max: 10_000_000_000n }), (seconds) => {
        expect(epochSeconds(instantFromEpochSeconds(seconds))).toBe(seconds);
      }),
    );
    expect(instantFromEpochSeconds(1772438400n)).toBe("2026-03-02T08:00:00Z");
  });
});

describe("zonedAt and localDateOf", () => {
  it("views an instant in a zone", () => {
    expect(zonedAt(1772438400n, "Europe/Rome").toString()).toBe(
      "2026-03-02T09:00:00+01:00[Europe/Rome]",
    );
  });

  it("rejects unknown zones", () => {
    expect(() => zonedAt(0n, "Mars/Olympus")).toThrow(InvalidTimeZoneError);
    expect(() => localDateOf("2026-03-02T08:00:00Z", "")).toThrow(InvalidTimeZoneError);
  });

  it.each([
    ["2026-03-02T23:30:00Z", "Europe/Rome", "2026-03-03"],
    ["2026-03-02T23:30:00Z", "America/New_York", "2026-03-02"],
    ["2026-03-02T23:30:00Z", "Pacific/Kiritimati", "2026-03-03"],
    ["2026-03-02T23:30:00Z", "UTC", "2026-03-02"],
  ])("local date of %s in %s is %s", (instant, zone, expected) => {
    expect(localDateOf(instant, zone)).toBe(expected);
  });
});

describe("resolveInterval", () => {
  const start = "2026-03-02T08:00:00Z";

  it("measures a stopped entry", () => {
    expect(resolveInterval({ start, end: "2026-03-02T09:00:00Z" }, undefined)).toEqual({
      startSeconds: 1772438400n,
      endSeconds: 1772442000n,
    });
  });

  it("measures a running entry up to now, clamped to its start", () => {
    expect(resolveInterval({ start, end: null }, 1772440000n).endSeconds).toBe(1772440000n);
    expect(resolveInterval({ start, end: null }, 1772438000n).endSeconds).toBe(1772438400n);
  });

  it("needs a clock for a running entry", () => {
    expect(() => resolveInterval({ start, end: null }, undefined)).toThrow(MissingClockError);
  });

  it("rejects an entry that ends before it starts", () => {
    expect(() => resolveInterval({ start, end: "2026-03-02T07:59:59Z" }, undefined)).toThrow(
      InvalidIntervalError,
    );
  });

  it("parses an optional now", () => {
    expect(parseNow(undefined)).toBeUndefined();
    expect(parseNow(start)).toBe(1772438400n);
  });
});
