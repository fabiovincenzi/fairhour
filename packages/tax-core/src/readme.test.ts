/**
 * The examples of README.md, executed. Keep the two in sync: if this test changes, update the
 * README (and the other way round).
 */
import { decimal, type Decimal } from "@fairhour/money";
import { describe, expect, it } from "vitest";
import * as z from "zod";
import { runConformanceChecks } from "./conformance/index";
import {
  computeInvoice,
  formatTrace,
  isoDate,
  message,
  p,
  parseInvoiceInput,
  sumAllocations,
  taxAllocations,
  type SourceRef,
  type TaxPack,
} from "./index";

// --- README: a minimal pack -------------------------------------------------------------------

const vatAct: SourceRef = {
  id: "demo.vat-act.art-1",
  kind: "statute",
  title: "Demo VAT Act",
  citation: "art. 1",
  url: "https://example.com/demo-vat-act",
  verification: { status: "to-be-verified", reason: "Example pack" },
};

const configSchema = z.strictObject({
  taxScope: z.enum(["per-group", "per-line"]).default("per-group"),
});
type Config = z.output<typeof configSchema>;
const optionsSchema = z.strictObject({});
type Options = z.output<typeof optionsSchema>;
interface Params {
  readonly vatRate: Decimal;
}
type Facts = Record<string, never>;

export const demoPack: TaxPack<Config, Params, Facts, Options> = {
  meta: {
    id: "demo",
    name: "Demo",
    version: "1.0.0",
    countries: "any",
    description: "A single VAT rate on every line except disbursements.",
    maintainers: [{ name: "You" }],
    docsUrl: "https://example.com/tax-packs/demo",
    disclaimer: message("meta.disclaimer"),
    locales: ["en"],
  },
  configSchema,
  invoiceOptionsSchema: optionsSchema,
  parameters: [
    {
      id: "demo-2024-01-01",
      effectiveFrom: isoDate("2024-01-01"),
      params: Object.freeze({ vatRate: decimal("20") }),
      sources: [vatAct],
      changes: ["Initial version."],
    },
  ],
  rules: [
    {
      id: "demo.classify",
      title: message("demo.classify.title"),
      sources: [vatAct],
      apply: (state, ctx) => ({
        groups: [
          {
            id: "vat",
            treatment: "taxable",
            rate: ctx.params.vatRate,
            label: message("demo.group.vat", { rate: p.percent(ctx.params.vatRate) }),
          },
          { id: "excluded", treatment: "excluded", label: message("demo.group.excluded") },
        ],
        lineGroups: Object.fromEntries(
          state.lines.map((line) => [
            line.id,
            line.treatment.kind === "excluded" ? "excluded" : "vat",
          ]),
        ),
      }),
    },
    {
      id: "demo.vat",
      title: message("demo.vat.title"),
      sources: [vatAct],
      apply: (state, ctx) => {
        const allocations = taxAllocations(state, ctx.rounding.taxes, ctx.currency);
        if (allocations.length === 0) return { trace: [{ message: message("demo.vat.none") }] };
        const { base, amount } = sumAllocations(allocations, ctx.currency);
        const rate = ctx.params.vatRate;
        return {
          components: [
            {
              id: "demo.vat",
              kind: "tax",
              label: message("demo.vat.label", { rate: p.percent(rate) }),
              effect: "adds-to-total",
              base,
              rate,
              amount,
              allocations,
            },
          ],
          trace: [
            {
              message: message("demo.vat.trace", { rate: p.percent(rate) }),
              formula: message("core.formula.percentage", {
                rate: p.percent(rate),
                base: p.money(base),
                amount: p.money(amount),
              }),
              amount,
              componentId: "demo.vat",
            },
          ],
        };
      },
    },
  ],
  initialFacts: {},
  messages: {
    en: {
      "meta.name": "Demo",
      "meta.description": "A single VAT rate on every line except disbursements.",
      "meta.disclaimer": "Figures are informational: verify them with an accountant.",
      "demo.classify.title": "Line classification",
      "demo.group.vat": "VAT {rate}",
      "demo.group.excluded": "Disbursements",
      "demo.vat.title": "VAT",
      "demo.vat.label": "VAT {rate}",
      "demo.vat.trace": "VAT at {rate} on the taxable amount",
      "demo.vat.none": "No VAT: nothing is taxable",
      "demo.rounding": "Line totals and VAT are rounded half up to the cent.",
    },
  },
  roundingPolicy: (config) => ({
    step: "minor-unit",
    lines: { mode: "halfUp" },
    contributions: { mode: "halfUp", scope: "per-group" },
    taxes: { mode: "halfUp", scope: config.taxScope },
    withholdings: { mode: "halfUp", scope: "per-document" },
    description: message("demo.rounding"),
  }),
  capabilities: {},
};

// --- README: computing an invoice -------------------------------------------------------------

const input = parseInvoiceInput({
  issueDate: "2026-03-15",
  currency: "EUR",
  client: { country: "GB", kind: "business", isWithholdingAgent: false },
  lines: [
    {
      id: "l1",
      kind: "service",
      description: "Design",
      quantity: "12.5",
      unit: "hour",
      unitPrice: "80",
    },
    {
      id: "l2",
      kind: "reimbursement",
      description: "Court fee",
      quantity: "1",
      unit: "item",
      unitPrice: "16",
    },
  ],
});

describe("README examples", () => {
  it("computes the example invoice and its trace", () => {
    const computation = computeInvoice(demoPack, {}, input);
    const lines = formatTrace(computation, demoPack, "en").map(
      (step) =>
        `${step.step}. ${step.text}${step.formula === undefined ? "" : ` (${step.formula})`}`,
    );
    expect(lines.map((line) => line.replace(/[\u00a0\u202f]/g, " "))).toEqual([
      "1. Design: 12.5 × €80.00 = €1,000.00",
      "2. Court fee: 1 × €16.00 = €16.00",
      "3. Subtotal of the lines: €1,016.00",
      "4. VAT at 20% on the taxable amount (20% × €1,000.00 = €200.00)",
      "5. Document total: €1,216.00",
      "6. Net amount payable: €1,216.00",
    ]);
    expect(computation.trace[3]?.ruleId).toBe("demo.vat");
    expect(computation.trace[3]?.sources[0]?.citation).toBe("art. 1");
  });

  it("passes the conformance checks it can without fixtures", () => {
    const results = runConformanceChecks(demoPack, {
      fixtures: [],
      validConfigs: [{}, { taxScope: "per-line" }],
      invalidConfigs: [{ config: { taxScope: "never" }, reason: "unknown scope" }],
      sampleInputs: [
        {
          issueDate: "2026-03-15",
          currency: "EUR",
          client: { country: "GB", kind: "business", isWithholdingAgent: false },
          lines: [],
        },
      ],
      properties: { numRuns: 20 },
    });
    // A real pack commits golden fixtures; this one has none, so only fixtures.schema fails.
    expect(results.filter((result) => !result.ok).map((result) => result.id)).toEqual([
      "fixtures.schema",
    ]);
  });
});
