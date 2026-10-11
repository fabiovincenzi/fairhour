import { type RoundingMode, decimal, decimalToString, money, price } from "@fairhour/money";
import {
  type CountryCode,
  InvalidInputError,
  isoDate,
  validateInvoiceInput,
} from "@fairhour/tax-core";
import { describe, expect, it } from "vitest";
import {
  ROME,
  client,
  dayRateProject,
  draftOptions,
  entriesOfDurations,
  entry,
  eur,
  fixedProject,
  hourlyProject,
  summary,
} from "../../test/invoice";
import {
  InvalidBillingModeError,
  InvalidDateError,
  InvalidInstantError,
  InvalidIntervalError,
  InvalidTimeZoneError,
} from "../errors";
import { DuplicateExchangeRateError, MissingRateError } from "../rates/errors";
import type { DurationRounding } from "../time/duration";
import { buildInvoiceDraft } from "./draft";
import { DraftError, type DraftErrorReason } from "./errors";
import type { BillableEntry, InvoiceDraftOptions, ProjectBilling } from "./types";

const alpha = hourlyProject("alpha", "Alpha");
const beta = hourlyProject("beta", "Beta");

function draft(
  entries: readonly BillableEntry[],
  projects: readonly ProjectBilling[] = [alpha],
  overrides: Partial<InvoiceDraftOptions> = {},
) {
  return buildInvoiceDraft(entries, projects, draftOptions(overrides));
}

const plusMinutes = (instant: string, minutes: number): string =>
  new Date(Date.parse(instant) + minutes * 60_000).toISOString();

function thrown(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
}

function draftError(run: () => unknown): DraftError {
  const error = thrown(run);
  expect(error).toBeInstanceOf(DraftError);
  return error as DraftError;
}

describe("the entries of the period", () => {
  it.each<[string, string, string, string, string, boolean]>([
    [
      "first local second of the period (CET)",
      "2026-02-28T23:00:00Z",
      ROME,
      "2026-03-01",
      "2026-03-31",
      true,
    ],
    [
      "last local second before the period",
      "2026-02-28T22:59:59Z",
      ROME,
      "2026-03-01",
      "2026-03-31",
      false,
    ],
    [
      "last local second of the period (CEST)",
      "2026-03-31T21:59:59Z",
      ROME,
      "2026-03-01",
      "2026-03-31",
      true,
    ],
    [
      "first local second after the period",
      "2026-03-31T22:00:00Z",
      ROME,
      "2026-03-01",
      "2026-03-31",
      false,
    ],
    [
      "an instant with an offset is read in the time zone",
      "2026-03-01T00:30:00+01:00",
      ROME,
      "2026-03-01",
      "2026-03-31",
      true,
    ],
    [
      "the UTC date is not the local date",
      "2026-03-31T22:30:00Z",
      ROME,
      "2026-04-01",
      "2026-04-30",
      true,
    ],
    [
      "east of UTC: already the next day",
      "2026-03-01T11:30:00Z",
      "Pacific/Auckland",
      "2026-03-01",
      "2026-03-01",
      false,
    ],
    [
      "east of UTC: on the next day",
      "2026-03-01T11:30:00Z",
      "Pacific/Auckland",
      "2026-03-02",
      "2026-03-02",
      true,
    ],
    [
      "west of UTC: still the previous day",
      "2026-03-02T07:30:00Z",
      "America/Los_Angeles",
      "2026-03-01",
      "2026-03-01",
      true,
    ],
    [
      "west of UTC: not the next day",
      "2026-03-02T07:30:00Z",
      "America/Los_Angeles",
      "2026-03-02",
      "2026-03-02",
      false,
    ],
    ["UTC itself", "2026-03-01T00:00:00Z", "UTC", "2026-03-01", "2026-03-01", true],
    [
      "spring forward (23 h day): first second",
      "2026-03-28T23:00:00Z",
      ROME,
      "2026-03-29",
      "2026-03-29",
      true,
    ],
    [
      "spring forward (23 h day): last second",
      "2026-03-29T21:59:59Z",
      ROME,
      "2026-03-29",
      "2026-03-29",
      true,
    ],
    [
      "spring forward (23 h day): next day",
      "2026-03-29T22:00:00Z",
      ROME,
      "2026-03-29",
      "2026-03-29",
      false,
    ],
    [
      "spring forward (23 h day): the day before",
      "2026-03-28T22:59:59Z",
      ROME,
      "2026-03-29",
      "2026-03-29",
      false,
    ],
    [
      "fall back (25 h day): first second",
      "2026-10-24T22:00:00Z",
      ROME,
      "2026-10-25",
      "2026-10-25",
      true,
    ],
    [
      "fall back (25 h day): last second",
      "2026-10-25T22:59:59Z",
      ROME,
      "2026-10-25",
      "2026-10-25",
      true,
    ],
    [
      "fall back (25 h day): next day",
      "2026-10-25T23:00:00Z",
      ROME,
      "2026-10-25",
      "2026-10-25",
      false,
    ],
    [
      "fall back (25 h day): the day before",
      "2026-10-24T21:59:59Z",
      ROME,
      "2026-10-25",
      "2026-10-25",
      false,
    ],
  ])("%s", (_name, start, timeZone, from, to, included) => {
    const result = draft([entry("e1", start, plusMinutes(start, 30))], [alpha], {
      timeZone,
      period: { from: isoDate(from), to: isoDate(to) },
    });
    expect(result.provenance.flatMap((line) => line.entryIds)).toEqual(included ? ["e1"] : []);
    expect(result.input.lines).toHaveLength(included ? 1 : 0);
  });

  it("invoices an entry that spans midnight in full, on the day it starts", () => {
    const night = entry("night", "2026-03-31T21:00:00Z", "2026-03-31T23:30:00Z"); // 23:00 to 01:30
    expect(summary(draft([night]))).toEqual(["p:alpha | 2.50 hour x 80 EUR"]);
    const april = { period: { from: isoDate("2026-04-01"), to: isoDate("2026-04-30") } };
    expect(draft([night], [alpha], april).input.lines).toEqual([]);
  });

  it("measures elapsed time across a DST change, not the wall clock", () => {
    // 01:30 CET to 03:30 CEST: two hours on the clock, one hour elapsed
    const spring = entry("spring", "2026-03-29T00:30:00Z", "2026-03-29T01:30:00Z");
    // 01:30 CEST to 03:30 CET: two hours on the clock, three hours elapsed
    const fall = entry("fall", "2026-10-24T23:30:00Z", "2026-10-25T02:30:00Z");
    expect(summary(draft([spring]))).toEqual(["p:alpha | 1.00 hour x 80 EUR"]);
    const october = { period: { from: isoDate("2026-10-01"), to: isoDate("2026-10-31") } };
    expect(summary(draft([fall], [alpha], october))).toEqual(["p:alpha | 3.00 hour x 80 EUR"]);
  });

  it("works with instants written with an offset", () => {
    const offset = entry("o", "2026-03-02T09:00:00+01:00", "2026-03-02T10:30:00+01:00");
    expect(summary(draft([offset]))).toEqual(["p:alpha | 1.50 hour x 80 EUR"]);
  });

  it("drops the fractions of a second, like every duration of the package", () => {
    const fractional = entry("f", "2026-03-02T08:00:00.900Z", "2026-03-02T09:00:00.100Z");
    expect(summary(draft([fractional]))).toEqual(["p:alpha | 1.00 hour x 80 EUR"]);
  });

  it("has no lines without entries, and still validates", () => {
    const empty = draft([]);
    expect(empty.input.lines).toEqual([]);
    expect(empty.provenance).toEqual([]);
    expect(empty.adjustments).toEqual([]);
    expect(empty.input.exchangeRates).toBeUndefined();
    expect(empty.input.documentKind).toBe("invoice");
  });

  it("ignores the entries outside the period, whatever their state", () => {
    const outside = [
      entry("running", "2026-02-10T08:00:00Z", null),
      entry("ghost", "2026-02-10T08:00:00Z", "2026-02-10T09:00:00Z", { projectId: "nobody" }),
      entry("bad id", "2026-04-10T08:00:00Z", "2026-04-10T09:00:00Z"),
    ];
    expect(draft(outside).input.lines).toEqual([]);
  });

  it("is the same for any order of the entries", () => {
    const entries = [
      entry("c", "2026-03-04T08:00:00Z", "2026-03-04T09:00:00Z"),
      entry("a", "2026-03-02T08:00:00Z", "2026-03-02T10:00:00Z"),
      entry("b", "2026-03-02T08:00:00Z", "2026-03-02T08:30:00Z"),
    ];
    const forward = draft(entries, [alpha], { grouping: "entry" });
    expect(draft([...entries].reverse(), [alpha], { grouping: "entry" })).toEqual(forward);
    // same start: the id breaks the tie
    expect(forward.provenance.map((line) => line.lineId)).toEqual(["e:a", "e:b", "e:c"]);
  });
});

