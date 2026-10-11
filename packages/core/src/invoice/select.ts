import { isIsoDate } from "@fairhour/tax-core";
import { InvalidDateError } from "../errors";
import { roundDuration } from "../time/duration";
import { type LocalDate, compareBigint, localDateOf, resolveInterval } from "../time/instant";
import { DraftError } from "./errors";
import type { BillableEntry, ProjectBilling } from "./types";

/**
 * Ids become part of line ids (`p:<projectId>`, `e:<entryId>:2`): no `:` so that no two ids can
 * run into each other, and short enough for the 64 characters a line id may have.
 */
const SOURCE_ID_PATTERN = /^[A-Za-z0-9._-]{1,48}$/;

/** @throws DraftError `invalid-id` */
export function assertSourceId(id: string): void {
  if (!SOURCE_ID_PATTERN.test(id)) throw new DraftError("invalid-id");
}

/** Code-unit order: the same in every runtime and locale, unlike `localeCompare`. */
export function compareText(a: string, b: string): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** @throws DraftError `invalid-id`, `duplicate-id` */
export function indexProjects(
  projects: readonly ProjectBilling[],
): ReadonlyMap<string, ProjectBilling> {
  const byId = new Map<string, ProjectBilling>();
  for (const project of projects) {
    assertSourceId(project.id);
    if (byId.has(project.id)) throw new DraftError("duplicate-id", project.id);
    byId.set(project.id, project);
  }
  return byId;
}

/** An entry of the period, measured and tied to its project. */
export interface SelectedEntry {
  readonly entry: BillableEntry;
  readonly project: ProjectBilling;
  /** The local day the entry starts on: the day it is invoiced on, even past midnight. */
  readonly date: LocalDate;
  readonly startSeconds: bigint;
  /** Elapsed seconds. */
  readonly seconds: bigint;
  /**
   * Seconds after the project's rounding when it rounds each entry (`roundingScope: "entry"`);
   * `seconds` otherwise, and for a fixed price, which does not bill the hours.
   */
  readonly billedSeconds: bigint;
}

/**
 * The entries whose local start date lies in the period, in a canonical order (start instant,
 * then id) that does not depend on the order they were passed in.
 *
 * An entry belongs to the day it starts on, whatever its end (the split of CORE-003 is for
 * reports, not for billing). Entries outside the period are ignored, whatever their state.
 * @throws DraftError `running-entry`, `unknown-project`, `duplicate-id`, `invalid-id`
 * @throws InvalidInstantError, InvalidIntervalError, InvalidTimeZoneError, InvalidDateError
 */
export function selectEntries(
  entries: readonly BillableEntry[],
  projects: ReadonlyMap<string, ProjectBilling>,
  period: { readonly from: string; readonly to: string },
  timeZone: string,
): readonly SelectedEntry[] {
  const selected: SelectedEntry[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const date = localDateOf(entry.start, timeZone);
    if (date < period.from || date > period.to) continue;
    assertSourceId(entry.id);
    if (seen.has(entry.id)) throw new DraftError("duplicate-id", entry.id);
    seen.add(entry.id);
    if (entry.taskId !== undefined) assertSourceId(entry.taskId);
    if (entry.end === null) throw new DraftError("running-entry", entry.id);
    const project = projects.get(entry.projectId);
    if (project === undefined) throw new DraftError("unknown-project", entry.projectId);
    const { startSeconds, endSeconds } = resolveInterval(
      { start: entry.start, end: entry.end },
      undefined,
    );
    const seconds = endSeconds - startSeconds;
    selected.push({
      entry,
      project,
      date,
      startSeconds,
      seconds,
      billedSeconds:
        project.roundingScope === "entry" && project.mode.kind !== "fixed"
          ? roundDuration(seconds, project.rounding)
          : seconds,
    });
  }
  return selected.sort(
    (a, b) => compareBigint(a.startSeconds, b.startSeconds) || compareText(a.entry.id, b.entry.id),
  );
}

/** @throws InvalidDateError (not a date), DraftError `invalid-period` (from is after to) */
export function assertPeriod(period: { readonly from: string; readonly to: string }): void {
  if (!isIsoDate(period.from) || !isIsoDate(period.to)) throw new InvalidDateError();
  if (period.from > period.to) throw new DraftError("invalid-period");
}
