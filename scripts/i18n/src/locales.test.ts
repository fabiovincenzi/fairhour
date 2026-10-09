import { describe, expect, it } from "vitest";
import {
  compareLocale,
  coverage,
  flatten,
  formatReports,
  isFailing,
  placeholders,
} from "./locales.ts";

const en = {
  timer: { start: "Start timer", running: "Running for {duration}" },
  entries: { count: "{count, plural, one {# entry} other {# entries}}" },
  legal: "Read the <link>terms</link>",
  ok: "OK",
};

describe("flatten", () => {
  it("produces dot-separated keys", () => {
    expect([...flatten(en).keys()]).toEqual([
      "timer.start",
      "timer.running",
      "entries.count",
      "legal",
      "ok",
    ]);
  });
});

describe("placeholders", () => {
  it.each([
    ["Hello", []],
    ["Hi {name}", ["name"]],
    ["{ count , plural, one {# x} other {# y}}", ["count"]],
    ["{date, date, short} at {time}", ["date", "time"]],
    ["<b>bold</b> and <link>x</link>", ["<b>", "<link>"]],
    ["{count, plural, one {item} other {items}}", ["count"]],
    ["{n, plural, offset:1 =0 {nobody} one {{who} alone} other {{who} and # others}}", ["n", "who"]],
    ["{gender, select, female {she} male {he} other {they}} came", ["gender"]],
    ["{amount, number, ::currency/EUR}", ["amount"]],
    ["It''s '{literal}' {real}", ["real"]],
    ["unbalanced } brace {x}", ["x"]],
    ["broken {x, plural, one", ["x"]],
    ["broken {x, plural, one {a}", ["x"]],
    // Malformed: the type is not followed by a comma, so `{a}` is read as an argument.
    ["broken {x, plural one {a}}", ["a", "x"]],
    ["broken {x, number", ["x"]],
    ["'unterminated quote {y}", []],
  ])("%s", (message, expected) => {
    expect(placeholders(message)).toEqual(expected);
  });
});

describe("compareLocale", () => {
  it("accepts a complete translation", () => {
    const report = compareLocale("it", en, {
      timer: { start: "Avvia timer", running: "In corso da {duration}" },
      entries: { count: "{count, plural, one {# voce} other {# voci}}" },
      legal: "Leggi i <link>termini</link>",
      ok: "OK",
    });
    expect(isFailing(report)).toBe(false);
    expect(coverage(report)).toBe(100);
    expect(report.identical).toEqual([]); // "OK" is too short to flag
  });

  it("reports missing keys, placeholder mismatches, identical and stale keys", () => {
    const report = compareLocale("de", en, {
      timer: { start: "Start timer", running: "Läuft seit {dauer}" },
      legal: "Lies die Bedingungen",
      old: "veraltet",
    });
    expect(report.missing).toEqual(["entries.count", "ok"]);
    expect(report.placeholderMismatches).toEqual(["timer.running", "legal"]);
    expect(report.identical).toEqual(["timer.start"]);
    expect(report.extra).toEqual(["old"]);
    expect(isFailing(report)).toBe(true);
    expect(coverage(report)).toBe(60);
  });

  it("treats an empty source as fully covered", () => {
    expect(coverage(compareLocale("it", {}, {}))).toBe(100);
  });
});

describe("formatReports", () => {
  it("explains when there is nothing to check", () => {
    expect(formatReports([])).toMatch(/nothing to check/);
  });

  it("renders a coverage table and failing keys", () => {
    const ok = compareLocale("it", { a: "Hello" }, { a: "Ciao" });
    const bad = compareLocale("fr", { a: "Hello", b: "Hi {name}" }, { b: "Salut" });
    const text = formatReports([{ app: "web", locales: [ok, bad] }]);
    expect(text).toContain("| ✅ it | 100% (1/1)");
    expect(text).toContain("| ❌ fr | 50% (1/2)");
    expect(text).toContain("- missing: `a`");
    expect(text).toContain("- placeholders differ: `b`");
  });
});
