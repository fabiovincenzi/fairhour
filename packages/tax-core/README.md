# @fairhour/tax-core

A pure, I/O-free tax engine that turns invoice lines into **the exact amounts to put on an
invoice**, and explains every figure with the rule, the parameter version and the legal source
that produced it. Country-specific logic lives in **tax packs**; this package is the engine they
plug into, plus a shared conformance suite that every pack must pass.

- **Exact money.** Amounts are [`@fairhour/money`](https://github.com/fabiovincenzi/fairhour/blob/main/packages/money) values (`bigint` minor units, ISO 4217
  currency); every rounding is explicit. No floats anywhere.
- **Reconciled by construction.** Rules only _append_ tax groups, components, notes, warnings and
  trace steps. The engine checks a merge contract after each rule, derives the tax summary and
  the totals itself, and asserts eight reconciliation identities (`total = subtotal + Σ
components = Σ base + Σ tax`, `netPayable = total − deductions`, ...) on every computation.
- **Explainable.** Every step is a localized message with typed parameters and its sources.
- **Versioned law.** Parameters (rates, thresholds, fixed amounts) are snapshots with an
  effective date; an invoice uses the version in force on its issue date.
- **Pure and deterministic.** No clock, randomness, environment or I/O. The same pack version,
  configuration and input give byte-identical JSON. Runs on servers, in browsers and in desktop
  webviews.

Dependencies: `@fairhour/money` and `zod` 4. The `@fairhour/tax-core/conformance` entry point
additionally uses `vitest` and `fast-check` (optional peer dependencies). License: MIT.

> Figures produced by tax packs are informational. Verify them with an accountant.

## What a tax pack is

A pack is a plain object implementing `TaxPack<Config, Params, Facts, Options>`:

| Field                  | What it is                                                                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `meta`                 | id (`"it"`), semver version, countries, maintainers, docs URL, disclaimer, locales (`"en"` required), optional document locale for legal notes |
| `configSchema`         | zod 4 schema of the workspace settings; JSON in, JSON out (settings forms are generated from it with `z.toJSONSchema`)                         |
| `invoiceOptionsSchema` | zod 4 schema of per-invoice options (`z.strictObject({})` when there are none)                                                                 |
| `parameters`           | versions with an inclusive `effectiveFrom`, a full `params` snapshot, `sources` and a list of `changes`; never edit a released version         |
| `rules`                | the pipeline: each rule has a stable id (`it.ordinario.vat`), a title, at least one `SourceRef` and a pure `apply(state, ctx)`                 |
| `initialFacts`         | facts rules can set for later rules (`{ withholdingApplied: false }`)                                                                          |
| `messages`             | message catalogs per locale; `en` is required, keys `core.*` are reserved                                                                      |
| `roundingPolicy`       | mode and scope of each rounding (lines, contributions, taxes per group or per line, withholdings)                                              |
| `validateInput`        | optional refusals of inputs the pack does not model (`UnsupportedInputError`)                                                                  |
| `capabilities`         | optional extras, such as annual revenue thresholds                                                                                             |

A rule returns what it **adds**: tax groups and the assignment of lines to them, components
(contributions, taxes, withholdings, stamp duties, ...) with their allocation to groups, legal
notes, warnings, trace steps and facts. It never computes totals: the engine does.

### A minimal pack

One VAT rate on every line, except disbursements:

```ts
import { decimal, type Decimal } from "@fairhour/money";
import {
  isoDate,
  message,
  p,
  sumAllocations,
  taxAllocations,
  type SourceRef,
  type TaxPack,
} from "@fairhour/tax-core";
import * as z from "zod";

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
type Facts = Record<string, never>; // facts are a type alias, never an interface

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
```

Real packs keep one rule per file with table-driven tests, cite real sources (and mark uncertain
ones `to-be-verified`), and document every rule in `docs/tax-packs/<id>.md`.

## Computing an invoice

```ts
import { computeInvoice, formatTrace, parseInvoiceInput } from "@fairhour/tax-core";

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

const computation = computeInvoice(demoPack, { taxScope: "per-group" }, input);
// computation.total      -> { amount: 121600n, currency: "EUR" }
// computation.netPayable -> { amount: 121600n, currency: "EUR" }

for (const step of formatTrace(computation, demoPack, "en")) {
  console.log(`${step.step}. ${step.text}${step.formula ? ` (${step.formula})` : ""}`);
}
```

