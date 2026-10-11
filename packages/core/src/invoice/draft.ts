import {
  type InvoiceInput,
  type InvoiceLineInput,
  MAX_INVOICE_LINES,
  validateInvoiceInput,
} from "@fairhour/tax-core";
import { localDateOf } from "../time/instant";
import { type Converter, createConverter } from "./currency";
import { DraftError } from "./errors";
import { buildLineGroups } from "./group";
import { describeGroup, quantifyGroup } from "./lines";
import { assertPeriod, assertSourceId, indexProjects, selectEntries } from "./select";
import type {
  BillableEntry,
  DraftAdjustment,
  ExtraLine,
  InvoiceDraft,
  InvoiceDraftOptions,
  LineProvenance,
  ProjectBilling,
} from "./types";

/** Any instant does: reading the date in the time zone is what fails for an unknown zone. */
const ANY_INSTANT = "1970-01-01T00:00:00Z";

/**
 * An extra line as an invoice line, with a unique id of its own (`x:<id>`). Reimbursements are
 * excluded from the taxable amount unless the line says otherwise; the bridge decides nothing
 * else about tax.
 */
function extraLineInput(
  extra: ExtraLine,
  converter: Converter,
): { readonly line: InvoiceLineInput; readonly adjustment?: DraftAdjustment } {
  const id = `x:${extra.id}`;
  if (extra.kind === "mileage") {
    const { price, adjustment } = converter.convert(extra.ratePerKm, id);
    return {
      line: {
        id,
        kind: "mileage",
        description: extra.description,
        quantity: extra.kilometres,
        unit: "km",
        unitPrice: price,
        treatment: { kind: "standard" },
      },
      ...(adjustment === undefined ? {} : { adjustment }),
    };
  }
  const { price, adjustment } = converter.convert(extra.unitPrice, id);
  return {
    line: {
      id,
      kind: extra.kind,
      description: extra.description,
      quantity: extra.quantity,
      unit: "item",
      unitPrice: price,
      treatment: extra.treatment ?? {
        kind: extra.kind === "reimbursement" ? "excluded" : "standard",
      },
    },
    ...(adjustment === undefined ? {} : { adjustment }),
  };
}

/**
 * Turns tracked time and extra items into the input of the tax engine (CORE-009, design 7): the
 * lines to put on an invoice with their exact quantities and unit prices, where each line comes
 * from, and everything that was rounded or converted on the way. Pure and deterministic: the
 * same entries give the same draft in whatever order they are passed.
 *
 * 1. The entries whose local start date (in `timeZone`) lies in the period are invoiced; an
 *    entry that spans midnight belongs to the day it starts. Running entries in the period are
 *    refused.
 * 2. Durations are whole seconds, rounded per entry or per line as the project says.
 * 3. Entries are grouped as asked and always by project and rate. A fixed price is one lump-sum
 *    line per project; a day rate is counted per local day and never split below a day.
 * 4. Hours are exact decimals of `hoursScale` decimals (`hoursRounding`); days are multiples
 *    of 0.5; the unit price is the entry's rate, as the client reads it on the document.
 * 5. Extra lines (expenses, reimbursements, goods, mileage) follow the time lines.
 * 6. Prices in another currency are converted with the explicit exchange rate given for it; the
 *    rates used are copied to `input.exchangeRates`.
 * 7. Lines are `standard`, reimbursements `excluded`, unless an extra line says otherwise.
 *
 * Tax is never decided here: that is the pack's job.
 *
 * The draft is validated with `validateInvoiceInput`, so a problem the builder did not foresee
 * (and one in the caller's own `client`, `extraLines` or `packOptions`) surfaces as
 * `InvalidInputError` with the path of every issue.
 * @throws DraftError, MissingRateError, DuplicateExchangeRateError, InvalidBillingModeError,
 *         InvalidInstantError, InvalidIntervalError, InvalidTimeZoneError, InvalidDateError,
 *         InvalidInputError
 */
export function buildInvoiceDraft(
  entries: readonly BillableEntry[],
  projects: readonly ProjectBilling[],
  options: InvoiceDraftOptions,
): InvoiceDraft {
  assertPeriod(options.period);
  localDateOf(ANY_INSTANT, options.timeZone);
  const converter = createConverter(options.currency, options.exchangeRates ?? []);
  const selected = selectEntries(
    entries,
    indexProjects(projects),
    options.period,
    options.timeZone,
  );

  const adjustments: DraftAdjustment[] = selected
    .filter((item) => item.billedSeconds !== item.seconds)
    .map((item) => ({
      kind: "duration-rounded",
      entryId: item.entry.id,
      fromSeconds: item.seconds,
      toSeconds: item.billedSeconds,
    }));
  const lines: InvoiceLineInput[] = [];
  const provenance: LineProvenance[] = [];

  for (const group of buildLineGroups(selected, options.grouping)) {
    const quantified = quantifyGroup(group, {
      hoursScale: options.hoursScale,
      hoursRounding: options.hoursRounding ?? "halfUp",
    });
    const { price, adjustment } = converter.convert(quantified.unitPrice, group.id);
    lines.push({
      id: group.id,
      kind: "service",
      description: describeGroup(group),
      quantity: quantified.quantity,
      unit: quantified.unit,
      unitPrice: price,
      treatment: { kind: "standard" },
    });
    provenance.push({ lineId: group.id, entryIds: group.entries.map((item) => item.entry.id) });
    adjustments.push(...quantified.adjustments);
    if (adjustment !== undefined) adjustments.push(adjustment);
  }

  const extraIds = new Set<string>();
  for (const extra of options.extraLines ?? []) {
    assertSourceId(extra.id);
    if (extraIds.has(extra.id)) throw new DraftError("duplicate-id", extra.id);
    extraIds.add(extra.id);
    const { line, adjustment } = extraLineInput(extra, converter);
    lines.push(line);
    provenance.push({ lineId: line.id, entryIds: [] });
    if (adjustment !== undefined) adjustments.push(adjustment);
  }
  if (lines.length > MAX_INVOICE_LINES) throw new DraftError("too-many-lines");

  const exchangeRates = converter.used();
  const input: InvoiceInput = {
    issueDate: options.issueDate,
    documentKind: "invoice",
    currency: options.currency,
    client: options.client,
    lines,
    ...(options.packOptions === undefined ? {} : { options: options.packOptions }),
    ...(exchangeRates.length === 0 ? {} : { exchangeRates }),
  };
  return { input: validateInvoiceInput(input), provenance, adjustments };
}
