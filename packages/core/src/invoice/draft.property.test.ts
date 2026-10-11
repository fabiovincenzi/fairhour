import {
  ROUNDING_MODES,
  type RoundingMode,
  decimal,
  decimalToString,
  extend,
  normalizeDecimal,
  price,
  sum,
} from "@fairhour/money";
import { computeInvoice, isoDate } from "@fairhour/tax-core";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  dayRateProject,
  draftOptions,
  entry,
  fixedProject,
  hourlyProject,
} from "../../test/invoice";
import { vatPack } from "../../test/vat-pack";
import { type DurationRounding, roundDuration } from "../time/duration";
import { buildInvoiceDraft } from "./draft";
import type {
  BillableEntry,
  InvoiceDraft,
  InvoiceDraftOptions,
  InvoiceGrouping,
  ProjectBilling,
} from "./types";

const TIME_ZONES = [
  "Europe/Rome",
  "UTC",
  "America/New_York",
  "Pacific/Auckland",
  "Australia/Lord_Howe",
] as const;

/** Prices as text: 80 and 80.00 are one rate; the last one needs more than 53 bits. */
const RATES = ["80", "80.00", "95.5", "123456789.12345678"] as const;

interface Spec {
  readonly day: number;
  readonly minute: number;
  readonly second: number;
  readonly duration: number;
  readonly project: number;
  readonly task: number;
  readonly rate: number;
}

const specArbitrary: fc.Arbitrary<Spec> = fc.record({
  day: fc.integer({ min: 0, max: 40 }), // 1 March to 10 April: crosses both ends of the period
  minute: fc.integer({ min: 0, max: 1439 }),
  second: fc.integer({ min: 0, max: 59 }),
  duration: fc.oneof(fc.integer({ min: 0, max: 14 * 3600 }), fc.constantFrom(0, 3600, 14_400)),
  project: fc.integer({ min: 0, max: 3 }),
  task: fc.integer({ min: 0, max: 2 }),
  rate: fc.integer({ min: 0, max: RATES.length - 1 }),
});

const PROJECT_IDS = ["p0", "p1", "p2", "p3"] as const;
const START = Date.UTC(2026, 2, 1);

function entryOf(spec: Spec, index: number): BillableEntry {
  const start = START + spec.day * 86_400_000 + spec.minute * 60_000 + spec.second * 1000;
  const taskId = spec.task === 0 ? undefined : `t${spec.task}`;
  return entry(
    `e${index}`,
    new Date(start).toISOString(),
    new Date(start + spec.duration * 1000).toISOString(),
    {
      projectId: PROJECT_IDS[spec.project] ?? "p0",
      rate: price(RATES[spec.rate] ?? "80", "EUR"),
      ...(taskId === undefined ? {} : { taskId, taskName: `Task ${spec.task}` }),
    },
  );
}

const roundingArbitrary: fc.Arbitrary<DurationRounding> = fc.oneof(
  fc.constant<DurationRounding>({ kind: "none" }),
  fc.record({
    kind: fc.constant("step" as const),
    minutes: fc.constantFrom(6 as const, 15 as const, 30 as const),
    direction: fc.constantFrom("up" as const, "nearest" as const, "down" as const),
  }),
);

interface Scenario {
  readonly entries: readonly BillableEntry[];
  readonly projects: readonly ProjectBilling[];
  readonly options: InvoiceDraftOptions;
  /** A shuffle of the entries. */
  readonly shuffled: readonly BillableEntry[];
}