```text
1. Design: 12.5 × €80.00 = €1,000.00
2. Court fee: 1 × €16.00 = €16.00
3. Subtotal of the lines: €1,016.00
4. VAT at 20% on the taxable amount (20% × €1,000.00 = €200.00)
5. Document total: €1,216.00
6. Net amount payable: €1,216.00
```

Every step also carries its `ruleId` and its `sources`. `formatComputation` gives the formatted
components, tax summary, totals, warnings, the disclaimer, and the legal notes both in the user's
locale and in the pack's document locale (the text to print on the invoice).

The result is deeply frozen. `computationToJson` gives its canonical JSON (amounts as decimal
strings, stable key order) for storage and APIs, and `computationFromJson` reads it back.
Invalid input, configuration or options throw `InvalidInputError`, `InvalidConfigError` and
`InvalidOptionsError` with every issue; a pack bug throws `RuleExecutionError`,
`RuleContractError` or `ReconciliationError`, never a partial result.

Other entry points: `validateInvoiceInput` (typed input), `resolveParameters`, `listParameters`,
`parametersToJson`, `toPackHandle` (a type-erased registry entry with the configuration JSON
Schema), the rule-author helpers (`basesByGroup`, `percentageByGroup`, `taxAllocations`,
`groupBase`, `sumNet`, `proRata`, ...) and `GoldenFixtureSchema`.

## Conformance suite

Every pack has a `src/conformance.test.ts` with a single call:

```ts
import { fileURLToPath } from "node:url";
import { defineConformanceSuite } from "@fairhour/tax-core/conformance";
import packageJson from "../package.json" with { type: "json" };
import { invalidConfigs, sampleInputs, validConfigs } from "./conformance.data";
import { demoPack } from "./index";

defineConformanceSuite(demoPack, {
  fixturesDir: fileURLToPath(new URL("../fixtures/invoices", import.meta.url)),
  validConfigs,
  invalidConfigs,
  sampleInputs,
  invoiceOptions: [{}],
  input: { currencies: ["EUR"] },
  packageVersion: packageJson.version,
});
```

It registers one vitest test per check, and none can be skipped: metadata and message catalogs
(complete in every locale, valid placeholders), configuration schema behaviour (valid, invalid,
idempotent, JSON Schema), the parameter timeline (sorted, sourced, frozen, resolvable, and
snapshotted so that editing a released version shows up in review), rule identity and sources,
the rounding policy, the golden fixtures in `fixtures/invoices/*.json`, the sample inputs, and
fast-check properties on generated invoices: reconciliation, determinism, permutation invariance,
non-negative amounts, one currency, rounding bounds, immutability, a complete localized trace,
JSON round trip and the rejection of malformed input. Sources marked `to-be-verified` are listed
as test annotations.

`runConformanceChecks(pack, options)` runs the same checks as plain functions, and
`invoiceInputArbitrary`, `decimalArbitrary` and `priceArbitrary` are available for a pack's own
property tests.

A golden fixture pins the legally relevant output of one real-world invoice:

```json
{
  "name": "standard-rate",
  "description": "12.5 h at €80.00: VAT 20% of €1,000.00 = €200.00.",
  "pack": "demo",
  "sources": [{ "title": "Demo VAT Act", "citation": "art. 1" }],
  "config": {},
  "input": {
    "issueDate": "2026-03-15",
    "currency": "EUR",
    "client": { "country": "GB", "kind": "business", "isWithholdingAgent": false },
    "lines": [
      {
        "id": "l1",
        "kind": "service",
        "description": "Design",
        "quantity": "12.5",
        "unit": "hour",
        "unitPrice": "80"
      }
    ]
  },
  "expected": {
    "components": [{ "id": "demo.vat", "base": "1000.00", "rate": "20", "amount": "200.00" }],
    "total": "1200.00",
    "netPayable": "1200.00"
  }
}
```

## Design

The full contract (types, merge rules, reconciliation identities R1 to R8, the conformance checks)
is in [`docs/design/tax-engine.md`](https://github.com/fabiovincenzi/fairhour/blob/main/docs/design/tax-engine.md), and the decision record is
[ADR-0004](https://github.com/fabiovincenzi/fairhour/blob/main/docs/adr/0004-tax-engine-architecture.md).

## License

MIT. See [LICENSE](./LICENSE).
