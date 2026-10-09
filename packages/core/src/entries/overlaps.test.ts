import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { InvalidIntervalError, MissingClockError } from "../errors";
import { epochSeconds } from "../time/instant";
import { findOverlaps } from "./overlaps";

interface E {
  id: string;
  start: string;
  end: string | null;
}

const at = (hhmm: string): string => `2026-03-02T${hhmm}:00Z`;
const e = (id: string, from: string, to: string | null): E => ({
  id,
  start: at(from),
  end: to === null ? null : at(to),
});
const ids = (pairs: ReturnType<typeof findOverlaps<E>>): [string, string][] =>
  pairs.map((p) => [p.first.id, p.second.id]);

describe("findOverlaps", () => {
  it("finds nothing in an empty list or a single entry", () => {
    expect(findOverlaps([])).toEqual([]);
    expect(findOverlaps([e("a", "08:00", "09:00")])).toEqual([]);
  });

  it.each([
    ["disjoint", [e("a", "08:00", "09:00"), e("b", "10:00", "11:00")], []],
    [
      "touching end == start is not an overlap",
      [e("a", "08:00", "09:00"), e("b", "09:00", "10:00")],
      [],
    ],
    ["one minute of overlap", [e("a", "08:00", "09:01"), e("b", "09:00", "10:00")], [["a", "b"]]],
    [
      "input order does not matter",
      [e("b", "09:00", "10:00"), e("a", "08:00", "09:01")],
      [["a", "b"]],
    ],
    [
      "containment",
      [e("outer", "08:00", "12:00"), e("inner", "09:00", "10:00")],
      [["outer", "inner"]],
    ],
    ["identical entries", [e("a", "08:00", "09:00"), e("b", "08:00", "09:00")], [["a", "b"]]],
    [
      "same start, ties by input order",
      [e("x", "08:00", "10:00"), e("y", "08:00", "09:00")],
      [["x", "y"]],
    ],
    [
      "zero-length entries overlap nothing",
      [e("z", "08:30", "08:30"), e("a", "08:00", "09:00")],
      [],
    ],
    [
      "a chain A-B and B-C but not A-C",
      [e("a", "08:00", "09:30"), e("b", "09:00", "10:30"), e("c", "10:00", "11:00")],
      [
        ["a", "b"],
        ["b", "c"],
      ],
    ],
    [
      "one long entry overlapping three",
      [
        e("L", "08:00", "12:00"),
        e("a", "08:30", "09:00"),
        e("b", "09:00", "09:30"),
        e("c", "11:00", "13:00"),
      ],
      [
        ["L", "a"],
        ["L", "b"],
        ["L", "c"],
      ],
    ],
  ] as const)("%s", (_name, entries, expected) => {
    expect(ids(findOverlaps([...entries]))).toEqual(expected);
  });

  it("reports how long the shared time is", () => {
    const pairs = findOverlaps([
      e("a", "08:00", "10:00"),
      e("b", "09:15", "09:45"),
      e("c", "09:30", "11:00"),
    ]);
    expect(pairs.map((p) => [p.first.id, p.second.id, p.overlapSeconds])).toEqual([
      ["a", "b", 1800n],
      ["a", "c", 1800n],
      ["b", "c", 900n],
    ]);
  });

  it("returns the original objects", () => {
    const a = e("a", "08:00", "10:00");
    const b = e("b", "09:00", "11:00");
    const [pair] = findOverlaps([b, a]);
    expect(pair?.first).toBe(a);
    expect(pair?.second).toBe(b);
  });

  it("handles instants written with different offsets", () => {
    const a = { id: "a", start: "2026-03-02T09:00:00+01:00", end: "2026-03-02T10:00:00+01:00" };
    const b = { id: "b", start: "2026-03-02T03:30:00-05:00", end: "2026-03-02T04:30:00-05:00" };
    expect(ids(findOverlaps([a, b]))).toEqual([["a", "b"]]);
  });

  describe("running entries", () => {
    const running = e("run", "09:00", null);

    it("last until the injected clock", () => {
      const others = [e("a", "08:00", "09:30"), e("b", "10:00", "11:00")];
      expect(ids(findOverlaps([running, ...others], { now: at("10:30") }))).toEqual([
        ["a", "run"],
        ["run", "b"],
      ]);
      expect(ids(findOverlaps([running, ...others], { now: at("09:45") }))).toEqual([["a", "run"]]);
    });

    it("need a clock", () => {
      expect(() => findOverlaps([running])).toThrow(MissingClockError);
    });
  });

  it("rejects an entry that ends before it starts", () => {
    expect(() => findOverlaps([e("bad", "10:00", "09:00")])).toThrow(InvalidIntervalError);
  });

  it("agrees with the O(n^2) definition on random entries", () => {
    const entry = fc.record({
      start: fc.integer({ min: 0, max: 200 }),
      length: fc.integer({ min: 0, max: 60 }),
    });
    fc.assert(
      fc.property(fc.array(entry, { maxLength: 40 }), (items) => {
        const base = epochSeconds("2026-03-02T00:00:00Z");
        const entries: E[] = items.map(({ start, length }, i) => ({
          id: String(i),
          start: new Date(Number(base) * 1000 + start * 60_000).toISOString(),
          end: new Date(Number(base) * 1000 + (start + length) * 60_000).toISOString(),
        }));
        const expected: string[] = [];
        for (let i = 0; i < items.length; i++) {
          for (let j = i + 1; j < items.length; j++) {
            const a = items[i];
            const b = items[j];
            if (a === undefined || b === undefined) continue;
            const overlaps =
              a.length > 0 &&
              b.length > 0 &&
              a.start < b.start + b.length &&
              b.start < a.start + a.length;
            if (overlaps) expected.push([i, j].sort((x, y) => x - y).join("-"));
          }
        }
        const found = findOverlaps(entries).map((p) => {
          const first = Number(p.first.id);
          const second = Number(p.second.id);
          return [first, second].sort((x, y) => x - y).join("-");
        });
        expect([...found].sort()).toEqual([...expected].sort());
        // the first entry of a pair never starts after the second
        for (const pair of findOverlaps(entries)) {
          expect(epochSeconds(pair.first.start) <= epochSeconds(pair.second.start)).toBe(true);
          expect(pair.overlapSeconds > 0n).toBe(true);
        }
      }),
      { numRuns: 300 },
    );
  });

  it("scales to many entries (n log n): 50 000 disjoint entries", () => {
    const base = epochSeconds("2026-01-01T00:00:00Z");
    const entries: E[] = Array.from({ length: 50_000 }, (_, i) => {
      const start = base + BigInt(i) * 120n;
      return {
        id: String(i),
        start: new Date(Number(start) * 1000).toISOString(),
        end: new Date(Number(start + 60n) * 1000).toISOString(),
      };
    });
    const started = performance.now();
    expect(findOverlaps(entries)).toEqual([]);
    expect(performance.now() - started).toBeLessThan(5000);
  });
});