describe("rounding", () => {
  const step = (minutes: 6 | 15 | 30, direction: "up" | "nearest" | "down"): DurationRounding => ({
    kind: "step",
    minutes,
    direction,
  });
  const none: DurationRounding = { kind: "none" };
  const minutes = (count: number, seconds = 0): number => count * 60 + seconds;

  it.each<[string, DurationRounding, "entry" | "line", number[], string, string[]]>([
    ["no rounding, whole hours", none, "entry", [3600, 7200], "3.00", []],
    [
      "each entry up to 15 minutes",
      step(15, "up"),
      "entry",
      [minutes(7), minutes(7), minutes(7)],
      "0.75",
      ["e1", "e2", "e3"],
    ],
    [
      "the line total up to 15 minutes",
      step(15, "up"),
      "line",
      [minutes(7), minutes(7), minutes(7)],
      "0.50",
      ["line"],
    ],
    [
      "a tie rounds up (7 min 30 s)",
      step(15, "nearest"),
      "entry",
      [minutes(7, 30)],
      "0.25",
      ["e1"],
    ],
    [
      "just under the tie rounds down",
      step(15, "nearest"),
      "entry",
      [minutes(7, 29)],
      "0.00",
      ["e1"],
    ],
    [
      "down: a minute short of a step",
      step(15, "down"),
      "entry",
      [minutes(14, 59), minutes(15)],
      "0.25",
      ["e1"],
    ],
    ["6 minutes, nearest", step(6, "nearest"), "entry", [minutes(20)], "0.30", ["e1"]],
    ["30 minutes, up", step(30, "up"), "entry", [minutes(31)], "1.00", ["e1"]],
    [
      "a multiple of the step is left alone",
      step(30, "up"),
      "entry",
      [minutes(30), minutes(90)],
      "2.00",
      [],
    ],
    [
      "the line total down to 30 minutes",
      step(30, "down"),
      "line",
      [minutes(25), minutes(25)],
      "0.50",
      ["line"],
    ],
    [
      "the line total, already a multiple",
      step(15, "up"),
      "line",
      [minutes(10), minutes(5)],
      "0.25",
      [],
    ],
  ])("%s", (_name, rounding, roundingScope, durations, hours, adjusted) => {
    const result = draft(entriesOfDurations(durations), [
      hourlyProject("alpha", "Alpha", { rounding, roundingScope }),
    ]);
    expect(decimalToString(result.input.lines[0]?.quantity ?? decimal("-1"))).toBe(hours);
    // a 6, 15 or 30 minute step gives 0.1, 0.25 or 0.5 hours exactly: no quantity adjustment
    expect(result.adjustments.map((a) => a.kind)).not.toContain("quantity-rounded");
    expect(
      result.adjustments.map((a) =>
        a.kind === "duration-rounded"
          ? a.entryId
          : a.kind === "line-duration-rounded"
            ? "line"
            : a.kind,
      ),
    ).toEqual(adjusted);
  });

  it("records the exact change of an entry and of a line", () => {
    const entries = entriesOfDurations([minutes(7), minutes(8)]);
    const perEntry = draft(entries, [
      hourlyProject("alpha", "Alpha", { rounding: step(15, "up") }),
    ]);
    expect(perEntry.adjustments).toEqual([
      { kind: "duration-rounded", entryId: "e1", fromSeconds: 420n, toSeconds: 900n },
      { kind: "duration-rounded", entryId: "e2", fromSeconds: 480n, toSeconds: 900n },
    ]);
    const perLine = draft(entries, [
      hourlyProject("alpha", "Alpha", { rounding: step(15, "up"), roundingScope: "line" }),
    ]);
    // 7 + 8 minutes make 15: the line total is already a multiple of the step
    expect(perLine.adjustments).toEqual([]);
    const longer = draft(entriesOfDurations([minutes(7), minutes(9)]), [
      hourlyProject("alpha", "Alpha", { rounding: step(15, "up"), roundingScope: "line" }),
    ]);
    expect(longer.adjustments).toEqual([
      { kind: "line-duration-rounded", lineId: "p:alpha", fromSeconds: 960n, toSeconds: 1800n },
    ]);
  });

  it.each<[string, number, 2 | 3 | 4, RoundingMode | undefined, string, string | undefined]>([
    ["a third of an hour, half up (the default)", 1200, 2, undefined, "0.33", "1/3"],
    ["a third of an hour, up", 1200, 2, "up", "0.34", "1/3"],
    ["a third of an hour, down", 1200, 2, "down", "0.33", "1/3"],
    ["a third of an hour, 4 decimals", 1200, 4, "halfUp", "0.3333", "1/3"],
    ["two thirds, 3 decimals", 2400, 3, "halfUp", "0.667", "2/3"],
    ["0.125 h is a tie at 2 decimals: half up", 450, 2, "halfUp", "0.13", "1/8"],
    ["0.125 h is a tie at 2 decimals: half even", 450, 2, "halfEven", "0.12", "1/8"],
    ["0.125 h is exact at 3 decimals", 450, 3, "halfUp", "0.125", undefined],
    ["a minute", 60, 2, "halfUp", "0.02", "1/60"],
    ["a second, 4 decimals", 1, 4, "halfUp", "0.0003", "1/3600"],
    ["whole hours are exact", 7200, 2, "halfUp", "2.00", undefined],
    ["nothing at all", 0, 2, "halfUp", "0.00", undefined],
  ])("hours: %s", (_name, seconds, hoursScale, hoursRounding, hours, exact) => {
    const result = draft(entriesOfDurations([seconds]), [alpha], {
      hoursScale,
      ...(hoursRounding === undefined ? {} : { hoursRounding }),
    });
    const quantity = result.input.lines[0]?.quantity ?? decimal("-1");
    expect(decimalToString(quantity)).toBe(hours);
    expect(result.adjustments).toEqual(
      exact === undefined
        ? []
        : [{ kind: "quantity-rounded", lineId: "p:alpha", exact, rounded: quantity }],
    );
  });

  it("does not round the hours of a fixed price", () => {
    const rounded = fixedProject("alpha", "Alpha", {
      rounding: { kind: "step", minutes: 30, direction: "up" },
    });
    const result = draft(entriesOfDurations([minutes(7)]), [rounded]);
    expect(result.adjustments).toEqual([]);
  });
});

