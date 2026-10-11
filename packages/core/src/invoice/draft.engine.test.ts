/**
 * End to end: tracked time -> draft -> the tax engine. @fairhour/core depends on no tax pack, so
 * the engine runs a small pack built in `test/vat-pack.ts` with the public API of tax-core.
 */
import { decimal, decimalToString, extend, money, price, sum, zero } from "@fairhour/money";
import {
  InvalidInputError,
  InvalidOptionsError,
  computeInvoice,
  isoDate,
} from "@fairhour/tax-core";
import { describe, expect, it } from "vitest";
import {
  dayRateProject,
  draftOptions,
  entry,
  eur,
  fixedProject,
  hourlyProject,
} from "../../test/invoice";
import { vatPack } from "../../test/vat-pack";
import { buildInvoiceDraft } from "./draft";
import type { BillableEntry, InvoiceDraftOptions, ProjectBilling } from "./types";

const alpha = hourlyProject("alpha", "Alpha");

function compute(
  entries: readonly BillableEntry[],
  projects: readonly ProjectBilling[],
  overrides: Partial<InvoiceDraftOptions> = {},
) {
  const draft = buildInvoiceDraft(entries, projects, draftOptions(overrides));
  return { draft, computation: computeInvoice(vatPack, {}, draft.input) };
}

