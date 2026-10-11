import { describe, expect, it } from "vitest";
import { jsonLimitProblem } from "./json";

/** `{ a: { a: ... { a: leaf } } }` with `levels` objects, built without recursion. */
function nested(levels: number, leaf: unknown = 1): unknown {
  let value: unknown = leaf;
  for (let level = 0; level < levels; level += 1) value = { a: value };
  return value;
}

describe("jsonLimitProblem", () => {
  it("accepts values within the limits, and leaves of any type", () => {
    expect(jsonLimitProblem(nested(8), { maxDepth: 8 })).toBeUndefined();
    expect(
      jsonLimitProblem([[1, [2]], { b: [3] }], { maxDepth: 3, maxEntries: 7 }),
    ).toBeUndefined();
    for (const leaf of [undefined, null, "x", 1, true, 1n, new Map(), () => 1]) {
      expect(jsonLimitProblem(leaf, { maxDepth: 1, maxEntries: 0 })).toBeUndefined();
    }
  });

  it("reports the first container nested too deep, with its path", () => {
    expect(jsonLimitProblem(nested(9), { maxDepth: 8 })).toEqual({
      path: ["a", "a", "a", "a", "a", "a", "a", "a"],
      code: "too-deep",
      message: "Nested deeper than 8 levels",
    });
    expect(jsonLimitProblem({ list: [[[]]] }, { maxDepth: 3 })?.path).toEqual(["list", 0, 0]);
  });

  it("handles 20,000 levels and cycles without recursion", () => {
    expect(jsonLimitProblem(nested(20_000), { maxDepth: 32 })?.code).toBe("too-deep");
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(jsonLimitProblem(cyclic, { maxDepth: 32 })?.code).toBe("too-deep");
  });

  it("counts object properties and array items at every level", () => {
    expect(jsonLimitProblem({ a: [1, 2], b: 3 }, { maxDepth: 8, maxEntries: 5 })).toBeUndefined();
    expect(jsonLimitProblem({ a: [1, 2, 3, 4], b: 3 }, { maxDepth: 8, maxEntries: 5 })).toEqual({
      path: ["a"],
      code: "too-large",
      message: "More than 5 properties and array items in total",
    });
  });

  it("treats objects that are not plain as leaves", () => {
    class Box {
      readonly inner = nested(50);
    }
    expect(jsonLimitProblem({ box: new Box() }, { maxDepth: 2 })).toBeUndefined();
    const bare = Object.assign(Object.create(null) as object, { k: nested(3) });
    expect(jsonLimitProblem(bare, { maxDepth: 3 })?.path).toEqual(["k", "a", "a"]);
  });
});