describe("grouping", () => {
  const entries = [
    entry("a1", "2026-03-02T08:00:00Z", "2026-03-02T10:00:00Z", {
      taskId: "t1",
      taskName: "Design",
      description: "Wireframes",
    }),
    entry("a2", "2026-03-03T08:00:00Z", "2026-03-03T09:30:00Z", {
      taskId: "t2",
      taskName: "Build",
      description: "API",
    }),
    entry("a3", "2026-03-04T09:00:00Z", "2026-03-04T10:00:00Z", {
      taskId: "t1",
      taskName: "Design",
      description: "Review",
    }),
    entry("a4", "2026-03-05T09:00:00Z", "2026-03-05T09:30:00Z", { description: "Admin" }),
    entry("b1", "2026-03-02T13:00:00Z", "2026-03-02T14:00:00Z", {
      projectId: "beta",
      rate: eur("100"),
      description: "Workshop",
    }),
  ];
  const projects = [beta, alpha];

  it("project: one line per project", () => {
    const result = draft(entries, projects, { grouping: "project" });
    expect(summary(result)).toEqual([
      "p:alpha | 5.00 hour x 80 EUR",
      "p:beta | 1.00 hour x 100 EUR",
    ]);
    expect(result.provenance).toEqual([
      { lineId: "p:alpha", entryIds: ["a1", "a2", "a3", "a4"] },
      { lineId: "p:beta", entryIds: ["b1"] },
    ]);
    expect(result.input.lines.map((line) => line.description)).toEqual(["Alpha", "Beta"]);
  });

  it("task: one line per task, entries without a task on the project line", () => {
    const result = draft(entries, projects, { grouping: "task" });
    expect(summary(result)).toEqual([
      "p:alpha | 0.50 hour x 80 EUR",
      "t:t2 | 1.50 hour x 80 EUR",
      "t:t1 | 3.00 hour x 80 EUR",
      "p:beta | 1.00 hour x 100 EUR",
    ]);
    expect(result.provenance.map((line) => line.entryIds)).toEqual([
      ["a4"],
      ["a2"],
      ["a1", "a3"],
      ["b1"],
    ]);
    expect(result.input.lines.map((line) => line.description)).toEqual([
      "Alpha",
      "Alpha - Build",
      "Alpha - Design",
      "Beta",
    ]);
  });

  it("entry: one line per entry, in chronological order within the project", () => {
    const result = draft(entries, projects, { grouping: "entry" });
    expect(summary(result)).toEqual([
      "e:a1 | 2.00 hour x 80 EUR",
      "e:a2 | 1.50 hour x 80 EUR",
      "e:a3 | 1.00 hour x 80 EUR",
      "e:a4 | 0.50 hour x 80 EUR",
      "e:b1 | 1.00 hour x 100 EUR",
    ]);
    expect(result.input.lines.map((line) => line.description)).toEqual([
      "Wireframes",
      "API",
      "Review",
      "Admin",
      "Workshop",
    ]);
  });

  it("single: one line for everything that shares a project and a rate", () => {
    const onlyAlpha = entries.slice(0, 4);
    expect(summary(draft(onlyAlpha, projects, { grouping: "single" }))).toEqual([
      "all | 5.00 hour x 80 EUR",
    ]);
    expect(summary(draft(entries, projects, { grouping: "single" }))).toEqual([
      "all:1 | 5.00 hour x 80 EUR",
      "all:2 | 1.00 hour x 100 EUR",
    ]);
  });

  it("orders the lines by project name, not by the order of the projects", () => {
    const zeta = hourlyProject("zeta", "Aardvark");
    const result = draft(
      [
        entry("z1", "2026-03-02T08:00:00Z", "2026-03-02T09:00:00Z", { projectId: "zeta" }),
        entry("a1", "2026-03-01T08:00:00Z", "2026-03-01T09:00:00Z"),
      ],
      [alpha, zeta],
    );
    expect(result.input.lines.map((line) => line.id)).toEqual(["p:zeta", "p:alpha"]);
  });

  it("never puts entries at different rates on the same line", () => {
    const rates = [
      entry("r1", "2026-03-02T08:00:00Z", "2026-03-02T09:00:00Z", { taskId: "t1" }),
      entry("r2", "2026-03-03T08:00:00Z", "2026-03-03T09:00:00Z", {
        taskId: "t1",
        rate: eur("90"),
      }),
      entry("r3", "2026-03-04T08:00:00Z", "2026-03-04T09:00:00Z", {
        taskId: "t1",
        rate: eur("80.00"),
      }),
    ];
    // 80 and 80.00 are the same rate; the line numbers follow the first entry of each line
    expect(summary(draft(rates, [alpha], { grouping: "project" }))).toEqual([
      "p:alpha:1 | 2.00 hour x 80 EUR",
      "p:alpha:2 | 1.00 hour x 90 EUR",
    ]);
    expect(summary(draft(rates, [alpha], { grouping: "task" }))).toEqual([
      "t:t1:1 | 2.00 hour x 80 EUR",
      "t:t1:2 | 1.00 hour x 90 EUR",
    ]);
    expect(summary(draft(rates, [alpha], { grouping: "single" }))).toEqual([
      "all:1 | 2.00 hour x 80 EUR",
      "all:2 | 1.00 hour x 90 EUR",
    ]);
  });

  it("keeps a rate in another currency apart, even for the same amount", () => {
    const mixed = [
      entry("m1", "2026-03-02T08:00:00Z", "2026-03-02T09:00:00Z"),
      entry("m2", "2026-03-03T08:00:00Z", "2026-03-03T09:00:00Z", { rate: price("80", "USD") }),
    ];
    const rate = { from: "USD", rate: decimal("1"), date: isoDate("2026-04-01") } as const;
    expect(summary(draft(mixed, [alpha], { exchangeRates: [rate] }))).toEqual([
      "p:alpha:1 | 1.00 hour x 80 EUR",
      "p:alpha:2 | 1.00 hour x 80 EUR",
    ]);
  });

  it("describes a task line by its project when the task has no name", () => {
    const unnamed = [entry("u1", "2026-03-02T08:00:00Z", "2026-03-02T09:00:00Z", { taskId: "t9" })];
    const result = draft(unnamed, [alpha], { grouping: "task" });
    expect(result.input.lines.map((line) => [line.id, line.description])).toEqual([
      ["t:t9", "Alpha"],
    ]);
  });
});

