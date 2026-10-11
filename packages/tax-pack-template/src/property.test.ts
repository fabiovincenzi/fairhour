/**
 * Properties specific to the Exampleland pack, on random invoices (fast-check). The shared
 * conformance suite already checks the engine-level properties on every pack (reconciliation,
 * determinism, permutation, non-negative amounts, rounding bounds...); here each property states a
 * rule of the pack's own law, recomputed independently from the input.
 *
 * TEMPLATE: write one property per sentence of your docs that says "always" or "never" ("the
 * withholding is always 15% of the fees", "the small-business regime never charges VAT"). When a
 * property fails, fast-check prints the seed and the shrunk counterexample: turn it into a
 * table-driven case or a golden fixture before you fix the rule.
 */
import { percentage, sum, zero } from "@fairhour/money";
import {
  computeInvoice,
  countryCode,
  isoDate,
  type InvoiceComputation,
  type InvoiceInput,
} from "@fairhour/tax-core";
import { invoiceInputArbitrary } from "@fairhour/tax-core/conformance";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { XxConfigInput } from "./config";
import { xxPack } from "./index";
import { findParameters, withholdingRate } from "./parameters";
import { isFeeLine, WITHHOLDING_COMPONENT_ID } from "./rules/withholding";
import { VAT_COMPONENT_ID } from "./rules/vat";

const NUM_RUNS = 150;

/**
 * Random invoices in the parameter timeline. Explicit `rate` lines are left out: random rates are
 * refused by validateInput (the conformance suite covers refusals).
 */
const inputs = (currency: "EUR" | "JPY"): fc.Arbitrary<InvoiceInput> =>
  invoiceInputArbitrary({
    currency,
    dateRange: { from: isoDate("2024-01-01"), to: isoDate("2027-12-31") },
    clientCountries: ["DE", "FR", "US"].map((code) => countryCode(code)),
    treatments: ["standard", "exempt", "out-of-scope", "excluded"],
  });

const configs: fc.Arbitrary<XxConfigInput> = fc.record({
  vatRegistered: fc.boolean(),
  defaultVatRate: fc.constantFrom("standard" as const, "reduced" as const),
  withholding: fc.record({
    enabled: fc.boolean(),
    rate: fc.constantFrom("standard" as const, "new-business" as const),
  }),
});

const componentIds = (c: InvoiceComputation): readonly string[] =>
  c.components.map((component) => component.id);

describe("Exampleland properties", () => {
  it("the small-business exemption never charges VAT and always prints its note", () => {
    fc.assert(
      fc.property(inputs("EUR"), (input) => {
        const c = computeInvoice(xxPack, { vatRegistered: false }, input);
        expect(componentIds(c)).not.toContain(VAT_COMPONENT_ID);
        expect(c.taxTotal.amount).toBe(0n);
        expect(c.legalNotes.map((note) => note.id)).toEqual(["xx.note.small-business"]);
        expect(c.vatSummary.every((row) => row.treatment !== "taxable")).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("the withholding is the configured rate of the fees, rounded half up once", () => {
    fc.assert(
      fc.property(
        configs,
        inputs("EUR"),
        fc.constantFrom("auto", "skip"),
        (config, input, option) => {
          const c = computeInvoice(xxPack, config, { ...input, options: { withholding: option } });
          const parsed = xxPack.configSchema.parse(config);
          const params = findParameters(input.issueDate)?.params;
          if (params === undefined) throw new Error("the date range is inside the timeline");
          const fees = sum(
            c.lines.filter((item) => isFeeLine(item)).map((item) => item.net),
            input.currency,
          );
          const due =
            parsed.withholding.enabled &&
            input.client.isWithholdingAgent &&
            option === "auto" &&
            fees.amount > 0n;
          const expected = due
            ? percentage(fees, withholdingRate(params, parsed.withholding.rate), "halfUp")
            : zero(input.currency);
          expect(c.withholdingTotal).toEqual(expected);
          expect(componentIds(c).includes(WITHHOLDING_COMPONENT_ID)).toBe(due);
          // The withholding never changes the total, only what the client pays.
          expect(c.netPayable.amount).toBe(c.total.amount - expected.amount);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("VAT is the group's rate of the group's base, rounded half up once per rate (JPY too)", () => {
    fc.assert(
      fc.property(inputs("JPY"), (input) => {
        const c = computeInvoice(xxPack, {}, input);
        for (const row of c.vatSummary) {
          if (row.treatment !== "taxable" || row.rate === undefined) continue;
          expect(row.tax).toEqual(percentage(row.base, row.rate, "halfUp"));
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
