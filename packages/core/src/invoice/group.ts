import { type Price, decimalToString, normalizeDecimal, priceFromMoney } from "@fairhour/money";
import { MissingRateError } from "../rates/errors";
import { compareBigint } from "../time/instant";
import { type SelectedEntry, compareText } from "./select";
import type { InvoiceGrouping, ProjectBilling } from "./types";

/**
 * What a line really groups by, which can differ from the requested grouping because some work
 * cannot be split further without billing it wrongly:
 *
 * - a fixed price is one lump sum per project (a line per entry would bill it once per entry);
 * - a day rate bills per local day, so it is never split below a day: `task` falls back to
 *   `project`, and `entry` to `day` (the entries of one local day share a line, since each of
 *   them alone would count as a day of its own).
 */
export type EffectiveGrouping = "single" | "project" | "task" | "entry" | "day";

function effectiveGrouping(project: ProjectBilling, grouping: InvoiceGrouping): EffectiveGrouping {
  switch (project.mode.kind) {
    case "hourly":
      return grouping;
    case "fixed":
      return grouping === "single" ? "single" : "project";
    case "day-rate":
      return grouping === "entry" ? "day" : grouping === "task" ? "project" : grouping;
  }
}

/** The entries of one invoice line, with a deterministic id. */
export interface LineGroup {
  /** `p:<projectId>`, `t:<taskId>`, `e:<entryId>`, `all`; `:<n>` when several lines share it. */
  readonly id: string;
  readonly grouping: EffectiveGrouping;
  readonly project: ProjectBilling;
  /**
   * The unit price in its own currency, before any conversion: the rate of the entries (per
   * hour or per day) or, for a fixed price, the agreed amount.
   */
  readonly price: Price;
  /** Chronological. */
  readonly entries: readonly SelectedEntry[];
  /** The first of `entries`. */
  readonly first: SelectedEntry;
}

/** The rate an entry is billed at, or the agreed amount of a fixed price. */
function priceOf({ entry, project }: SelectedEntry): Price {
  switch (project.mode.kind) {
    case "fixed":
      return priceFromMoney(project.mode.amount);
    case "hourly":
    case "day-rate":
      if (entry.rate === undefined) {
        throw new MissingRateError(project.mode.kind === "hourly" ? "hour" : "day");
      }
      return entry.rate;
  }
}

/** Equal prices (50 and 50.00) have the same key; the currency is part of it. */
function priceKey(price: Price): string {
  return `${price.currency} ${decimalToString(normalizeDecimal(price.amount))}`;
}

/** What tells apart the lines of one project, price and effective grouping. */
function discriminator(grouping: EffectiveGrouping, { entry, date }: SelectedEntry): string {
  switch (grouping) {
    case "single":
    case "project":
      return "";
    case "task":
      return entry.taskId ?? "";
    case "entry":
      return entry.id;
    case "day":
      return date;
  }
}

function baseId(grouping: EffectiveGrouping, first: SelectedEntry): string {
  switch (grouping) {
    case "single":
      return "all";
    case "project":
      return `p:${first.project.id}`;
    case "task":
      return first.entry.taskId === undefined ? `p:${first.project.id}` : `t:${first.entry.taskId}`;
    case "entry":
    case "day":
      return `e:${first.entry.id}`;
  }
}

interface Bucket {
  readonly grouping: EffectiveGrouping;
  readonly price: Price;
  readonly first: SelectedEntry;
  readonly entries: SelectedEntry[];
}

/** Project name, then task (by task lines), then the first entry's start: a total order. */
function compareBuckets(a: Bucket, b: Bucket): number {
  return (
    compareText(a.first.project.name, b.first.project.name) ||
    compareText(a.first.project.id, b.first.project.id) ||
    (a.grouping === "task"
      ? compareText(a.first.entry.taskName ?? "", b.first.entry.taskName ?? "") ||
        compareText(a.first.entry.taskId ?? "", b.first.entry.taskId ?? "")
      : 0) ||
    compareBigint(a.first.startSeconds, b.first.startSeconds) ||
    compareText(a.first.entry.id, b.first.entry.id)
  );
}

/**
 * Groups the entries (in canonical order) into invoice lines: by the requested grouping, and
 * always by project and unit price, so that entries at different rates never share a line. The
 * lines come back ordered by project name, then task, then first entry start, and numbered
 * `:1`, `:2`, ... when several share one base id (the same task at two rates, say).
 * @throws MissingRateError when an hourly or day-rate entry has no rate
 */
export function buildLineGroups(
  selected: readonly SelectedEntry[],
  grouping: InvoiceGrouping,
): readonly LineGroup[] {
  const buckets = new Map<string, Bucket>();
  for (const item of selected) {
    const effective = effectiveGrouping(item.project, grouping);
    const price = priceOf(item);
    const key = [
      effective,
      item.project.id,
      item.project.mode.kind === "fixed" ? "" : priceKey(price),
      discriminator(effective, item),
    ].join("|");
    const bucket = buckets.get(key);
    if (bucket === undefined) {
      buckets.set(key, { grouping: effective, price, first: item, entries: [item] });
    } else {
      bucket.entries.push(item);
    }
  }
  // Lines that share a base id form a family, filled in line order before any id is built.
  const families = new Map<string, Bucket[]>();
  const items = [...buckets.values()].sort(compareBuckets).map((bucket) => {
    const base = baseId(bucket.grouping, bucket.first);
    const family = families.get(base) ?? [];
    families.set(base, family);
    family.push(bucket);
    return { bucket, base, family };
  });
  return items.map(({ bucket, base, family }): LineGroup => ({
    id: family.length > 1 ? `${base}:${family.indexOf(bucket) + 1}` : base,
    grouping: bucket.grouping,
    project: bucket.first.project,
    price: bucket.price,
    entries: bucket.entries,
    first: bucket.first,
  }));
}