describe("day rate", () => {
  const day = dayRateProject("alpha", "Alpha");
  const rate = price("560", "EUR");
  const d = (
    date: string,
    from: string,
    to: string,
    id: string,
    overrides: Partial<BillableEntry> = {},
  ) => entry(id, `${date}T${from}:00Z`, `${date}T${to}:00Z`, { rate, ...overrides });

  it.each<[string, BillableEntry[], string]>([
    ["3 hours is half a day", [d("2026-03-02", "08:00", "11:00", "e1")], "0.5"],
    ["exactly 4 hours is half a day", [d("2026-03-02", "08:00", "12:00", "e1")], "0.5"],
    [
      "a second over 4 hours is a day",
      [
        d("2026-03-02", "08:00", "12:00", "e1"),
        d("2026-03-02", "13:00", "13:00", "e2", { end: "2026-03-02T13:00:01Z" }),
      ],
      "1.0",
    ],
    ["a full day", [d("2026-03-02", "08:00", "16:00", "e1")], "1.0"],
    ["more than a day is still a day", [d("2026-03-02", "06:00", "18:00", "e1")], "1.0"],
    [
      "entries of one day are added up",
      [d("2026-03-02", "08:00", "10:00", "e1"), d("2026-03-02", "13:00", "16:00", "e2")],
      "1.0",
    ],
    [
      "two short entries of one day",
      [d("2026-03-02", "08:00", "10:00", "e1"), d("2026-03-02", "13:00", "15:00", "e2")],
      "0.5",
    ],
    [
      "each day counts on its own",
      [d("2026-03-02", "08:00", "11:00", "e1"), d("2026-03-03", "08:00", "14:00", "e2")],
      "1.5",
    ],
    ["a day without time counts nothing", [d("2026-03-02", "08:00", "08:00", "e1")], "0.0"],
    [
      "an entry past midnight counts on the day it starts",
      [entry("e1", "2026-03-02T22:30:00Z", "2026-03-03T04:00:00Z", { rate })],
      "1.0",
    ],
    [
      "the elapsed time, not the clock: 3.5 h on the spring-forward day",
      [entry("e1", "2026-03-28T23:30:00Z", "2026-03-29T03:00:00Z", { rate })],
      "0.5",
    ],
    [
      "the elapsed time, not the clock: 5 h on the fall-back day",
      [entry("e1", "2026-10-24T22:30:00Z", "2026-10-25T03:30:00Z", { rate })],
      "1.0",
    ],
  ])("%s", (_name, entries, days) => {
    const period = { from: isoDate("2026-03-01"), to: isoDate("2026-10-31") };
    const result = draft(entries, [day], { period });
    expect(result.input.lines).toHaveLength(1);
    const [line] = result.input.lines;
    expect(decimalToString(line?.quantity ?? decimal("-1"))).toBe(days);
    expect(line?.unit).toBe("day");
    expect(line?.kind).toBe("service");
    expect(decimalToString(line?.unitPrice.amount ?? decimal("-1"))).toBe("560");
  });

  it("splits a day only at the grouping a day allows", () => {
    const entries = [
      d("2026-03-02", "08:00", "11:00", "e1", { taskId: "t1" }),
      d("2026-03-02", "13:00", "16:00", "e2", { taskId: "t2" }),
      d("2026-03-03", "08:00", "10:00", "e3"),
    ];
    // one line per task would bill 0.5 + 0.5 days for a day that is 6 hours: a whole day
    expect(summary(draft(entries, [day], { grouping: "task" }))).toEqual([
      "p:alpha | 1.5 day x 560 EUR",
    ]);
    // one line per entry becomes one line per local day
    const perDay = draft(entries, [day], { grouping: "entry" });
    expect(summary(perDay)).toEqual(["e:e1 | 1.0 day x 560 EUR", "e:e3 | 0.5 day x 560 EUR"]);
    expect(perDay.provenance.map((line) => line.entryIds)).toEqual([["e1", "e2"], ["e3"]]);
    expect(perDay.input.lines.map((line) => line.description)).toEqual([
      "Alpha - 2026-03-02",
      "Alpha - 2026-03-03",
    ]);
    expect(summary(draft(entries, [day], { grouping: "single" }))).toEqual([
      "all | 1.5 day x 560 EUR",
    ]);
  });

  it("rounds each entry, or each day when the project rounds lines", () => {
    // 2 h 25 min twice on one day: 4 h 50 min is a day, but 2 h + 2 h (rounded down) is half a day
    const entries = [
      d("2026-03-02", "08:00", "10:25", "e1"),
      d("2026-03-02", "13:00", "15:25", "e2"),
    ];
    const rounding: DurationRounding = { kind: "step", minutes: 30, direction: "down" };
    const perEntry = draft(entries, [dayRateProject("alpha", "Alpha", { rounding })]);
    expect(summary(perEntry)).toEqual(["p:alpha | 0.5 day x 560 EUR"]);
    expect(perEntry.adjustments.map((a) => a.kind)).toEqual([
      "duration-rounded",
      "duration-rounded",
    ]);
    const perLine = draft(entries, [
      dayRateProject("alpha", "Alpha", { rounding, roundingScope: "line" }),
    ]);
    expect(summary(perLine)).toEqual(["p:alpha | 1.0 day x 560 EUR"]);
    expect(perLine.adjustments).toEqual([
      {
        kind: "line-duration-rounded",
        lineId: "p:alpha",
        fromSeconds: 17_400n,
        toSeconds: 16_200n,
      },
    ]);
    // a day that is already a multiple of the step records nothing
    const exact = draft(
      [d("2026-03-02", "08:00", "10:00", "e1")],
      [dayRateProject("alpha", "Alpha", { rounding, roundingScope: "line" })],
    );
    expect(exact.adjustments).toEqual([]);
  });

  it("bills two rates on the same day as two lines", () => {
    const entries = [
      d("2026-03-02", "08:00", "12:00", "e1"),
      d("2026-03-02", "13:00", "17:00", "e2", { rate: price("600", "EUR") }),
    ];
    expect(summary(draft(entries, [day]))).toEqual([
      "p:alpha:1 | 0.5 day x 560 EUR",
      "p:alpha:2 | 0.5 day x 600 EUR",
    ]);
  });

  it("needs a rate per day, and a sound day rate", () => {
    const noRate = entry("e1", "2026-03-02T08:00:00Z", "2026-03-02T09:00:00Z");
    const { rate: _, ...unpriced } = noRate;
    expect(thrown(() => draft([unpriced], [day]))).toEqual(new MissingRateError("day"));
    const impossible = dayRateProject("alpha", "Alpha", {
      mode: { kind: "day-rate", hoursPerDay: decimal("4"), halfDayMaxHours: decimal("6") },
    });
    expect(thrown(() => draft([noRate], [impossible]))).toBeInstanceOf(InvalidBillingModeError);
  });
});

