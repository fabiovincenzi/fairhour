import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { EntryMergeError, EntrySplitError, InvalidInstantError } from "../errors";
import { entryDurationSeconds } from "../time/duration";
import { epochSeconds } from "../time/instant";
import { DESCRIPTION_SEPARATOR, mergeEntries, splitEntry } from "./split-merge";
import type { TimeEntry } from "./types";

const at = (hhmm: string): string => `2026-03-02T${hhmm}:00Z`;

function entry(overrides: Partial<TimeEntry> = {}): TimeEntry {
  return {
    id: "e1",
    projectId: "p1",
    taskId: "t1",
    description: "Design",
    billable: true,
    tags: ["ui", "review"],
    start: at("08:00"),
    end: at("12:00"),
    ...overrides,
  };
}

describe("splitEntry", () => {
  it("cuts the entry in two contiguous parts that keep its metadata", () => {
    const original = { ...entry(), createdBy: "u1" };
    const [first, second] = splitEntry(original, at("10:30"), "e2");
    expect(first).toEqual({ ...original, end: at("10:30") });
    expect(second).toEqual({ ...original, id: "e2", start: at("10:30") });
  });

  it("preserves the total duration", () => {
    const [first, second] = splitEntry(entry(), at("09:15"), "e2");
    expect(entryDurationSeconds(first) + entryDurationSeconds(second)).toBe(
      entryDurationSeconds(entry()),
    );
    expect([entryDurationSeconds(first), entryDurationSeconds(second)]).toEqual([4500n, 9900n]);
  });

  it("does not share the tags array or mutate the input", () => {
    const original = entry();
    const [first, second] = splitEntry(original, at("10:00"), "e2");
    expect(first.tags).not.toBe(original.tags);
    expect(second.tags).not.toBe(first.tags);
    expect(original).toEqual(entry());
  });

  it("keeps an absent task absent", () => {
    const { taskId: _taskId, ...withoutTask } = entry();
    const [first, second] = splitEntry(withoutTask, at("10:00"), "e2");
    expect("taskId" in first).toBe(false);
    expect("taskId" in second).toBe(false);
  });

  it("accepts a split instant written with another offset", () => {
    const [first, second] = splitEntry(entry(), "2026-03-02T11:00:00+01:00", "e2");
    expect(first.end).toBe("2026-03-02T11:00:00+01:00");
    expect(entryDurationSeconds(first)).toBe(7200n);
    expect(second.start).toBe("2026-03-02T11:00:00+01:00");
  });

  it.each([
    ["at the start", at("08:00")],
    ["at the end", at("12:00")],
    ["before the start", at("07:00")],
    ["after the end", at("13:00")],
    ["within the first second", "2026-03-02T08:00:00.500Z"],
  ])("refuses to split %s", (_name, when) => {
    expect(() => splitEntry(entry(), when, "e2")).toThrow(EntrySplitError);
  });

  it("refuses to reuse the id and rejects invalid instants", () => {
    expect(() => splitEntry(entry(), at("10:00"), "e1")).toThrow(EntrySplitError);
    expect(() => splitEntry(entry(), "noon", "e2")).toThrow(InvalidInstantError);
  });
});

