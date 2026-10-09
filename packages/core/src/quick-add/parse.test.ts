import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { InvalidInstantError, InvalidTimeZoneError } from "../errors";
import { parseQuickAdd } from "./parse";
import type { QuickAddDraft, QuickAddLocale, QuickAddOptions, QuickAddProject } from "./types";

// Wednesday 4 March 2026, 11:00 in Rome (CET, UTC+1).
const NOW = "2026-03-04T10:00:00Z";
const ZONE = "Europe/Rome";

const PROJECTS: QuickAddProject[] = [
  { id: "p-web", name: "Website Redesign", clientName: "Acme S.r.l." },
  { id: "p-blog", name: "Blog", clientName: "Globex" },
  { id: "p-cafe", name: "Café Menu", clientName: "Società Rossi" },
  { id: "p-ops", name: "Ops", clientName: "Initech" },
];
const TAGS = ["meeting", "Design Review", "ops"];

function run(
  input: string,
  locale: QuickAddLocale = "en",
  overrides: Partial<QuickAddOptions> = {},
): QuickAddDraft {
  return parseQuickAdd(input, {
    now: NOW,
    timeZone: ZONE,
    locale,
    projects: PROJECTS,
    tags: TAGS,
    ...overrides,
  });
}

const codes = (draft: QuickAddDraft): string[] => draft.issues.map((issue) => issue.code);

interface Expected {
  durationSeconds?: bigint;
  date?: string;
  dateSource?: QuickAddDraft["dateSource"];
  start?: string;
  end?: string;
  projectId?: string;
  tags?: string[];
  description?: string;
  issues?: string[];
  confidence?: QuickAddDraft["confidence"];
}

/** `issues` is compared exactly when given; every other field is a partial match. */
type Case = [name: string, input: string, locale: QuickAddLocale, expected: Expected];

const HOUR = 3600n;
const TODAY = "2026-03-04";