const scenarioArbitrary: fc.Arbitrary<Scenario> = fc
  .record({
    specs: fc.array(specArbitrary, { maxLength: 25 }),
    rounding0: roundingArbitrary,
    rounding1: roundingArbitrary,
    scope0: fc.constantFrom("entry" as const, "line" as const),
    scope1: fc.constantFrom("entry" as const, "line" as const),
    grouping: fc.constantFrom<InvoiceGrouping>("project", "task", "entry", "single"),
    hoursScale: fc.constantFrom(2 as const, 3 as const, 4 as const),
    hoursRounding: fc.constantFrom<RoundingMode>(...ROUNDING_MODES),
    timeZone: fc.constantFrom(...TIME_ZONES),
  })
  .chain((base) =>
    fc
      .array(fc.integer(), { minLength: base.specs.length, maxLength: base.specs.length })
      .map((keys): Scenario => {
        const entries = base.specs.map(entryOf);
        const shuffled = entries
          .map((item, index) => ({ item, key: keys[index] ?? 0 }))
          .sort((a, b) => a.key - b.key)
          .map(({ item }) => item);
        return {
          entries,
          shuffled,
          projects: [
            hourlyProject("p0", "Beta", { rounding: base.rounding0, roundingScope: base.scope0 }),
            hourlyProject("p1", "Alpha", { rounding: base.rounding1, roundingScope: base.scope1 }),
            dayRateProject("p2", "Days"),
            fixedProject("p3", "Fixed"),
          ],
          options: draftOptions({
            grouping: base.grouping,
            hoursScale: base.hoursScale,
            hoursRounding: base.hoursRounding,
            timeZone: base.timeZone,
          }),
        };
      }),
  );

// ---- independent oracles ----------------------------------------------------------------------

/** The local date of an instant, from the platform's Intl, not from the code under test. */
function localDate(instant: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(instant));
  const part = (type: string): string => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

const secondsOf = (item: BillableEntry): bigint =>
  BigInt(Date.parse(item.end ?? "") - Date.parse(item.start)) / 1000n;

/** The generated entries all have a rate. */
const rateKey = (item: BillableEntry): string =>
  decimalToString(normalizeDecimal(item.rate?.amount ?? decimal("0")));

function selectedOf(scenario: Scenario): BillableEntry[] {
  const { from, to } = scenario.options.period;
  return scenario.entries.filter((item) => {
    const date = localDate(item.start, scenario.options.timeZone);
    return date >= from && date <= to;
  });
}

/** What entries share a line, from the requirements alone (design 7, step 3). */
function expectedKey(item: BillableEntry, grouping: InvoiceGrouping, timeZone: string): string {
  switch (item.projectId) {
    case "p3":
      return "p3";
    case "p2": {
      const day = grouping === "entry" ? localDate(item.start, timeZone) : "";
      return `p2|${rateKey(item)}|${day}`;
    }
    default:
      return [
        item.projectId,
        rateKey(item),
        grouping === "task" ? (item.taskId ?? "") : "",
        grouping === "entry" ? item.id : "",
      ].join("|");
  }
}

function lineEntries(draft: InvoiceDraft, scenario: Scenario): BillableEntry[][] {
  const byId = new Map(scenario.entries.map((item) => [item.id, item] as const));
  return draft.provenance.map((line) =>
    line.entryIds.map((id) => {
      const found = byId.get(id);
      if (found === undefined) throw new Error(`Unknown entry ${id} in the provenance`);
      return found;
    }),
  );
}

function entryRounding(draft: InvoiceDraft, entryId: string) {
  return draft.adjustments.flatMap((item) =>
    item.kind === "duration-rounded" && item.entryId === entryId ? [item] : [],
  )[0];
}

function lineRounding(draft: InvoiceDraft, lineId: string) {
  return draft.adjustments.flatMap((item) =>
    item.kind === "line-duration-rounded" && item.lineId === lineId ? [item] : [],
  )[0];
}

function quantityRounding(draft: InvoiceDraft, lineId: string) {
  return draft.adjustments.flatMap((item) =>
    item.kind === "quantity-rounded" && item.lineId === lineId ? [item] : [],
  )[0];
}

/** Lexicographic order of two tuples of texts and numbers. */
function compareTuples(a: readonly (string | number)[], b: readonly (string | number)[]): number {
  for (const [index, left] of a.entries()) {
    const right = b[index] ?? "";
    if (left < right) return -1;
    if (left > right) return 1;
  }
  return 0;
}

function build(scenario: Scenario, entries = scenario.entries): InvoiceDraft {
  return buildInvoiceDraft(entries, scenario.projects, scenario.options);
}

const assertOptions = { numRuns: 200 };