describe("a draft in the tax engine", () => {
  const entries = [
    entry("a1", "2026-03-02T08:00:00Z", "2026-03-02T10:00:00Z"),
    entry("a2", "2026-03-03T08:00:00Z", "2026-03-03T09:30:00Z"),
    entry("a3", "2026-03-04T09:00:00Z", "2026-03-04T10:00:00Z"),
    entry("a4", "2026-03-05T09:00:00Z", "2026-03-05T09:30:00Z"),
  ];
  const extraLines: InvoiceDraftOptions["extraLines"] = [
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
      description: "Stamp for the client",
      quantity: decimal("2"),
      unitPrice: eur("2"),
    },
    {
      kind: "mileage",
      id: "trip",
      description: "Client visit",
      kilometres: decimal("120.5"),
      ratePerKm: price("0.4253", "EUR"),
    },
  ];

  it("turns tracked time, expenses and mileage into exact amounts", () => {
    const { draft, computation } = compute(entries, [alpha], { extraLines });
    // 5.00 h x 80 = 400.00; the train 45.50; the stamp 2 x 2 = 4.00 (excluded); 120.5 km x 0.4253 = 51.25
    expect(computation.lines.map((line) => [line.id, line.net.amount, line.groupId])).toEqual([
      ["p:alpha", 40_000n, "vat-20"],
      ["x:train", 4_550n, "vat-20"],
      ["x:stamp", 400n, "excluded"],
      ["x:trip", 5_125n, "vat-20"],
    ]);
    expect(computation.subtotal).toEqual(money(50_075n, "EUR"));
    // VAT on 496.75 only: the reimbursement is outside the taxable amount
    expect(computation.taxableBase).toEqual(money(49_675n, "EUR"));
    expect(computation.taxTotal).toEqual(money(9_935n, "EUR"));
    expect(computation.total).toEqual(money(60_010n, "EUR"));
    expect(
      computation.vatSummary.map((row) => [row.groupId, row.base.amount, row.tax.amount]),
    ).toEqual([
      ["vat-20", 49_675n, 9_935n],
      ["excluded", 400n, 0n],
    ]);
    expect(computation.issueDate).toBe("2026-04-02");
    // every line total is what the document shows: quantity x unit price
    for (const line of computation.lines) {
      expect(line.net).toEqual(extend(line.unitPrice, line.quantity, "halfUp"));
    }
    expect(draft.provenance[0]?.entryIds).toEqual(["a1", "a2", "a3", "a4"]);
  });

  it("bills the rounded hours the client reads, not the exact ones", () => {
    // 20 minutes at 90 an hour: 0.33 h x 90 = 29.70, not 30.00
    const third = entry("t1", "2026-03-02T08:00:00Z", "2026-03-02T08:20:00Z", { rate: eur("90") });
    const { draft, computation } = compute([third], [alpha]);
    expect(computation.lines[0]?.net).toEqual(money(2_970n, "EUR"));
    expect(draft.adjustments).toEqual([
      { kind: "quantity-rounded", lineId: "p:alpha", exact: "1/3", rounded: decimal("0.33") },
    ]);
  });

  it("bills the rounded durations of a project", () => {
    const rounded = hourlyProject("alpha", "Alpha", {
      rounding: { kind: "step", minutes: 15, direction: "up" },
    });
    const short = [entry("s1", "2026-03-02T08:00:00Z", "2026-03-02T08:07:00Z")];
    // 7 minutes billed as a quarter of an hour: 0.25 x 80 = 20.00
    expect(compute(short, [rounded]).computation.subtotal).toEqual(money(2_000n, "EUR"));
  });

  it("carries a conversion to the computation, with the rate that was used", () => {
    const usd = entry("u1", "2026-03-02T08:00:00Z", "2026-03-02T10:00:00Z", {
      rate: price("90", "USD"),
    });
    const rate = {
      from: "USD",
      rate: decimal("0.92"),
      date: isoDate("2026-04-01"),
      source: "ECB reference rate",
    } as const;
    const { computation } = compute([usd], [alpha], { exchangeRates: [rate] });
    // 2.00 h x 82.80
    expect(computation.lines[0]?.net).toEqual(money(16_560n, "EUR"));
    expect(computation.exchangeRates).toEqual([rate]);
  });

  it("bills a day rate and a lump sum", () => {
    const days = [
      entry("d1", "2026-03-02T08:00:00Z", "2026-03-02T11:00:00Z", {
        projectId: "days",
        rate: eur("560"),
      }),
      entry("d2", "2026-03-03T08:00:00Z", "2026-03-03T17:00:00Z", {
        projectId: "days",
        rate: eur("560"),
      }),
      entry("f1", "2026-03-04T08:00:00Z", "2026-03-04T09:00:00Z", { projectId: "fixed" }),
    ];
    const { computation } = compute(days, [
      dayRateProject("days", "Days"),
      fixedProject("fixed", "Fixed"),
    ]);
    // 1.5 days x 560 = 840.00 and the agreed 1500.00
    expect(computation.lines.map((line) => [line.id, line.net.amount])).toEqual([
      ["p:days", 84_000n],
      ["p:fixed", 150_000n],
    ]);
    expect(computation.subtotal).toEqual(money(234_000n, "EUR"));
  });

  it("keeps a rate that does not fit a float exact", () => {
    // 17 significant digits: more than the 53 bits of a double
    const precise = entry("p1", "2026-03-02T08:00:00Z", "2026-03-02T11:20:00Z", {
      rate: price("123456789.12345678", "EUR"),
    });
    const { computation } = compute([precise], [alpha]);
    const [line] = computation.lines;
    expect(decimalToString(line?.unitPrice.amount ?? decimal("0"))).toBe("123456789.12345678");
    // 3.33 h (3 h 20 min, rounded) x 123456789.12345678 = 411111107.7811110774
    expect(line?.net).toEqual(money(41_111_110_778n, "EUR"));
  });

  it("is an empty computation when nothing was tracked", () => {
    const { computation } = compute([], [alpha]);
    expect(computation.lines).toEqual([]);
    expect(computation.total).toEqual(zero("EUR"));
    expect(computation.warnings.map((warning) => warning.code)).toEqual(["core.no-lines"]);
  });

  it("hands the pack options over untouched", () => {
    expect(
      compute(entries, [alpha], { packOptions: { marker: "from-core" } }).computation.lines,
    ).toHaveLength(1);
    const draft = buildInvoiceDraft(
      entries,
      [alpha],
      draftOptions({ packOptions: { unknown: true } }),
    );
    expect(() => computeInvoice(vatPack, {}, draft.input)).toThrow(InvalidOptionsError);
  });

  it("only produces input that the engine's own validation accepts", () => {
    const draft = buildInvoiceDraft(entries, [alpha], draftOptions({ extraLines }));
    expect(() => computeInvoice(vatPack, {}, draft.input)).not.toThrow();
    const broken = { ...draft.input, currency: "XXX" } as unknown as typeof draft.input;
    expect(() => computeInvoice(vatPack, {}, broken)).toThrow(InvalidInputError);
  });

  it("adds up to the sum of the line totals, whatever the grouping", () => {
    const totals = (["project", "task", "entry", "single"] as const).map((grouping) => {
      const { computation } = compute(entries, [alpha], { grouping });
      return sum(
        computation.lines.map((line) => line.net),
        "EUR",
      );
    });
    // 5 hours of 15 and 30 minute multiples: every grouping bills the same 400.00
    expect(totals).toEqual(Array.from({ length: 4 }, () => money(40_000n, "EUR")));
  });
});