describe("fixed price", () => {
  it("is one lump-sum line per project, whatever the hours and the grouping", () => {
    const entries = entriesOfDurations([3600, 7200, 600], { projectId: "alpha" });
    for (const grouping of ["project", "task", "entry"] as const) {
      const result = draft(entries, [fixedProject("alpha", "Alpha")], { grouping });
      expect(summary(result)).toEqual(["p:alpha | 1 lump-sum x 1500.00 EUR"]);
      expect(result.provenance).toEqual([{ lineId: "p:alpha", entryIds: ["e1", "e2", "e3"] }]);
    }
    const single = draft(entries, [fixedProject("alpha", "Alpha")], { grouping: "single" });
    expect(summary(single)).toEqual(["all | 1 lump-sum x 1500.00 EUR"]);
  });

  it("needs no rate, and ignores the one an entry has", () => {
    const { rate: _, ...unpriced } = entry("e1", "2026-03-02T08:00:00Z", "2026-03-02T09:00:00Z");
    const result = draft(
      [unpriced, entry("e2", "2026-03-03T08:00:00Z", "2026-03-03T09:00:00Z", { rate: eur("999") })],
      [fixedProject("alpha")],
    );
    expect(summary(result)).toEqual(["p:alpha | 1 lump-sum x 1500.00 EUR"]);
  });

  it("goes next to hourly work of other projects", () => {
    const entries = [
      entry("h1", "2026-03-02T08:00:00Z", "2026-03-02T10:00:00Z", { projectId: "beta" }),
      entry("f1", "2026-03-03T08:00:00Z", "2026-03-03T09:00:00Z"),
    ];
    const projects = [fixedProject("alpha", "Alpha"), beta];
    expect(summary(draft(entries, projects))).toEqual([
      "p:alpha | 1 lump-sum x 1500.00 EUR",
      "p:beta | 2.00 hour x 80 EUR",
    ]);
    expect(summary(draft(entries, projects, { grouping: "single" }))).toEqual([
      "all:1 | 1 lump-sum x 1500.00 EUR",
      "all:2 | 2.00 hour x 80 EUR",
    ]);
  });

  it("has no line when the project has no entry in the period", () => {
    expect(draft([], [fixedProject("alpha")]).input.lines).toEqual([]);
  });
});