const cases: Case[] = [
  // --- durations
  [
    "hours",
    "2h",
    "en",
    { durationSeconds: 2n * HOUR, date: TODAY, description: "", issues: [], confidence: "high" },
  ],
  ["decimal hours", "1.5h", "en", { durationSeconds: 5400n, issues: [] }],
  ["decimal hours with a comma", "1,5h", "en", { durationSeconds: 5400n, issues: [] }],
  ["minutes", "90m", "en", { durationSeconds: 5400n, issues: [] }],
  ["hours and bare minutes", "1h30", "en", { durationSeconds: 5400n, issues: [] }],
  ["hours and minutes", "1h30m", "en", { durationSeconds: 5400n, issues: [] }],
  ["hours and minutes with a space", "1h 30m", "en", { durationSeconds: 5400n, issues: [] }],
  ["spelled out", "1 hour 30 minutes", "en", { durationSeconds: 5400n, issues: [] }],
  ["unit words", "2 hours design", "en", { durationSeconds: 7200n, description: "design" }],
  ["min", "45 min standup", "en", { durationSeconds: 2700n, description: "standup" }],
  ["quarter hour", "0.25h", "en", { durationSeconds: 900n }],
  ["fraction rounds half up to the second", "0.333h", "en", { durationSeconds: 1199n }],
  [
    "duration inside the sentence",
    "write the report 3h today",
    "en",
    { durationSeconds: 3n * HOUR, description: "write the report" },
  ],
  // --- ranges
  [
    "range",
    "9-10:15",
    "en",
    {
      durationSeconds: 4500n,
      start: "2026-03-04T08:00:00Z",
      end: "2026-03-04T09:15:00Z",
      issues: [],
      confidence: "high",
    },
  ],
  [
    "range with minutes and a description",
    "9:00-10:15 standup",
    "en",
    {
      durationSeconds: 4500n,
      start: "2026-03-04T08:00:00Z",
      end: "2026-03-04T09:15:00Z",
      description: "standup",
    },
  ],
  [
    "am/pm range",
    "9am-5pm client call",
    "en",
    {
      durationSeconds: 8n * HOUR,
      start: "2026-03-04T08:00:00Z",
      end: "2026-03-04T16:00:00Z",
      description: "client call",
    },
  ],
  [
    "from ... to ...",
    "from 9 to 10 review",
    "en",
    { durationSeconds: HOUR, description: "review" },
  ],
  ["range with a dash", "9 – 10", "en", { durationSeconds: HOUR, issues: [] }],
  [
    "range across midnight",
    "22-1 deploy",
    "en",
    {
      durationSeconds: 3n * HOUR,
      start: "2026-03-04T21:00:00Z",
      end: "2026-03-05T00:00:00Z",
      issues: ["range-crosses-midnight"],
      confidence: "medium",
      description: "deploy",
    },
  ],
  [
    "range up to 24:00",
    "20-24",
    "en",
    { durationSeconds: 4n * HOUR, end: "2026-03-04T23:00:00Z", issues: [] },
  ],
  [
    "empty range",
    "10-10 nothing",
    "en",
    { issues: ["empty-range"], confidence: "low", description: "nothing" },
  ],
  [
    "invalid time in a range",
    "9-25:00 x",
    "en",
    { issues: ["invalid-time"], confidence: "low", description: "x" },
  ],
  ["invalid am/pm hour", "13pm-2pm", "en", { issues: ["invalid-time"], confidence: "low" }],
  [
    "invalid minutes",
    "9:75-10 x",
    "en",
    { issues: ["invalid-time"], confidence: "low", description: "x" },
  ],
  [
    "a valid duration survives an invalid range",
    "25:00-9 2h",
    "en",
    { durationSeconds: 7200n, issues: ["invalid-time"], confidence: "low" },
  ],
  ["range and duration agree", "9-10 1h", "en", { durationSeconds: HOUR, issues: [] }],
  [
    "range wins over a different duration",
    "9-10 2h",
    "en",
    { durationSeconds: HOUR, issues: ["conflicting-duration"], confidence: "medium" },
  ],
  [
    "range on a given date",
    "2026-03-02 9-10",
    "en",
    {
      date: "2026-03-02",
      dateSource: "iso",
      start: "2026-03-02T08:00:00Z",
      end: "2026-03-02T09:00:00Z",
      issues: [],
    },
  ],
  // --- dates
  [
    "yesterday",
    "yesterday 2h",
    "en",
    { date: "2026-03-03", dateSource: "keyword", description: "" },
  ],
  ["today", "2h today", "en", { date: TODAY, dateSource: "keyword" }],
  ["weekday in the past", "2h friday", "en", { date: "2026-02-27", dateSource: "weekday" }],
  ["today's weekday is today", "2h Wed", "en", { date: TODAY, dateSource: "weekday" }],
  ["monday", "2h monday", "en", { date: "2026-03-02", dateSource: "weekday" }],
  ["sunday", "2h sun", "en", { date: "2026-03-01" }],
  [
    "ISO date",
    "2h 2026-03-02 review",
    "en",
    { date: "2026-03-02", dateSource: "iso", description: "review", issues: [] },
  ],
  [
    "invalid ISO date",
    "2h 2026-02-30",
    "en",
    { date: TODAY, issues: ["invalid-date"], confidence: "low" },
  ],
  [
    "future ISO date",
    "2h 2026-12-01",
    "en",
    { date: "2026-12-01", issues: ["future-date"], confidence: "medium" },
  ],
  [
    "two dates: the first wins",
    "2h yesterday friday",
    "en",
    { date: "2026-03-03", issues: ["multiple-dates"], description: "friday" },
  ],
  [
    "a date written next to a number is not one",
    "2h call 12026-03-02",
    "en",
    { date: TODAY, description: "call 12026-03-02" },
  ],
  // --- projects, clients, tags
  [
    "backlog example: client name and yesterday",
    "2h design Acme yesterday",
    "en",
    {
      durationSeconds: 2n * HOUR,
      date: "2026-03-03",
      projectId: "p-web",
      description: "design",
      issues: [],
      confidence: "high",
    },
  ],
  [
    "mention, tag and duration",
    "1h30m call with Bob @Website #meeting",
    "en",
    {
      durationSeconds: 5400n,
      projectId: "p-web",
      tags: ["meeting"],
      description: "call with Bob",
      issues: [],
      confidence: "high",
    },
  ],
  [
    "exact mention",
    "@blog 1h",
    "en",
    { projectId: "p-blog", description: "", issues: [], confidence: "high" },
  ],
  [
    "quoted mention",
    '@"Website Redesign" 1h',
    "en",
    { projectId: "p-web", description: "", confidence: "high" },
  ],
  ["mention of a client prefix", "@acm 1h", "en", { projectId: "p-web", confidence: "high" }],
  ["mention is case and diacritics insensitive", "@CAFE 1h", "en", { projectId: "p-cafe" }],
  ["diacritics in the project name", "@café 1h", "en", { projectId: "p-cafe", confidence: "high" }],
  [
    "hyphens stand for spaces in a mention",
    "@website-redesign 1h",
    "en",
    { projectId: "p-web", confidence: "high" },
  ],
  ["substring mention", "@redesign 1h", "en", { projectId: "p-web", confidence: "medium" }],
  [
    "a mention with nothing to match",
    '@"-" 1h',
    "en",
    { issues: ["project-not-found"], description: "" },
  ],
  [
    "a tag inside a quoted mention belongs to the mention",
    '@"no #match" 1h',
    "en",
    { issues: ["project-not-found"], tags: [], description: "" },
  ],
  [
    "unknown mention",
    "@nothing 1h",
    "en",
    { issues: ["project-not-found"], description: "", confidence: "medium" },
  ],
  [
    "words alone never match inside a name",
    "1h redesign",
    "en",
    { description: "redesign", issues: [] },
  ],
  [
    "whole leading words match",
    "1h website call",
    "en",
    { projectId: "p-web", description: "call", confidence: "high" },
  ],
  ["a partial word does not match", "1h call", "en", { description: "call" }],
  [
    "an e-mail is not a mention",
    "2h mail bob@example.com",
    "en",
    { description: "mail bob@example.com", issues: [] },
  ],
  [
    "numbers after # stay in the description",
    "fix #42 2h",
    "en",
    { description: "fix #42", tags: [] },
  ],
  [
    "tags: exact, deduplicated, prefix and new",
    "#Meeting #meeting #design #fresh 1h",
    "en",
    { tags: ["meeting", "Design Review", "fresh"] },
  ],
  // --- Italian
  [
    "Italian: the backlog example",
    "2h design Acme ieri",
    "it",
    { durationSeconds: 2n * HOUR, date: "2026-03-03", projectId: "p-web", description: "design" },
  ],
  [
    "Italian: oggi and decimal comma",
    "oggi 1,5h",
    "it",
    { date: TODAY, durationSeconds: 5400n, dateSource: "keyword" },
  ],
  [
    "Italian: weekday with an accent",
    "martedì 2 ore revisione",
    "it",
    { date: "2026-03-03", durationSeconds: 7200n, description: "revisione" },
  ],
  ["Italian: short weekday", "lun 30 minuti", "it", { date: "2026-03-02", durationSeconds: 1800n }],
  ["Italian: weekday without the accent", "venerdi 1h", "it", { date: "2026-02-27" }],
  [
    "Italian: range with dalle/alle",
    "dalle 9 alle 10:15 riunione",
    "it",
    { durationSeconds: 4500n, description: "riunione", issues: [] },
  ],
  [
    "Italian: range with a",
    "9 a 10 riunione",
    "it",
    { durationSeconds: HOUR, description: "riunione" },
  ],
  ["Italian: hours and minutes spelled out", "1 ora 30 minuti", "it", { durationSeconds: 5400n }],
  [
    "Italian: an English keyword is just text",
    "2h yesterday",
    "it",
    { date: TODAY, dateSource: "default", description: "yesterday" },
  ],
  [
    "English: an Italian keyword is just text",
    "2h ieri",
    "en",
    { date: TODAY, description: "ieri" },
  ],
  // --- problems
  [
    "no duration",
    "design Acme",
    "en",
    { issues: ["missing-duration"], projectId: "p-web", description: "design", confidence: "low" },
  ],
  [
    "empty input",
    "",
    "en",
    { issues: ["missing-duration"], description: "", confidence: "low", date: TODAY },
  ],
  ["blank input", "   ", "it", { issues: ["missing-duration"], description: "" }],
  [
    "zero duration",
    "0h review",
    "en",
    { issues: ["zero-duration"], confidence: "low", description: "review" },
  ],
  [
    "more than a day",
    "30h migration",
    "en",
    { durationSeconds: 30n * HOUR, issues: ["duration-over-24h"], confidence: "medium" },
  ],
  [
    "two durations: the first wins",
    "2h and 30m",
    "en",
    { durationSeconds: 7200n, issues: ["multiple-durations"], description: "and 30m" },
  ],
  [
    "two ranges: the first wins",
    "9-10 and 11-12",
    "en",
    { durationSeconds: HOUR, issues: ["multiple-durations"] },
  ],
  ["punctuation around the pieces is trimmed", "- review, 2h -", "en", { description: "review" }],
];

