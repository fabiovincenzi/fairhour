import { describe, expect, it } from "vitest";
import { cleanDescription } from "./description";
import type { Span } from "./scan";

const piece = (text: string): Span => ({ start: 0, end: text.length, text });

describe("cleanDescription", () => {
  it.each([
    [[], ""],
    [["review"], "review"],
    [["  review  "], "review"],
    [["review", "the  plan"], "review the plan"],
    [[", - review,"], "review"],
    [["- review, ", " 2 ; "], "review, 2"],
    [[" \t\n"], ""],
    [["–—:;,-"], ""],
    [["a - b"], "a - b"],
  ])("%j -> %j", (pieces, expected) => {
    expect(cleanDescription(pieces.map(piece))).toBe(expected);
  });

  it("is linear: 100 kB of separators with a letter at the end", () => {
    // The old `/^[\s,;:\-–—]+|[\s,;:\-–—]+$/` regex took 5.7 s on ", ".repeat(50_000) + "x".
    const tails = [`${", ".repeat(50_000)}x`, `x${", ".repeat(50_000)}`, ", ".repeat(50_000)];
    const started = performance.now();
    const cleaned = tails.map((tail) => cleanDescription([piece(tail)]));
    expect(performance.now() - started).toBeLessThan(250);
    expect(cleaned[0]).toBe("x");
    expect(cleaned[1]).toBe("x");
    expect(cleaned[2]).toBe("");
  });
});