describe("extra lines", () => {
  const entries = [entry("e1", "2026-03-02T08:00:00Z", "2026-03-02T09:00:00Z")];
  const extraLines = [
    {
      kind: "expense",
      id: "train",
      description: "Train ticket",
      quantity: decimal("1"),
      unitPrice: eur("45.50"),
    },
    {
      kind: "reimbursement",
      id: "stamp",
      description: "Stamp bought for the client",
      quantity: decimal("2"),
      unitPrice: eur("2"),
    },
    {
      kind: "goods",
      id: "cable",
      description: "HDMI cable",
      quantity: decimal("3"),
      unitPrice: eur("7.9"),
      treatment: { kind: "rate", rate: decimal("10") },
    },
    {
      kind: "mileage",
      id: "trip",
      description: "Client visit",
      kilometres: decimal("120.5"),
      ratePerKm: price("0.4253", "EUR"),
    },
  ] as const;

  it("follows the time lines, in the given order, with an id of its own", () => {
    const result = draft(entries, [alpha], { extraLines });
    expect(result.input.lines.map((line) => line.id)).toEqual([
      "p:alpha",
      "x:train",
      "x:stamp",
      "x:cable",
      "x:trip",
    ]);
    expect(result.provenance.map((line) => [line.lineId, line.entryIds])).toEqual([
      ["p:alpha", ["e1"]],
      ["x:train", []],
      ["x:stamp", []],
      ["x:cable", []],
      ["x:trip", []],
    ]);
    expect(result.adjustments).toEqual([]);
  });

  it("passes expenses, reimbursements and goods through as items", () => {
    const lines = draft(entries, [alpha], { extraLines }).input.lines.slice(1, 4);
    expect(
      lines.map((line) => [
        line.kind,
        line.unit,
        decimalToString(line.quantity),
        decimalToString(line.unitPrice.amount),
      ]),
    ).toEqual([
      ["expense", "item", "1", "45.50"],
      ["reimbursement", "item", "2", "2"],
      ["goods", "item", "3", "7.9"],
    ]);
    expect(lines.map((line) => line.description)).toEqual([
      "Train ticket",
      "Stamp bought for the client",
      "HDMI cable",
    ]);
  });

  it("treats lines as standard, reimbursements as excluded, unless told otherwise", () => {
    const lines = draft(entries, [alpha], { extraLines }).input.lines;
    expect(lines.map((line) => line.treatment)).toEqual([
      { kind: "standard" },
      { kind: "standard" },
      { kind: "excluded" },
      { kind: "rate", rate: decimal("10") },
      { kind: "standard" },
    ]);
    const exempt = draft([], [alpha], {
      extraLines: [
        {
          kind: "reimbursement",
          id: "r",
          description: "Fee",
          quantity: decimal("1"),
          unitPrice: eur("5"),
          treatment: { kind: "exempt", reference: "art. 15" },
        },
      ],
    });
    expect(exempt.input.lines[0]?.treatment).toEqual({ kind: "exempt", reference: "art. 15" });
  });

  it("keeps the sub-cent rate per kilometre", () => {
    const [mileage] = draft([], [alpha], { extraLines: [extraLines[3]] }).input.lines;
    expect(mileage).toMatchObject({ kind: "mileage", unit: "km" });
    expect(decimalToString(mileage?.quantity ?? decimal("-1"))).toBe("120.5");
    expect(decimalToString(mileage?.unitPrice.amount ?? decimal("-1"))).toBe("0.4253");
  });

  it("refuses ids that are taken or cannot be line ids", () => {
    const line = (id: string) =>
      ({
        kind: "expense",
        id,
        description: "x",
        quantity: decimal("1"),
        unitPrice: eur("1"),
      }) as const;
    expect(
      draftError(() => draft([], [alpha], { extraLines: [line("a"), line("a")] })).reason,
    ).toBe("duplicate-id");
    expect(draftError(() => draft([], [alpha], { extraLines: [line("a:b")] })).reason).toBe(
      "invalid-id",
    );
    // an extra line can never take the id of a time line
    expect(
      draft(entries, [alpha], { extraLines: [line("all"), line("p")] }).input.lines,
    ).toHaveLength(3);
  });

  it("is not accepted past 500 lines in total", () => {
    const line = (id: number) =>
      ({
        kind: "expense",
        id: `x${id}`,
        description: "x",
        quantity: decimal("1"),
        unitPrice: eur("1"),
      }) as const;
    const extras = Array.from({ length: 499 }, (_, index) => line(index));
    expect(draft(entries, [alpha], { extraLines: extras }).input.lines).toHaveLength(500);
    expect(
      draftError(() => draft(entries, [alpha], { extraLines: [...extras, line(499)] })).reason,
    ).toBe("too-many-lines");
  });
});

