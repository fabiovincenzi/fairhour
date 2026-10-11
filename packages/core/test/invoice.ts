/** Fixtures shared by the invoice draft tests. */
import { type Price, decimal, decimalToString, money, price } from "@fairhour/money";
import { type ClientInput, countryCode, isoDate } from "@fairhour/tax-core";
import type {
  BillableEntry,
  InvoiceDraft,
  InvoiceDraftOptions,
  ProjectBilling,
} from "../src/invoice/types";

export const ROME = "Europe/Rome";

export const client: ClientInput = {
  country: countryCode("IT"),
  kind: "business",
  isWithholdingAgent: false,
};

/** An hourly rate in euros. */
export const eur = (amount: string): Price => price(amount, "EUR");

/** Hourly billing at 80 EUR, rounding off, per entry. */
export function hourlyProject(
  id: string,
  name = id.toUpperCase(),
  overrides: Partial<ProjectBilling> = {},
): ProjectBilling {
  return {
    id,
    name,
    mode: { kind: "hourly" },
    rounding: { kind: "none" },
    roundingScope: "entry",
    ...overrides,
  };
}

/** 8 hours a day, up to 4 hours is half a day. */
export function dayRateProject(
  id: string,
  name = id.toUpperCase(),
  overrides: Partial<ProjectBilling> = {},
): ProjectBilling {
  return hourlyProject(id, name, {
    mode: { kind: "day-rate", hoursPerDay: decimal("8"), halfDayMaxHours: decimal("4") },
    ...overrides,
  });
}

/** A lump sum of 1500.00 EUR unless said otherwise. */
export function fixedProject(
  id: string,
  name = id.toUpperCase(),
  overrides: Partial<ProjectBilling> = {},
): ProjectBilling {
  return hourlyProject(id, name, {
    mode: { kind: "fixed", amount: money(150_000n, "EUR") },
    ...overrides,
  });
}

/** An entry of project `alpha` at 80 EUR an hour unless `overrides` say otherwise. */
export function entry(
  id: string,
  start: string,
  end: string | null,
  overrides: Partial<BillableEntry> = {},
): BillableEntry {
  return {
    id,
    projectId: "alpha",
    description: `Work ${id}`,
    start,
    end,
    rate: eur("80"),
    ...overrides,
  };
}

/** March 2026 in Rome, issued on 2 April, grouped by project, hours to 2 decimals. */
export function draftOptions(overrides: Partial<InvoiceDraftOptions> = {}): InvoiceDraftOptions {
  return {
    issueDate: isoDate("2026-04-02"),
    period: { from: isoDate("2026-03-01"), to: isoDate("2026-03-31") },
    timeZone: ROME,
    grouping: "project",
    hoursScale: 2,
    currency: "EUR",
    client,
    ...overrides,
  };
}

/**
 * Entries on consecutive days of March 2026 (UTC, 08:00), one per duration in seconds, ids
 * `e1`, `e2`, ... of project `alpha`.
 */
export function entriesOfDurations(
  durations: readonly number[],
  overrides: Partial<BillableEntry> = {},
): BillableEntry[] {
  return durations.map((seconds, index) => {
    const start = Date.UTC(2026, 2, 2 + index, 8, 0, 0);
    return entry(
      `e${index + 1}`,
      new Date(start).toISOString(),
      new Date(start + seconds * 1000).toISOString(),
      overrides,
    );
  });
}

/** One readable text per line: `p:alpha | 2.50 hour x 80 EUR`. */
export function summary(draft: InvoiceDraft): string[] {
  return draft.input.lines.map(
    (line) =>
      `${line.id} | ${decimalToString(line.quantity)} ${line.unit} x ${decimalToString(line.unitPrice.amount)} ${line.unitPrice.currency}`,
  );
}