describe("invoice draft properties", () => {
  it("is deterministic, and does not depend on the order of the entries", () => {
    fc.assert(
      fc.property(scenarioArbitrary, (scenario) => {
        const draft = build(scenario);
        expect(build(scenario)).toEqual(draft);
        expect(build(scenario, scenario.shuffled)).toEqual(draft);
      }),
      assertOptions,
    );
  });

  it("invoices exactly the entries that start in the period, each on one line", () => {
    fc.assert(
      fc.property(scenarioArbitrary, (scenario) => {
        const draft = build(scenario);
        const invoiced = draft.provenance.flatMap((line) => line.entryIds);
        expect([...invoiced].sort()).toEqual(
          selectedOf(scenario)
            .map((item) => item.id)
            .sort(),
        );
        expect(new Set(invoiced).size).toBe(invoiced.length);
        expect(draft.provenance.map((line) => line.lineId)).toEqual(
          draft.input.lines.map((line) => line.id),
        );
        for (const line of draft.input.lines) expect(line.treatment).toEqual({ kind: "standard" });
      }),
      assertOptions,
    );
  });

  it("groups by the requested grouping, always by project and rate", () => {
    fc.assert(
      fc.property(scenarioArbitrary, (scenario) => {
        const draft = build(scenario);
        const { grouping, timeZone } = scenario.options;
        const actual = lineEntries(draft, scenario).map((items) =>
          items
            .map((item) => item.id)
            .sort()
            .join(","),
        );
        const expected = new Map<string, string[]>();
        for (const item of selectedOf(scenario)) {
          const key = expectedKey(item, grouping, timeZone);
          expected.set(key, [...(expected.get(key) ?? []), item.id]);
        }
        expect(actual.sort()).toEqual(
          [...expected.values()].map((ids) => ids.sort().join(",")).sort(),
        );
        for (const items of lineEntries(draft, scenario)) {
          expect(new Set(items.map((item) => item.projectId)).size).toBe(1);
          if (items[0]?.projectId !== "p3") {
            expect(new Set(items.map(rateKey)).size).toBe(1);
          }
          // chronological within a line
          const starts = items.map((item) => Date.parse(item.start));
          expect(starts).toEqual([...starts].sort((a, b) => a - b));
        }
      }),
      assertOptions,
    );
  });

  it("gives every line a deterministic, valid, unique id", () => {
    fc.assert(
      fc.property(scenarioArbitrary, (scenario) => {
        const draft = build(scenario);
        const ids = draft.input.lines.map((line) => line.id);
        expect(new Set(ids).size).toBe(ids.length);
        const bases = new Map<string, string[]>();
        for (const id of ids) {
          expect(id).toMatch(/^(all|[pte]:[A-Za-z0-9._-]+)(:\d+)?$/);
          const base = id.replace(/:\d+$/, "");
          bases.set(base, [...(bases.get(base) ?? []), id]);
        }
        // lines that share a base id are numbered 1, 2, ... in line order; a lone line is not
        for (const [base, family] of bases) {
          expect(family).toEqual(
            family.length === 1 ? [base] : family.map((_, index) => `${base}:${index + 1}`),
          );
        }
      }),
      assertOptions,
    );
  });

  it("orders the lines by project name, then task, then the first entry's start", () => {
    fc.assert(
      fc.property(scenarioArbitrary, (scenario) => {
        const draft = build(scenario);
        const names = new Map(
          scenario.projects.map((project) => [project.id, project.name] as const),
        );
        // tasks tell lines apart only for hourly work grouped by task
        const byTask = (item: BillableEntry): boolean =>
          scenario.options.grouping === "task" &&
          item.projectId !== "p2" &&
          item.projectId !== "p3";
        const keys = lineEntries(draft, scenario).flatMap(([first]) =>
          first === undefined
            ? []
            : [
                [
                  names.get(first.projectId) ?? "",
                  first.projectId,
                  byTask(first) ? (first.taskName ?? "") : "",
                  byTask(first) ? (first.taskId ?? "") : "",
                  Date.parse(first.start),
                  first.id,
                ],
              ],
        );
        for (const [index, key] of keys.entries()) {
          const next = keys[index + 1];
          if (next !== undefined) expect(compareTuples(key, next)).toBeLessThan(0);
        }
      }),
      assertOptions,
    );
  });

  it("bills the hours of the entries as exact decimals, inside the rounding of the project", () => {
    fc.assert(
      fc.property(scenarioArbitrary, (scenario) => {
        const draft = build(scenario);
        const { hoursScale, hoursRounding = "halfUp" } = scenario.options;
        draft.input.lines.forEach((line, index) => {
          const items = lineEntries(draft, scenario)[index] ?? [];
          const project = scenario.projects.find(
            (candidate) => candidate.id === items[0]?.projectId,
          );
          if (project?.mode.kind !== "hourly") return;
          const { rounding, roundingScope } = project;
          const step = rounding.kind === "step" ? BigInt(rounding.minutes) * 60n : undefined;
          const within = (from: bigint, to: bigint): void => {
            if (rounding.kind !== "step" || step === undefined) {
              expect(to).toBe(from);
              return;
            }
            expect(to % step).toBe(0n);
            if (rounding.direction === "up") expect(to >= from && to - from < step).toBe(true);
            if (rounding.direction === "down") expect(to <= from && from - to < step).toBe(true);
            if (rounding.direction === "nearest")
              expect(2n * (to > from ? to - from : from - to) <= step).toBe(true);
          };
          let billed = 0n;
          if (roundingScope === "entry") {
            for (const item of items) {
              const raw = secondsOf(item);
              const changed = entryRounding(draft, item.id);
              expect(changed === undefined || changed.fromSeconds !== changed.toSeconds).toBe(true);
              within(raw, changed?.toSeconds ?? raw);
              if (changed !== undefined) expect(changed.fromSeconds).toBe(raw);
              billed += changed?.toSeconds ?? raw;
            }
          } else {
            const raw = items.reduce((total, item) => total + secondsOf(item), 0n);
            const changed = lineRounding(draft, line.id);
            within(raw, changed?.toSeconds ?? raw);
            if (changed !== undefined) expect(changed.fromSeconds).toBe(raw);
            billed = changed?.toSeconds ?? raw;
          }
          // quantity = billed seconds / 3600 with `hoursScale` decimals: the error, in units of
          // 1/3600 of the last place, is below one place, or half a place when rounding to nearest
          const { quantity } = line;
          expect(typeof quantity.coefficient).toBe("bigint");
          expect(quantity.scale).toBe(hoursScale);
          const error = quantity.coefficient * 3600n - billed * 10n ** BigInt(hoursScale);
          const nearest = ["halfUp", "halfEven", "halfDown"].includes(hoursRounding);
          if (rounding.kind === "step") expect(error).toBe(0n);
          if (nearest) expect(error >= -1800n && error <= 1800n).toBe(true);
          if (hoursRounding === "up" || hoursRounding === "ceiling")
            expect(error >= 0n && error < 3600n).toBe(true);
          if (hoursRounding === "down" || hoursRounding === "floor")
            expect(error > -3600n && error <= 0n).toBe(true);
          // and the rounding is on the record exactly when the hours are not exact
          const recorded = quantityRounding(draft, line.id);
          expect(recorded !== undefined).toBe(error !== 0n);
          if (recorded !== undefined) {
            const [numerator, denominator] = recorded.exact.split("/").map(BigInt);
            expect((numerator ?? 0n) * 3600n).toBe(billed * (denominator ?? 0n));
            expect(recorded.rounded).toEqual(quantity);
          }
        });
      }),
      assertOptions,
    );
  });

  it("adds up: the hours of the lines are the rounded sum of the entry durations", () => {
    const total = (values: readonly bigint[]): bigint =>
      values.reduce((all, value) => all + value, 0n);
    fc.assert(
      fc.property(scenarioArbitrary, (scenario) => {
        const draft = build(scenario);
        // with a 6, 15 or 30 minute step the hours are exact, so they add up exactly
        let hours = 0n; // in units of 10^-hoursScale hours
        let seconds = 0n;
        lineEntries(draft, scenario).forEach((items, index) => {
          const project = scenario.projects.find(({ id }) => id === items[0]?.projectId);
          if (project?.mode.kind !== "hourly" || project.rounding.kind === "none") return;
          const durations = items.map(secondsOf);
          seconds +=
            project.roundingScope === "entry"
              ? total(durations.map((duration) => roundDuration(duration, project.rounding)))
              : roundDuration(total(durations), project.rounding);
          hours += draft.input.lines[index]?.quantity.coefficient ?? 0n;
        });
        expect(hours * 3600n).toBe(seconds * 10n ** BigInt(scenario.options.hoursScale));
      }),
      assertOptions,
    );
  });

  it("keeps the unit price of a line exactly as it was given", () => {
    fc.assert(
      fc.property(scenarioArbitrary, (scenario) => {
        const draft = build(scenario);
        lineEntries(draft, scenario).forEach((items, index) => {
          const unitPrice = draft.input.lines[index]?.unitPrice;
          const first = items[0];
          if (first === undefined || unitPrice === undefined) return;
          expect(typeof unitPrice.amount.coefficient).toBe("bigint");
          expect(unitPrice.currency).toBe("EUR");
          const expected = first.projectId === "p3" ? "1500.00" : rateKey(first);
          expect(decimalToString(normalizeDecimal(unitPrice.amount))).toBe(
            decimalToString(normalizeDecimal(decimal(expected))),
          );
        });
      }),
      assertOptions,
    );
  });

  it("is accepted by the tax engine, which adds up exactly what the lines show", () => {
    fc.assert(
      fc.property(scenarioArbitrary, (scenario) => {
        const draft = build(scenario);
        const computation = computeInvoice(vatPack, {}, draft.input);
        expect(computation.lines).toHaveLength(draft.input.lines.length);
        for (const line of computation.lines) {
          expect(line.net).toEqual(extend(line.unitPrice, line.quantity, "halfUp"));
        }
        expect(computation.subtotal).toEqual(
          sum(
            computation.lines.map((line) => line.net),
            "EUR",
          ),
        );
      }),
      assertOptions,
    );
  });
});

