import { describe, expect, it } from "vitest";
import {
  checkSource,
  compareLocale,
  coverage,
  flatten,
  formatReports,
  isFailing,
  parseMessage,
} from "./locales.ts";

const en = {
  timer: { start: "Start timer", running: "Running for {duration}" },
  entries: { count: "{count, plural, one {# entry} other {# entries}}" },
  legal: "Read the <link>terms</link>",
  ok: "OK",
};

/** The names of a message that must parse; fails the test with the parser's error otherwise. */
function names(message: string): readonly string[] {
  const parsed = parseMessage(message);
  if (!parsed.ok) throw new Error(`${message} does not parse: ${parsed.error}`);
  return parsed.names;
}

/** The error of a message that must not parse. */
function errorOf(message: string): string {
  const parsed = parseMessage(message);
  if (parsed.ok) throw new Error(`${message} parses, with ${parsed.names.join(", ")}`);
  return parsed.error;
}

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

describe("parseMessage: argument and tag names", () => {
  it.each([
    ["Hello", []],
    ["", []],
    ["Hi {name}", ["name"]],
    ["{a} and {a} again", ["a"]],
    ["{1} then {0}", ["0", "1"]],
    ["{ count , plural, one {# x} other {# y}}", ["count"]],
    ["{date, date, short} at {time, time, short}", ["date", "time"]],
    ["{date, date, ::yMMMd}", ["date"]],
    ["{amount, number, ::currency/EUR}", ["amount"]],
    ["{amount, number}", ["amount"]],
    ["<b>bold</b> and <link>x</link>", ["<b>", "<link>"]],
    ["{count, plural, one {item} other {items}}", ["count"]],
    ["{n, selectordinal, one {#st} other {#th}}", ["n"]],
    [
      "{n, plural, offset:1 =0 {nobody} one {{who} alone} other {{who} and # others}}",
      ["n", "who"],
    ],
    ["{gender, select, female {she} male {he} other {they}} came", ["gender"]],
    ["{a, select, x {{b, plural, one {{c}} other {d}}} other {e}}", ["a", "b", "c"]],
    // Tags are read in plural and select branches, and inside other tags, and they hold arguments.
    ["{n, plural, one {<b>one</b>} other {<i>many</i>}}", ["<b>", "<i>", "n"]],
    ["{role, select, owner {<b>{name}</b>} other {x}}", ["<b>", "name", "role"]],
    ["<b><i>Hi {name}</i></b>", ["<b>", "<i>", "name"]],
    ["<b>{n, plural, one {a} other {b}}</b>", ["<b>", "n"]],
    ["Line <b >x</b> and <my-tag>y</my-tag>", ["<b>", "<my-tag>"]],
    // A `<` that does not open a tag is ordinary text, and so is a self-closing tag.
    ["1 < 2 and 3 <4 {x}", ["x"]],
    ["Line<br/>break {x}", ["x"]],
    // Quoted text is literal: no argument, no tag.
    ["It''s '{literal}' {real}", ["real"]],
    ["unbalanced } brace {x}", ["x"]],
  ])("%j", (message, expected) => {
    expect(names(message)).toEqual(expected);
  });
});

