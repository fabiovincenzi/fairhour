/**
 * A minimal tax pack for the end-to-end tests of the invoice draft builder. @fairhour/core does
 * not depend on any real tax pack (they live in their own packages), so this one, built with the
 * public API of @fairhour/tax-core only, plays their part: a fictional 20 % VAT on `standard`
 * lines, nothing on `excluded` ones, and a refusal of every other treatment.
 */
import { decimal } from "@fairhour/money";
import {
  type MessageCatalogs,
  type Rule,
  type SourceRef,
  type TaxPack,
  isoDate,
  message,
  p,
  sumAllocations,
  taxAllocations,
} from "@fairhour/tax-core";
import * as z from "zod";

const source: SourceRef = {
  id: "draft-test.vat-act",
  kind: "user-configuration",
  title: "Fictional VAT of the draft builder tests",
  citation: "art. 1",
  verification: { status: "to-be-verified", reason: "fictional pack, only used by tests" },
};

const messages: MessageCatalogs = {
  en: {
    "meta.name": "Draft builder test pack",
    "meta.description": "Fictional 20 % VAT, to test the bridge from time entries to the engine.",
    "meta.disclaimer": "Fictional figures.",
    "draft-test.rule.classify": "Line classification",
    "draft-test.rule.vat": "VAT",
    "draft-test.group.vat": "VAT {rate}",
    "draft-test.group.excluded": "Excluded (disbursements)",
    "draft-test.vat.label": "VAT",
    "draft-test.vat.trace": "VAT at {rate}",
    "draft-test.vat.none": "No VAT: nothing is taxable",
    "draft-test.issue.treatment": "Only standard and excluded lines are supported",
  },
};

type Options = z.output<typeof optionsSchema>;
const optionsSchema = z.strictObject({ marker: z.string().optional() });

interface Params {
  readonly rate: ReturnType<typeof decimal>;
}

type TestRule = Rule<Record<string, never>, Params, Record<string, never>, Options>;

const classify: TestRule = {
  id: "draft-test.classify",
  title: message("draft-test.rule.classify"),
  sources: [source],
  apply: (state, ctx) => ({
    groups: [
      {
        id: "vat-20",
        treatment: "taxable",
        rate: ctx.params.rate,
        label: message("draft-test.group.vat", { rate: p.percent(ctx.params.rate) }),
      },
      { id: "excluded", treatment: "excluded", label: message("draft-test.group.excluded") },
    ],
    lineGroups: Object.fromEntries(
      state.lines.map((line) => [
        line.id,
        line.treatment.kind === "excluded" ? "excluded" : "vat-20",
      ]),
    ),
  }),
};

const vat: TestRule = {
  id: "draft-test.vat",
  title: message("draft-test.rule.vat"),
  sources: [source],
  apply: (state, ctx) => {
    const allocations = taxAllocations(state, ctx.rounding.taxes, ctx.currency);
    if (allocations.length === 0) return { trace: [{ message: message("draft-test.vat.none") }] };
    const totals = sumAllocations(allocations, ctx.currency);
    return {
      components: [
        {
          id: "draft-test.vat",
          kind: "tax",
          label: message("draft-test.vat.label"),
          effect: "adds-to-total",
          base: totals.base,
          rate: ctx.params.rate,
          amount: totals.amount,
          allocations,
        },
      ],
      trace: [
        {
          message: message("draft-test.vat.trace", { rate: p.percent(ctx.params.rate) }),
          amount: totals.amount,
          componentId: "draft-test.vat",
        },
      ],
    };
  },
};

export const vatPack: TaxPack<Record<string, never>, Params, Record<string, never>, Options> = {
  meta: {
    id: "draft-test",
    name: "Draft builder test pack",
    version: "0.0.0",
    countries: "any",
    description: "Fictional 20 % VAT, to test the bridge from time entries to the engine.",
    maintainers: [{ name: "Fairhour tests" }],
    docsUrl: "https://example.com/fairhour/draft-test",
    disclaimer: message("meta.disclaimer"),
    locales: ["en"],
  },
  configSchema: z.strictObject({}),
  invoiceOptionsSchema: optionsSchema,
  parameters: [
    {
      id: "draft-test-2020",
      effectiveFrom: isoDate("2020-01-01"),
      params: { rate: decimal("20") },
      sources: [source],
      changes: ["Initial."],
    },
  ],
  rules: [classify, vat],
  initialFacts: {},
  messages,
  roundingPolicy: () => ({
    step: "minor-unit",
    lines: { mode: "halfUp" },
    contributions: { mode: "halfUp", scope: "per-group" },
    taxes: { mode: "halfUp", scope: "per-group" },
    withholdings: { mode: "halfUp", scope: "per-document" },
    description: message("meta.description"),
  }),
  validateInput: (input) =>
    input.lines.flatMap((line, index) =>
      line.treatment.kind === "standard" || line.treatment.kind === "excluded"
        ? []
        : [
            {
              path: ["lines", index, "treatment"],
              code: "draft-test.treatment",
              message: message("draft-test.issue.treatment"),
            },
          ],
    ),
  capabilities: {},
};