describe("currency", () => {
  const usd = (amount: string) => price(amount, "USD");
  const record = {
    from: "USD",
    rate: decimal("0.92"),
    date: isoDate("2026-04-01"),
    source: "ECB reference rate",
  } as const;
  const hours = (rate = usd("90")) => [
    entry("e1", "2026-03-02T08:00:00Z", "2026-03-02T10:00:00Z", { rate }),
  ];

  it("converts a rate with the explicit exchange rate and records both", () => {
    const result = draft(hours(), [alpha], { exchangeRates: [record] });
    expect(summary(result)).toEqual(["p:alpha | 2.00 hour x 82.80 EUR"]);
    expect(result.adjustments).toEqual([
      { kind: "price-converted", lineId: "p:alpha", from: usd("90"), to: price("82.80", "EUR") },
    ]);
    expect(result.input.exchangeRates).toEqual([record]);
  });

  it("is an error to mix currencies without an explicit exchange rate", () => {
    const error = draftError(() => draft(hours(), [alpha]));
    expect(error.reason).toBe("missing-exchange-rate");
    expect(error.subject).toBe("USD");
    expect(error.message).toContain("USD");
    const gbp = { ...record, from: "GBP" } as const;
    expect(draftError(() => draft(hours(), [alpha], { exchangeRates: [gbp] })).subject).toBe("USD");
  });

  it("copies only the exchange rates that were used", () => {
    const gbp = { from: "GBP", rate: decimal("1.17"), date: isoDate("2026-04-01") } as const;
    const eurToEur = { from: "EUR", rate: decimal("1"), date: isoDate("2026-04-01") } as const;
    expect(
      draft(hours(), [alpha], { exchangeRates: [gbp, record, eurToEur] }).input.exchangeRates,
    ).toEqual([record]);
    expect(
      draft(hours(eur("80")), [alpha], { exchangeRates: [gbp, record, eurToEur] }).input
        .exchangeRates,
    ).toBeUndefined();
  });

  it("refuses two exchange rates for one currency", () => {
    const other = { ...record, rate: decimal("0.93") };
    expect(thrown(() => draft([], [alpha], { exchangeRates: [record, other] }))).toEqual(
      new DuplicateExchangeRateError("USD"),
    );
  });

  it.each<[string, string, string, string]>([
    ["keeps every decimal up to 8", "12.5", "0.123456789", "1.54320986"],
    ["rounds a tie half up", "1", "0.123456785", "0.12345679"],
    ["leaves a short product alone", "3", "1.1", "3.3"],
  ])("rescales the converted price to 8 decimals: %s", (_name, amount, rate, converted) => {
    const result = draft(hours(usd(amount)), [alpha], {
      exchangeRates: [{ ...record, rate: decimal(rate) }],
    });
    expect(decimalToString(result.input.lines[0]?.unitPrice.amount ?? decimal("-1"))).toBe(
      converted,
    );
  });

  it("converts the lump sum of a fixed price and the prices of extra lines", () => {
    const fixed = fixedProject("alpha", "Alpha", {
      mode: { kind: "fixed", amount: money(100_000n, "USD") },
    });
    const gbp = { from: "GBP", rate: decimal("1.17"), date: isoDate("2026-04-01") } as const;
    const result = draft(hours(), [fixed], {
      exchangeRates: [record, gbp],
      extraLines: [
        {
          kind: "mileage",
          id: "trip",
          description: "Visit",
          kilometres: decimal("100"),
          ratePerKm: price("0.45", "GBP"),
        },
        {
          kind: "goods",
          id: "mug",
          description: "Mug",
          quantity: decimal("2"),
          unitPrice: usd("10"),
        },
      ],
    });
    expect(summary(result)[0]).toBe("p:alpha | 1 lump-sum x 920.0000 EUR");
    expect(
      result.input.lines.slice(1).map((line) => decimalToString(line.unitPrice.amount)),
    ).toEqual(["0.5265", "9.20"]);
    expect(
      result.adjustments.map(
        (adjustment) =>
          adjustment.kind === "price-converted" && [
            adjustment.lineId,
            decimalToString(adjustment.from.amount),
            adjustment.from.currency,
          ],
      ),
    ).toEqual([
      ["p:alpha", "1000.00", "USD"],
      ["x:trip", "0.45", "GBP"],
      ["x:mug", "10", "USD"],
    ]);
    expect(result.input.exchangeRates).toEqual([record, gbp]);
  });

  it("converts into a currency without decimals", () => {
    const toYen = { from: "EUR", rate: decimal("160"), date: isoDate("2026-04-01") } as const;
    const result = draft(hours(eur("80")), [alpha], { currency: "JPY", exchangeRates: [toYen] });
    expect(summary(result)).toEqual(["p:alpha | 2.00 hour x 12800 JPY"]);
  });
});

describe("descriptions", () => {
  const one = (
    overrides: Partial<BillableEntry>,
    project = alpha,
    grouping: InvoiceDraftOptions["grouping"] = "entry",
  ) =>
    draft([entry("e1", "2026-03-02T08:00:00Z", "2026-03-02T09:00:00Z", overrides)], [project], {
      grouping,
    }).input.lines[0]?.description;

  it("uses the text of the entry, trimmed", () => {
    expect(one({ description: "  Fix the login  " })).toBe("Fix the login");
  });

  it("falls back to the project name, then to the project id", () => {
    expect(one({ description: "   " })).toBe("Alpha");
    expect(one({ description: "" }, hourlyProject("alpha", "  "))).toBe("alpha");
    expect(one({}, hourlyProject("alpha", ""), "project")).toBe("alpha");
  });

  it("fits the 1000 characters of an invoice line, never cutting a character in two", () => {
    expect(one({ description: "x".repeat(1500) })).toHaveLength(1000);
    expect(one({ description: `${"a".repeat(999)}😀` })).toBe("a".repeat(999));
    expect(one({ description: `${"a".repeat(998)}😀😀` })).toBe(`${"a".repeat(998)}😀`);
    expect(one({ description: `${"a".repeat(998)}😀` })).toBe(`${"a".repeat(998)}😀`);
  });
});