// The messages are read by the parser that next-intl renders them with, so what counts as quoted
// text, a literal apostrophe or a tag is whatever it says. In ICU MessageFormat's default mode a
// single `'` starts quoted text only before `{`, `}`, `<` or `>` (and `#` in a plural), `''` is a
// literal apostrophe, and the typographic `’` is an ordinary character.
describe("parseMessage: apostrophes", () => {
  it.each([
    // Elisions: the apostrophe is literal, so the arguments after it are still seen.
    ["L'area {name}", ["name"]],
    ["dell'utente {count, plural, one {# voce} other {# voci}}", ["count"]],
    [
      "{count, plural, one {l'elemento di {owner}} other {gli elementi di {owner}}}",
      ["count", "owner"],
    ],
    ["{role, select, owner {l'owner} other {l'utente {name}}}", ["name", "role"]],
    ["un'ora fa, {name} ha detto: c'era una volta", ["name"]],
    ["rock 'n' roll {x}", ["x"]],
    ["{n, selectordinal, one {#st} other {#th}} l'anno {year}", ["n", "year"]],
    // A trailing or lone apostrophe is literal.
    ["dell'", []],
    ["'", []],
    ["{x}'", ["x"]],
    // `''` is a literal apostrophe, also right before a brace or a tag.
    ["It''s {x}", ["x"]],
    ["dell''{name}", ["name"]],
    ["Say ''{x}''", ["x"]],
    ["''", []],
    ["l''<link>x</link> {name}", ["<link>", "name"]],
    ["{n, plural, one {un po''} other {molto}}", ["n"]],
    ["Aspetta <i>un po''</i>", ["<i>"]],
    // The typographic apostrophe is an ordinary character, so nothing is quoted.
    ["dell’{name}", ["name"]],
    ["l’<link>x</link> {name}", ["<link>", "name"]],
    ["Apri l’<link>area di lavoro</link> di {name}", ["<link>", "name"]],
    ["Aspetta <i>un po’</i> o un po' di piu", ["<i>"]],
    ["{n, plural, one {un po’} other {molto}}", ["n"]],
    ["<b>dell’</b> {n}", ["<b>", "n"]],
    ["{n, plural, one {l’<b>x</b> {y}} other {z}}", ["<b>", "n", "y"]],
    // Quoted text: `'` before `{` or `}` quotes up to the next single `'`.
    ["'{literal}'", []],
    ["'{literal}' and {real}", ["real"]],
    ["'}' {x}", ["x"]],
    ["'{a''b}' {c}", ["c"]],
    ["dell'{name}", []],
    ["'{y}", []],
    ["'{unterminated {y}", []],
    ["'{a} it's {b}' {c}", ["b", "c"]],
    ["'''{x}'''", []],
    // Outside a plural `#` is an ordinary character; inside one, `'#` starts quoted text.
    ["'#' and {x}", ["x"]],
    ["{n, plural, other {'#' items}}", ["n"]],
    ["{n, plural, other {'# {hidden} ' {shown}}}", ["n", "shown"]],
    // An apostrophe that does not start a quote never hides later arguments.
    ["'unterminated quote {y}", ["y"]],
    // `'` before `<` or `>` quotes the tag too. Here the quote runs to the end of the message and
    // the parser reads it all as text: a valid message that lost its tag and its argument.
    ["l'<link>x</link> {name}", []],
    ["Apri l'<link>area di lavoro</link> di {name}", []],
    ["a '> b {x}", []],
    ["'<b>' {x}", ["x"]],
    ["'<b>x</b>' {n}", ["n"]],
    // The quote ends at the next single apostrophe, so what follows it is seen again.
    ["l'<link>x' <b>y</b> {name}", ["<b>", "name"]],
    ["'<'<b>x</b>", ["<b>"]],
    ["<b>l'a</b> {n}", ["<b>", "n"]],
    ["{n, plural, one {'<b>' {y}} other {z}}", ["n", "y"]],
  ])("%j", (message, expected) => {
    expect(names(message)).toEqual(expected);
  });

  // A quote that swallows a closing tag or a closing brace leaves the message unbalanced, which
  // the parser rejects: the translator sees an error instead of a message that silently breaks.
  it.each([
    ["Aspetta <i>un po'</i>", "UNCLOSED_TAG"],
    ["Aspetta <i>un po'</i> o un po' di piu", "UNCLOSED_TAG"],
    ["<b>dell'</b> {n}", "UNCLOSED_TAG"],
    ["{n, plural, one {un po'} other {molto}}", "EXPECT_ARGUMENT_CLOSING_BRACE"],
    ["{n, plural, one {l'<b>x</b> {y}} other {z}}", "EXPECT_ARGUMENT_CLOSING_BRACE"],
    ["{role, select, owner {l'<b>x</b>} other {{name}}}", "EXPECT_ARGUMENT_CLOSING_BRACE"],
  ])("rejects %j as %s", (message, kind) => {
    expect(errorOf(message)).toMatch(new RegExp(`^${kind} \\(line 1, column \\d+\\)$`));
  });
});

