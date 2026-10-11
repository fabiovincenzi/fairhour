import { type Decimal, type Price, type RoundingMode, decimal } from "@fairhour/money";
import { dayRateDays, hoursFromSeconds } from "../rates/billing";
import { roundDuration } from "../time/duration";
import type { LineGroup } from "./group";
import type { DraftAdjustment } from "./types";

export interface QuantifiedGroup {
  readonly quantity: Decimal;
  readonly unit: "hour" | "day" | "lump-sum";
  /** Per `unit`, in its own currency: not converted yet. */
  readonly unitPrice: Price;
  readonly adjustments: readonly DraftAdjustment[];
}

export interface QuantityOptions {
  readonly hoursScale: 2 | 3 | 4;
  readonly hoursRounding: RoundingMode;
}

const SECONDS_PER_HOUR = 3600n;
const ONE = decimal("1");

function gcd(a: bigint, b: bigint): bigint {
  return b === 0n ? a : gcd(b, a % b);
}

/** `seconds` as a reduced fraction of an hour: 1200 s is "1/3". */
function hoursFraction(seconds: bigint): string {
  const divisor = gcd(seconds, SECONDS_PER_HOUR);
  return `${seconds / divisor}/${SECONDS_PER_HOUR / divisor}`;
}

function sumOf(values: readonly bigint[]): bigint {
  return values.reduce((total, value) => total + value, 0n);
}

/** The seconds a line bills, and the adjustment when the line's own rounding changed them. */
function hourlySeconds(group: LineGroup): {
  readonly seconds: bigint;
  readonly adjustments: readonly DraftAdjustment[];
} {
  const { project, entries } = group;
  if (project.roundingScope === "entry") {
    return { seconds: sumOf(entries.map((item) => item.billedSeconds)), adjustments: [] };
  }
  const elapsed = sumOf(entries.map((item) => item.seconds));
  const rounded = roundDuration(elapsed, project.rounding);
  return {
    seconds: rounded,
    adjustments:
      rounded === elapsed
        ? []
        : [
            {
              kind: "line-duration-rounded",
              lineId: group.id,
              fromSeconds: elapsed,
              toSeconds: rounded,
            },
          ],
  };
}

/** The billed seconds of each local day (the entries are counted on the day they start). */
function daySeconds(group: LineGroup): {
  readonly perDay: readonly bigint[];
  readonly adjustments: readonly DraftAdjustment[];
} {
  const { project, entries } = group;
  const byDay = new Map<string, { elapsed: bigint; billed: bigint }>();
  for (const item of entries) {
    const day = byDay.get(item.date) ?? { elapsed: 0n, billed: 0n };
    byDay.set(item.date, {
      elapsed: day.elapsed + item.seconds,
      billed: day.billed + item.billedSeconds,
    });
  }
  const days = [...byDay.values()];
  if (project.roundingScope === "entry") {
    return { perDay: days.map((day) => day.billed), adjustments: [] };
  }
  const perDay = days.map((day) => roundDuration(day.elapsed, project.rounding));
  const elapsed = sumOf(days.map((day) => day.elapsed));
  const rounded = sumOf(perDay);
  return {
    perDay,
    adjustments:
      rounded === elapsed
        ? []
        : [
            {
              kind: "line-duration-rounded",
              lineId: group.id,
              fromSeconds: elapsed,
              toSeconds: rounded,
            },
          ],
  };
}

/**
 * The quantity and unit of a line, from the project's billing mode:
 *
 * - hourly: the billed seconds as hours with exactly `hoursScale` decimals (rounded with
 *   `hoursRounding`; the rounding is recorded, it is exact with a 6, 15 or 30 minute step);
 * - day rate: half a day for a local day of up to `halfDayMaxHours`, a whole day for more;
 * - fixed: one lump sum, whatever the hours.
 * @throws InvalidBillingModeError for a day rate with impossible hours
 */
export function quantifyGroup(group: LineGroup, options: QuantityOptions): QuantifiedGroup {
  const { mode } = group.project;
  switch (mode.kind) {
    case "hourly": {
      const { seconds, adjustments } = hourlySeconds(group);
      const quantity = hoursFromSeconds(seconds, options.hoursScale, options.hoursRounding);
      const exact =
        quantity.coefficient * SECONDS_PER_HOUR === seconds * 10n ** BigInt(quantity.scale);
      return {
        quantity,
        unit: "hour",
        unitPrice: group.price,
        adjustments: exact
          ? adjustments
          : [
              ...adjustments,
              {
                kind: "quantity-rounded",
                lineId: group.id,
                exact: hoursFraction(seconds),
                rounded: quantity,
              },
            ],
      };
    }
    case "day-rate": {
      const { perDay, adjustments } = daySeconds(group);
      return {
        quantity: dayRateDays(perDay, mode),
        unit: "day",
        unitPrice: group.price,
        adjustments,
      };
    }
    case "fixed":
      return { quantity: ONE, unit: "lump-sum", unitPrice: group.price, adjustments: [] };
  }
}

const MAX_DESCRIPTION_LENGTH = 1000;

/** At most 1000 characters (what an invoice line takes), never ending on half a surrogate pair. */
function fit(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_DESCRIPTION_LENGTH) return trimmed;
  const cut = trimmed.slice(0, MAX_DESCRIPTION_LENGTH);
  const last = cut.charCodeAt(MAX_DESCRIPTION_LENGTH - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}

/** What the line says before it is fitted to an invoice line. */
function specificText({ grouping, project, first }: LineGroup): string {
  switch (grouping) {
    case "single":
    case "project":
      return project.name;
    case "task":
      return first.entry.taskName === undefined
        ? project.name
        : `${project.name} - ${first.entry.taskName}`;
    case "entry":
      return first.entry.description;
    case "day":
      return `${project.name} - ${first.date}`;
  }
}

/**
 * What the line says: the project (`single`, `project`), the project and task (`task`), the work
 * itself (`entry`) or the project and the day (`day`). Never empty: a blank text falls back to
 * the project name, and a blank name to the project id.
 */
export function describeGroup(group: LineGroup): string {
  const { project } = group;
  return [specificText(group), project.name].map(fit).find((text) => text !== "") ?? project.id;
}