describe("day rate properties", () => {
  const daysArbitrary = fc.array(
    fc.record({
      day: fc.integer({ min: 0, max: 20 }),
      minute: fc.integer({ min: 0, max: 1439 }),
      duration: fc.integer({ min: 0, max: 14 * 3600 }),
    }),
    { maxLength: 20 },
  );

  it("counts half a day up to 4 hours of a local day and a day beyond, for any time zone", () => {
    fc.assert(
      fc.property(daysArbitrary, fc.constantFrom(...TIME_ZONES), (specs, timeZone) => {
        const entries = specs.map((spec, index) => {
          const start = START + spec.day * 86_400_000 + spec.minute * 60_000;
          return entry(
            `e${index}`,
            new Date(start).toISOString(),
            new Date(start + spec.duration * 1000).toISOString(),
            { projectId: "p2", rate: price("560", "EUR") },
          );
        });
        const period = { from: isoDate("2026-03-02"), to: isoDate("2026-03-20") };
        const draft = buildInvoiceDraft(
          entries,
          [dayRateProject("p2", "Days")],
          draftOptions({ timeZone, period }),
        );
        const perDay = new Map<string, bigint>();
        for (const item of entries) {
          const date = localDate(item.start, timeZone);
          if (date < period.from || date > period.to) continue;
          perDay.set(date, (perDay.get(date) ?? 0n) + secondsOf(item));
        }
        let halfDays = 0n;
        for (const seconds of perDay.values()) {
          if (seconds > 0n) halfDays += seconds <= 4n * 3600n ? 1n : 2n;
        }
        const [line] = draft.input.lines;
        if (perDay.size === 0) {
          expect(line).toBeUndefined();
          return;
        }
        expect(line?.unit).toBe("day");
        expect(line?.quantity.scale).toBe(1);
        expect(line?.quantity.coefficient).toBe(halfDays * 5n);
      }),
      { numRuns: 300 },
    );
  });
});