describe("parseMessage: syntax errors", () => {
  it.each([
    ["Hi {name", "EXPECT_ARGUMENT_CLOSING_BRACE"],
    ["Hi {}", "EMPTY_ARGUMENT"],
    ["Hi {a b}", "MALFORMED_ARGUMENT"],
    ["Hi {name,}", "EXPECT_ARGUMENT_TYPE"],
    ["Hi {name, unknown}", "INVALID_ARGUMENT_TYPE"],
    ["{n, plural, one {a}}", "MISSING_OTHER_CLAUSE"],
    ["{r, select, owner {a}}", "MISSING_OTHER_CLAUSE"],
    ["{n, plural, one {a} other {b} one {c}}", "DUPLICATE_PLURAL_ARGUMENT_SELECTOR"],
    ["{r, select, a {x} a {y} other {z}}", "DUPLICATE_SELECT_ARGUMENT_SELECTOR"],
    ["{n, plural, one", "EXPECT_PLURAL_ARGUMENT_SELECTOR_FRAGMENT"],
    ["{n, plural one {a}}", "EXPECT_SELECT_ARGUMENT_OPTIONS"],
    ["Open <b>never closed", "UNCLOSED_TAG"],
    ["Only a closing </b>", "UNMATCHED_CLOSING_TAG"],
    ["<b>wrong</i>", "UNMATCHED_CLOSING_TAG"],
    ["<b not closed {x}", "INVALID_TAG"],
  ])("rejects %j as %s", (message, kind) => {
    expect(errorOf(message)).toMatch(new RegExp(`^${kind} \\(line \\d+, column \\d+\\)$`));
  });

  it("says where the error is, on the line and column of the message", () => {
    expect(errorOf("first line\nsecond <b>line")).toBe("UNCLOSED_TAG (line 2, column 8)");
    expect(errorOf("Hi {name")).toBe("EXPECT_ARGUMENT_CLOSING_BRACE (line 1, column 4)");
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
    expect(report.syntaxErrors).toEqual([]);
    expect(report.identical).toEqual([]); // "OK" is too short to flag
  });

  it("accepts a plural with more categories than English and arguments in another order", () => {
    const report = compareLocale(
      "pl",
      { a: "{n, plural, one {# file by {user}} other {# files by {user}}}" },
      {
        a: "{n, plural, one {# plik od {user}} few {# pliki od {user}} other {# plików od {user}}}",
      },
    );
    expect(isFailing(report)).toBe(false);
  });

  it("accepts Italian elisions with a straight apostrophe", () => {
    const report = compareLocale(
      "it",
      {
        workspace: "Workspace {name}",
        owner: "Owner of {count, plural, one {# project} other {# projects}}",
      },
      {
        workspace: "L'area di lavoro {name}",
        owner: "Titolare dell'utente di {count, plural, one {# progetto} other {# progetti}}",
      },
    );
    expect(report.placeholderMismatches).toEqual([]);
    expect(report.syntaxErrors).toEqual([]);
    expect(isFailing(report)).toBe(false);
  });

  it("still reports a placeholder that an apostrophe quotes away", () => {
    const report = compareLocale("it", { a: "Hi {name}" }, { a: "Ciao dell'{name}" });
    expect(report.placeholderMismatches).toEqual(["a"]);
    expect(report.syntaxErrors).toEqual([]);
    expect(isFailing(report)).toBe(true);
  });

  it("reports a tag and an argument that an apostrophe before a tag quotes away", () => {
    const source = { a: "Open <link>the workspace</link> of {name}" };
    const quoted = compareLocale("it", source, {
      a: "Apri l'<link>area di lavoro</link> di {name}",
    });
    expect(quoted.placeholderMismatches).toEqual(["a"]);
    expect(quoted.syntaxErrors).toEqual([]);
    for (const fixed of [
      "Apri l’<link>area di lavoro</link> di {name}",
      "Apri l''<link>area di lavoro</link> di {name}",
    ]) {
      const report = compareLocale("it", source, { a: fixed });
      expect(report.placeholderMismatches, fixed).toEqual([]);
      expect(isFailing(report), fixed).toBe(false);
    }
  });

  describe("an apostrophe before a closing tag or brace", () => {
    const cases = [
      {
        name: "before a closing tag",
        source: "Wait <i>a bit</i>",
        broken: "Aspetta <i>un po'</i>",
        fixed: ["Aspetta <i>un po’</i>", "Aspetta <i>un po''</i>"],
      },
      {
        name: "before a closing brace in a plural",
        source: "{n, plural, one {a bit} other {a lot}}",
        broken: "{n, plural, one {un po'} other {molto}}",
        fixed: [
          "{n, plural, one {un po’} other {molto}}",
          "{n, plural, one {un po''} other {molto}}",
        ],
      },
      {
        name: "before a closing tag, with another apostrophe after it",
        source: "Wait <i>a bit</i> or a bit more",
        broken: "Aspetta <i>un po'</i> o un po' di piu",
        fixed: ["Aspetta <i>un po’</i> o un po' di piu", "Aspetta <i>un po''</i> o un po' di piu"],
      },
    ];

    it.each(cases)("is a syntax error: $name", ({ source, broken, fixed }) => {
      const report = compareLocale("it", { a: source }, { a: broken });
      expect(report.syntaxErrors).toEqual([
        { key: "a", error: expect.stringMatching(/^[A-Z_]+ \(line 1, column \d+\)$/) as string },
      ]);
      // Reported once, as a syntax error: the message cannot be compared.
      expect(report.placeholderMismatches).toEqual([]);
      expect(isFailing(report)).toBe(true);
      for (const message of fixed) {
        const ok = compareLocale("it", { a: source }, { a: message });
        expect(ok.syntaxErrors, message).toEqual([]);
        expect(ok.placeholderMismatches, message).toEqual([]);
        expect(isFailing(ok), message).toBe(false);
      }
    });

    it("fails the check", () => {
      for (const { source, broken } of cases) {
        expect(isFailing(compareLocale("it", { a: source }, { a: broken }))).toBe(true);
      }
      // Quoted away without a syntax error: a mismatch.
      const quoted = compareLocale(
        "it",
        { a: "Open the <link>workspace</link> of {name}" },
        { a: "Apri l'<link>area di lavoro</link> di {name}" },
      );
      expect(isFailing(quoted)).toBe(true);
    });
  });

  it("reports missing keys, syntax errors, placeholder mismatches, identical and stale keys", () => {
    const report = compareLocale("de", en, {
      timer: { start: "Start timer", running: "Läuft seit {dauer}" },
      legal: "Lies die <link>Bedingungen",
      old: "veraltet {",
    });
    expect(report.missing).toEqual(["entries.count", "ok"]);
    expect(report.placeholderMismatches).toEqual(["timer.running"]);
    expect(report.syntaxErrors).toEqual([
      { key: "legal", error: "UNCLOSED_TAG (line 1, column 10)" },
      { key: "old", error: "EXPECT_ARGUMENT_CLOSING_BRACE (line 1, column 10)" },
    ]);
    expect(report.identical).toEqual(["timer.start"]);
    expect(report.extra).toEqual(["old"]);
    expect(isFailing(report)).toBe(true);
    expect(coverage(report)).toBe(60);
  });

  it("fails on a syntax error in a stale key, which is also reported as stale", () => {
    const report = compareLocale("it", { a: "Hello" }, { a: "Ciao", old: "<b>aperto" });
    expect(report.missing).toEqual([]);
    expect(report.extra).toEqual(["old"]);
    expect(report.syntaxErrors.map((issue) => issue.key)).toEqual(["old"]);
    expect(isFailing(report)).toBe(true);
  });

  it("does not blame a translation for a message that English cannot parse", () => {
    const report = compareLocale("it", { a: "Hi {name" }, { a: "Ciao {name}" });
    expect(report.syntaxErrors).toEqual([]);
    expect(report.placeholderMismatches).toEqual([]);
    expect(isFailing(report)).toBe(false);
  });

  it("treats an empty source as fully covered", () => {
    expect(coverage(compareLocale("it", {}, {}))).toBe(100);
  });
});