describe("parseQuickAdd", () => {
  it.each(cases)("%s: %j", (_name, input, locale, expected) => {
    const draft = run(input, locale);
    const { issues, ...rest } = expected;
    expect(draft).toMatchObject(rest);
    if (issues !== undefined) expect(codes(draft)).toEqual(issues);
  });

  it("has at least 30 table-driven cases", () => {
    expect(cases.length).toBeGreaterThanOrEqual(30);
  });

  it("leaves start and end out unless a range was given", () => {
    expect(Object.keys(run("2h"))).not.toContain("start");
    expect(Object.keys(run("2h"))).not.toContain("end");
    expect(Object.keys(run("9-10"))).toContain("start");
    expect(Object.keys(run("design"))).not.toContain("durationSeconds");
    expect(Object.keys(run("2h"))).not.toContain("projectId");
  });

  describe("project matching", () => {
    const acme: QuickAddProject[] = [
      { id: "a1", name: "Website", clientName: "Acme" },
      { id: "a2", name: "Mobile App", clientName: "Acme" },
      { id: "w", name: "Web", clientName: "Initech" },
      { id: "ws", name: "Website Redesign", clientName: "Initech" },
      { id: "n", name: "Acme", clientName: "Umbrella" },
      { id: "d", name: "Design System", clientName: "Umbrella" },
    ];

    it("reports a client with several projects as ambiguous", () => {
      const draft = run("2h Acme", "en", { projects: acme.slice(0, 2) });
      expect(draft.projectId).toBeUndefined();
      expect(draft.issues).toEqual([
        { code: "ambiguous-project", severity: "warning", text: "Acme", candidates: ["a1", "a2"] },
      ]);
      expect(draft.description).toBe("Acme");
      expect(draft.confidence).toBe("medium");
    });

    it("reports an ambiguous mention too", () => {
      const draft = run("@acme 2h", "en", { projects: acme.slice(0, 2) });
      expect(draft.projectId).toBeUndefined();
      expect(codes(draft)).toEqual(["ambiguous-project"]);
      expect(draft.description).toBe("");
    });

    it("prefers exact over prefix over substring", () => {
      expect(run("@web 1h", "en", { projects: acme }).projectId).toBe("w");
      expect(run("@website 1h", "en", { projects: acme }).projectId).toBe("a1");
      expect(run("@system 1h", "en", { projects: acme }).projectMatch).toEqual({
        kind: "substring",
        via: "project",
        source: "mention",
      });
    });

    it("prefers a project name over a client name of the same kind", () => {
      const draft = run("@acme 1h", "en", {
        projects: [acme[4], acme[0]].filter(Boolean) as QuickAddProject[],
      });
      expect(draft.projectId).toBe("n");
      expect(draft.projectMatch).toEqual({ kind: "exact", via: "project", source: "mention" });
    });

    it("prefers an exact client over a prefix of a project name", () => {
      const projects = [
        { id: "x", name: "Acme Rebrand", clientName: "Foo" },
        { id: "y", name: "Site", clientName: "Acme" },
      ];
      expect(run("@acme 1h", "en", { projects }).projectId).toBe("y");
    });

    it("prefers the longer name when two names match equally well", () => {
      const projects = [
        { id: "short", name: "Acme", clientName: "Initech" },
        { id: "long", name: "Acme Corp", clientName: "Umbrella" },
      ];
      const draft = run("1h Acme Corp kickoff", "en", { projects });
      expect(draft.projectId).toBe("long");
      expect(draft.description).toBe("kickoff");
    });

    it("copes with a project that has no client", () => {
      const projects = [{ id: "solo", name: "Solo", clientName: "" }];
      expect(run("1h solo", "en", { projects }).projectId).toBe("solo");
      expect(run("@so 1h", "en", { projects }).projectId).toBe("solo");
      expect(run("1h nothing", "en", { projects }).projectId).toBeUndefined();
    });

    it("describes how a free-text match was made", () => {
      expect(
        run("1h Acme", "en", {
          projects: acme.slice(1, 2).map((p) => ({ ...p, clientName: "Acme" })),
        }).projectMatch,
      ).toEqual({
        kind: "exact",
        via: "client",
        source: "text",
      });
      expect(run("1h blog", "en").projectMatch).toEqual({
        kind: "exact",
        via: "project",
        source: "text",
      });
    });

    it("takes the longest, best run of words", () => {
      const draft = run("1h website redesign planning", "en");
      expect(draft.projectId).toBe("p-web");
      expect(draft.projectMatch?.kind).toBe("exact");
      expect(draft.description).toBe("planning");
    });

    it("does not let a prefix of a loose word beat a better match", () => {
      const projects = [...acme.slice(4)];
      // "design" starts "Design System" (prefix); "Acme" is a whole project name (exact).
      const draft = run("2h design Acme yesterday", "en", { projects });
      expect(draft.projectId).toBe("n");
      expect(draft.description).toBe("design");
    });

    it("ignores one-letter words and joins words only when they are close together", () => {
      const projects = [{ id: "q", name: "Q", clientName: "Big Bang" }];
      expect(run("1h q", "en", { projects }).projectId).toBeUndefined();
      // "big ... bang": the gap is too long to be one name, so only "big" (a leading word) matches
      expect(run("1h big ... bang", "en", { projects })).toMatchObject({
        projectId: "q",
        description: "... bang",
      });
      expect(run("1h big & bang", "en", { projects })).toMatchObject({
        projectId: "q",
        description: "",
      });
    });

    it("does not join words that sit on both sides of an already recognised piece", () => {
      const projects = [{ id: "q", name: "Big Bang", clientName: "Initech" }];
      expect(run("big 2h bang", "en", { projects })).toMatchObject({
        projectId: "q",
        description: "bang",
      });
    });

    it("does not read a project name inside a mention or a tag", () => {
      const draft = run("@blog #blog 1h", "en");
      expect(draft.projectId).toBe("p-blog");
      expect(draft.tags).toEqual(["blog"]);
    });

    it("works without projects or tags", () => {
      const draft = run("1h Acme #x @y", "en", { projects: [], tags: [] });
      expect(draft.tags).toEqual(["x"]);
      expect(codes(draft)).toEqual(["project-not-found"]);
      expect(draft.description).toBe("Acme");
    });
  });

  describe("time zones and DST", () => {
    it("reads today in the user's zone", () => {
      const late = "2026-03-04T23:30:00Z";
      expect(run("2h", "en", { now: late }).date).toBe("2026-03-05"); // Rome
      expect(run("2h", "en", { now: late, timeZone: "America/New_York" }).date).toBe("2026-03-04");
      expect(run("2h today", "en", { now: late, timeZone: "Pacific/Auckland" }).date).toBe(
        "2026-03-05",
      );
    });

    it("turns a range into UTC instants of the right offset", () => {
      const draft = run("9-10", "en", { timeZone: "America/New_York" });
      expect([draft.start, draft.end]).toEqual(["2026-03-04T14:00:00Z", "2026-03-04T15:00:00Z"]);
    });

    it("measures a range across the spring-forward gap in real time", () => {
      // Sunday 2026-03-29 in Rome: 01:00 CET -> 03:00 CEST is one hour of elapsed time.
      const draft = run("1-3 night shift", "en", { now: "2026-03-30T10:00:00Z", timeZone: ZONE });
      expect(draft).toMatchObject({ date: "2026-03-30" });
      const yesterday = run("yesterday 1-3", "en", { now: "2026-03-30T10:00:00Z", timeZone: ZONE });
      expect(yesterday.date).toBe("2026-03-29");
      expect([yesterday.start, yesterday.end]).toEqual([
        "2026-03-29T00:00:00Z",
        "2026-03-29T01:00:00Z",
      ]);
      expect(yesterday.durationSeconds).toBe(3600n);
    });

    it("measures a range across the fall-back hour in real time", () => {
      // Sunday 2026-10-25 in Rome: 01:00 CEST -> 04:00 CET is four hours of elapsed time.
      const draft = run("yesterday 1-4", "en", { now: "2026-10-26T10:00:00Z", timeZone: ZONE });
      expect(draft.date).toBe("2026-10-25");
      expect(draft.durationSeconds).toBe(4n * 3600n);
    });

    it("a range that starts in the gap moves forward (a 02:30 that does not exist)", () => {
      const draft = run("yesterday 2:30-4", "en", { now: "2026-03-30T10:00:00Z", timeZone: ZONE });
      // 02:30 CET does not exist: it becomes 03:30 CEST (01:30Z); 04:00 CEST is 02:00Z.
      expect(draft.start).toBe("2026-03-29T01:30:00Z");
      expect(draft.durationSeconds).toBe(1800n);
    });

    it("flags a 25-hour day as more than 24 hours", () => {
      const draft = run("yesterday 0-24", "en", { now: "2026-10-26T10:00:00Z", timeZone: ZONE });
      expect(draft.durationSeconds).toBe(25n * 3600n);
      expect(draft.issues).toEqual([
        { code: "duration-over-24h", severity: "warning", text: "0-24" },
      ]);
    });

    it("a range that collapses into the gap is empty", () => {
      const draft = run("yesterday 2-3", "en", { now: "2026-03-30T10:00:00Z", timeZone: ZONE });
      expect(codes(draft)).toEqual(["empty-range"]);
    });
  });

  it("rejects unusable options", () => {
    expect(() => run("1h", "en", { now: "yesterday" })).toThrow(InvalidInstantError);
    expect(() => run("1h", "en", { timeZone: "Nowhere" })).toThrow(InvalidTimeZoneError);
  });

  describe("properties", () => {
    it("never throws and always returns a consistent draft, whatever the text", () => {
      fc.assert(
        fc.property(
          fc.string({ maxLength: 60 }),
          fc.constantFrom("en" as const, "it" as const),
          (text, locale) => {
            const draft = run(text, locale);
            expect(draft.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            expect(["high", "medium", "low"]).toContain(draft.confidence);
            expect(draft.description).toBe(draft.description.trim());
            if (draft.durationSeconds === undefined) {
              expect(
                codes(draft).some((code) =>
                  ["missing-duration", "zero-duration", "empty-range", "invalid-time"].includes(
                    code,
                  ),
                ),
              ).toBe(true);
            }
          },
        ),
        { numRuns: 500 },
      );
    });

    it("reads hours and minutes exactly", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 99 }),
          fc.integer({ min: 0, max: 59 }),
          fc.constantFrom("{h}h{m}", "{h}h{m}m", "{h}h {m}m", "{h} hours {m} minutes"),
          (hours, minutes, template) => {
            fc.pre(hours > 0 || minutes > 0);
            const text = template.replace("{h}", String(hours)).replace("{m}", String(minutes));
            const draft = run(`${text} work`);
            expect(draft.durationSeconds).toBe(BigInt(hours * 3600 + minutes * 60));
            expect(draft.description).toBe("work");
          },
        ),
      );
    });

    it("reads decimal hours exactly, in both separators", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 99 }),
          fc.integer({ min: 0, max: 99 }),
          fc.constantFrom(".", ","),
          (whole, hundredths, separator) => {
            fc.pre(whole > 0 || hundredths > 0);
            const text = `${whole}${separator}${String(hundredths).padStart(2, "0")}h`;
            // hundredths of an hour are 36 seconds each: always whole seconds
            expect(run(text).durationSeconds).toBe(BigInt(whole * 3600 + hundredths * 36));
          },
        ),
      );
    });

    it("reads ranges as the difference of the two times", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 22 * 60 }),
          fc.integer({ min: 1, max: 60 }),
          (from, length) => {
            const clock = (minutes: number): string =>
              `${(minutes - (minutes % 60)) / 60}:${String(minutes % 60).padStart(2, "0")}`;
            const draft = run(`${clock(from)}-${clock(from + length)}`, "en", { timeZone: "UTC" });
            expect(draft.durationSeconds).toBe(BigInt(length * 60));
            expect(codes(draft)).toEqual([]);
          },
        ),
      );
    });
  });
});