describe("what the builder refuses", () => {
  const e1 = entry("e1", "2026-03-02T08:00:00Z", "2026-03-02T09:00:00Z");

  it("refuses a running entry of the period", () => {
    const error = draftError(() => draft([entry("run", "2026-03-02T08:00:00Z", null)]));
    expect(error).toMatchObject({
      code: "invalid-invoice-draft",
      reason: "running-entry",
      subject: "run",
      name: "DraftError",
    });
  });

  it("refuses an entry of an unknown project", () => {
    const error = draftError(() => draft([entry("e1", e1.start, e1.end, { projectId: "nobody" })]));
    expect(error).toMatchObject({ reason: "unknown-project", subject: "nobody" });
  });

  it("refuses two entries, or two projects, with one id", () => {
    expect(draftError(() => draft([e1, e1])).reason).toBe("duplicate-id");
    expect(draftError(() => draft([], [alpha, alpha])).reason).toBe("duplicate-id");
  });

  it.each(["", "a:b", "a b", "x".repeat(49), "é", "a/b"])("refuses the id %j", (id) => {
    expect(draftError(() => draft([entry(id, e1.start, e1.end)])).reason).toBe("invalid-id");
    expect(draftError(() => draft([], [hourlyProject(id)])).reason).toBe("invalid-id");
    expect(draftError(() => draft([entry("e1", e1.start, e1.end, { taskId: id })])).reason).toBe(
      "invalid-id",
    );
  });

  it("accepts the longest id, and every character an id may have", () => {
    const id = "A-z_0.9".repeat(7).slice(0, 48);
    const result = draft([entry(id, e1.start, e1.end, { projectId: id })], [hourlyProject(id)], {
      grouping: "entry",
    });
    expect(result.input.lines[0]?.id).toBe(`e:${id}`);
  });

  it("refuses an entry with no rate", () => {
    const { rate: _, ...unpriced } = e1;
    expect(thrown(() => draft([unpriced]))).toEqual(new MissingRateError("hour"));
  });

  it("refuses a period that ends before it starts, or is not a date", () => {
    const period = { from: isoDate("2026-03-31"), to: isoDate("2026-03-01") };
    expect(draftError(() => draft([], [alpha], { period })).reason).toBe("invalid-period");
    const impossible = {
      from: "2026-02-30" as ReturnType<typeof isoDate>,
      to: isoDate("2026-03-31"),
    };
    expect(thrown(() => draft([], [alpha], { period: impossible }))).toBeInstanceOf(
      InvalidDateError,
    );
  });

  it("accepts a one-day period", () => {
    const day = { from: isoDate("2026-03-02"), to: isoDate("2026-03-02") };
    expect(draft([e1], [alpha], { period: day }).input.lines).toHaveLength(1);
  });

  it("refuses an unknown time zone, even without entries", () => {
    expect(thrown(() => draft([], [alpha], { timeZone: "Mars/Olympus" }))).toEqual(
      new InvalidTimeZoneError("Mars/Olympus"),
    );
  });

  it("refuses instants it cannot read, and entries that end before they start", () => {
    expect(thrown(() => draft([entry("e1", "yesterday", "2026-03-02T09:00:00Z")]))).toBeInstanceOf(
      InvalidInstantError,
    );
    expect(thrown(() => draft([entry("e1", e1.start, "tomorrow")]))).toBeInstanceOf(
      InvalidInstantError,
    );
    expect(thrown(() => draft([entry("e1", e1.end ?? "", e1.start)]))).toBeInstanceOf(
      InvalidIntervalError,
    );
  });

  it("refuses more than 500 lines", () => {
    const many = (count: number) =>
      Array.from({ length: count }, (_, index) =>
        entry(
          `e${index}`,
          `2026-03-02T08:${String(index % 60).padStart(2, "0")}:00Z`,
          `2026-03-02T09:00:00Z`,
        ),
      );
    expect(draft(many(500), [alpha], { grouping: "entry" }).input.lines).toHaveLength(500);
    expect(draftError(() => draft(many(501), [alpha], { grouping: "entry" })).reason).toBe(
      "too-many-lines",
    );
  });

  it("lets the tax engine's validation speak for the parts of the caller's own", () => {
    const badClient = { ...client, country: "ZZ" as CountryCode };
    expect(thrown(() => draft([e1], [alpha], { client: badClient }))).toBeInstanceOf(
      InvalidInputError,
    );
    const negative = {
      kind: "expense",
      id: "n",
      description: "x",
      quantity: decimal("-1"),
      unitPrice: eur("1"),
    } as const;
    expect(thrown(() => draft([e1], [alpha], { extraLines: [negative] }))).toBeInstanceOf(
      InvalidInputError,
    );
  });
});

describe("DraftError", () => {
  it.each<DraftErrorReason>([
    "running-entry",
    "missing-exchange-rate",
    "unknown-project",
    "duplicate-id",
    "invalid-id",
    "invalid-period",
    "too-many-lines",
  ])("%s has a message of its own that holds no user text", (reason) => {
    const error = new DraftError(reason, "secret-id");
    expect(error.reason).toBe(reason);
    expect(error.subject).toBe("secret-id");
    expect(error.message.length).toBeGreaterThan(10);
    if (reason !== "missing-exchange-rate") expect(error.message).not.toContain("secret-id");
  });

  it("names the currency that has no rate, when it is known", () => {
    expect(new DraftError("missing-exchange-rate", "USD").message).toContain("USD");
    expect(new DraftError("missing-exchange-rate").message).not.toContain("undefined");
  });
});

describe("the draft", () => {
  const entries = [entry("e1", "2026-03-02T08:00:00Z", "2026-03-02T09:00:00Z", { taskId: "t1" })];

  it("is a valid, frozen invoice input of the tax engine", () => {
    const result = draft(entries, [alpha], { exchangeRates: [], extraLines: [] });
    expect(validateInvoiceInput(result.input)).toEqual(result.input);
    expect(Object.isFrozen(result.input)).toBe(true);
    expect(result.input).toMatchObject({
      issueDate: "2026-04-02",
      documentKind: "invoice",
      currency: "EUR",
      client,
    });
    expect(result.input.lines[0]).toMatchObject({
      kind: "service",
      treatment: { kind: "standard" },
    });
  });

  it("passes the pack options through untouched", () => {
    const packOptions = { skipWithholding: true, note: ["a", { b: null }] };
    expect(draft(entries, [alpha], { packOptions }).input.options).toEqual(packOptions);
    expect(draft(entries).input.options).toBeUndefined();
  });

  it("does not touch its arguments", () => {
    const frozen = Object.freeze(entries.map((item) => Object.freeze({ ...item })));
    const projects = Object.freeze([Object.freeze({ ...alpha })]);
    const options = Object.freeze({ ...draftOptions(), extraLines: Object.freeze([]) });
    expect(summary(buildInvoiceDraft(frozen, projects, options))).toEqual([
      "p:alpha | 1.00 hour x 80 EUR",
    ]);
  });
});