describe("checkSource", () => {
  it("passes valid English and is complete by definition", () => {
    const report = checkSource(en);
    expect(report).toMatchObject({ locale: "en", total: 5, translated: 5, syntaxErrors: [] });
    expect(isFailing(report)).toBe(false);
    expect(coverage(report)).toBe(100);
  });

  it("fails when an English message does not parse", () => {
    const report = checkSource({ ...en, nested: { bad: "Wait <i>a bit" } });
    expect(report.syntaxErrors).toEqual([
      { key: "nested.bad", error: "UNCLOSED_TAG (line 1, column 6)" },
    ]);
    expect(report.total).toBe(6);
    expect(isFailing(report)).toBe(true);
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
    expect(text).toContain(
      "| Locale | Coverage | Missing | Syntax errors | Placeholder issues | Same as English | Stale keys |",
    );
    expect(text).toContain("| ✅ it | 100% (1/1) | 0 | 0 | 0 | 0 | 0 |");
    expect(text).toContain("| ❌ fr | 50% (1/2) | 1 | 0 | 1 | 0 | 0 |");
    expect(text).toContain("- missing: `a`");
    expect(text).toContain("- placeholders differ: `b`");
  });

  it("lists the syntax errors with their position, English included", () => {
    const source = { a: "Wait <i>a bit</i>", b: "Wait {n" };
    const text = formatReports([
      {
        app: "web",
        locales: [
          checkSource(source),
          compareLocale("it", { a: "Wait <i>a bit</i>" }, { a: "Aspetta <i>un po'</i>" }),
        ],
      },
    ]);
    expect(text).toContain("| ❌ en | 100% (2/2) | 0 | 1 | 0 | 0 | 0 |");
    expect(text).toContain("| ❌ it | 100% (1/1) | 0 | 1 | 0 | 0 | 0 |");
    expect(text).toContain("**web / en**");
    expect(text).toContain("- syntax error: `b`: EXPECT_ARGUMENT_CLOSING_BRACE (line 1, column 6)");
    expect(text).toContain("**web / it**");
    expect(text).toContain("- syntax error: `a`: UNCLOSED_TAG (line 1, column 9)");
  });
});