describe("mergeEntries", () => {
  const a = entry({
    id: "a",
    start: at("08:00"),
    end: at("10:00"),
    description: "Design",
    tags: ["ui"],
  });
  const b = entry({
    id: "b",
    start: at("10:00"),
    end: at("12:00"),
    description: "Review",
    tags: ["review", "ui"],
  });

  it("merges touching entries: union of time, joined description, union of tags", () => {
    expect(mergeEntries(a, b)).toEqual({
      ...a,
      description: `Design${DESCRIPTION_SEPARATOR}Review`,
      tags: ["ui", "review"],
      end: at("12:00"),
    });
  });

  it("is symmetric in argument order (earlier entry wins id and order)", () => {
    expect(mergeEntries(b, a)).toEqual(mergeEntries(a, b));
  });

  it("merges overlapping entries counting the shared time once", () => {
    const x = entry({ id: "x", start: at("08:00"), end: at("10:30") });
    const y = entry({ id: "y", start: at("10:00"), end: at("12:00") });
    const merged = mergeEntries(x, y);
    expect(merged.id).toBe("x");
    expect(merged.start).toBe(at("08:00"));
    expect(merged.end).toBe(at("12:00"));
    expect(entryDurationSeconds(merged)).toBe(4n * 3600n);
  });

  it("merges an entry contained in the other one", () => {
    const outer = entry({ id: "outer", start: at("08:00"), end: at("12:00") });
    const inner = entry({
      id: "inner",
      start: at("09:00"),
      end: at("10:00"),
      description: "Design",
    });
    const merged = mergeEntries(inner, outer);
    expect(merged.id).toBe("outer");
    expect(merged.end).toBe(at("12:00"));
    expect(merged.description).toBe("Design");
  });

  it("keeps the first argument as the earlier one when both start together", () => {
    const x = entry({ id: "x", start: at("08:00"), end: at("09:00"), description: "X" });
    const y = entry({ id: "y", start: at("08:00"), end: at("09:00"), description: "Y" });
    expect(mergeEntries(x, y).id).toBe("x");
    expect(mergeEntries(y, x).id).toBe("y");
    expect(mergeEntries(x, y).end).toBe(at("09:00"));
  });

  it.each([
    ["equal descriptions", "Design", "Design", "Design"],
    ["empty second", "Design", "", "Design"],
    ["empty first", "", "Review", "Review"],
    ["both empty", "", "", ""],
    ["different", "Design", "Review", "Design / Review"],
  ])("description rule: %s", (_name, first, second, expected) => {
    const merged = mergeEntries(
      entry({ id: "a", start: at("08:00"), end: at("09:00"), description: first }),
      entry({ id: "b", start: at("09:00"), end: at("10:00"), description: second }),
    );
    expect(merged.description).toBe(expected);
  });

  it("keeps extra fields of the earlier entry", () => {
    const early = { ...a, createdBy: "early" };
    const late = { ...b, createdBy: "late" };
    expect(mergeEntries(late, early)).toMatchObject({ id: "a", createdBy: "early" });
  });

  it.each([
    ["different projects", { projectId: "p2" }, "project-mismatch"],
    ["different tasks", { taskId: "t2" }, "task-mismatch"],
    ["billable and not", { billable: false }, "billable-mismatch"],
  ] as const)("refuses %s", (_name, override, reason) => {
    expect.assertions(2);
    try {
      mergeEntries(a, { ...b, ...override });
    } catch (error) {
      expect(error).toBeInstanceOf(EntryMergeError);
      expect((error as EntryMergeError).reason).toBe(reason);
    }
  });

  it("refuses a task on one side only, and accepts no task on both", () => {
    const { taskId: _taskId, ...noTask } = b;
    expect(() => mergeEntries(a, noTask)).toThrow(EntryMergeError);
    const { taskId: _other, ...noTaskA } = a;
    expect(mergeEntries(noTaskA, noTask).end).toBe(b.end);
  });

  it("refuses entries separated by a gap", () => {
    const late = entry({ id: "late", start: "2026-03-02T10:00:01Z", end: at("13:00") });
    expect(() => mergeEntries(a, late)).toThrow(new EntryMergeError("gap"));
    expect(() => mergeEntries(late, a)).toThrow(new EntryMergeError("gap"));
  });
});

describe("split then merge", () => {
  const instants = fc.integer({ min: 1_700_000_000, max: 1_800_000_000 });
  const entries = fc
    .record({
      id: fc.string({ minLength: 1, maxLength: 8 }),
      projectId: fc.string({ minLength: 1, maxLength: 8 }),
      taskId: fc.option(fc.string({ minLength: 1, maxLength: 8 }), { nil: undefined }),
      description: fc.string({ maxLength: 30 }),
      billable: fc.boolean(),
      tags: fc.uniqueArray(fc.string({ minLength: 1, maxLength: 6 }), { maxLength: 5 }),
      start: instants,
      length: fc.integer({ min: 2, max: 3 * 86_400 }),
    })
    .map(({ start, length, taskId, ...rest }): TimeEntry => ({
      ...rest,
      ...(taskId === undefined ? {} : { taskId }),
      start: new Date(start * 1000).toISOString(),
      end: new Date((start + length) * 1000).toISOString(),
    }));

  it("is the identity and preserves the total duration", () => {
    fc.assert(
      fc.property(entries, fc.integer({ min: 0, max: 1000 }), (original, permille) => {
        const startSeconds = epochSeconds(original.start);
        const length = entryDurationSeconds(original);
        // any second strictly inside the entry
        const cut = 1n + ((length - 2n) * BigInt(permille)) / 1000n;
        const when = new Date(Number(startSeconds + cut) * 1000).toISOString();
        const newId = `${original.id}#2`;

        const [first, second] = splitEntry(original, when, newId);
        expect(entryDurationSeconds(first) + entryDurationSeconds(second)).toBe(
          entryDurationSeconds(original),
        );
        expect(first.end).toBe(second.start);
        expect(mergeEntries(first, second)).toEqual(original);
        expect(mergeEntries(second, first)).toEqual(original);
      }),
      { numRuns: 300 },
    );
  });

  it("splitting into three and merging back in any order is the identity", () => {
    fc.assert(
      fc.property(entries, (original) => {
        const length = entryDurationSeconds(original);
        fc.pre(length >= 3n);
        const startSeconds = epochSeconds(original.start);
        const cut1 = new Date(Number(startSeconds + length / 3n) * 1000).toISOString();
        const cut2 = new Date(Number(startSeconds + (2n * length) / 3n) * 1000).toISOString();
        fc.pre(cut1 !== cut2);
        const [head, rest] = splitEntry(original, cut1, `${original.id}#2`);
        const [middle, tail] = splitEntry(rest, cut2, `${original.id}#3`);
        expect(mergeEntries(mergeEntries(head, middle), tail)).toEqual(original);
        expect(mergeEntries(head, mergeEntries(middle, tail))).toEqual(original);
      }),
      { numRuns: 200 },
    );
  });
});
