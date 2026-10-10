/**
 * The examples of README.md, executed. Keep the two in sync: if this test changes, update the
 * README (and the other way round).
 */
import {
  computeInvoice,
  formatComputation,
  formatTrace,
  parseInvoiceInput,
} from "@fairhour/tax-core";
import { describe, expect, it } from "vitest";
import { configSchema, genericPack, type GenericConfigInput } from "./index";

// --- README: quick start ------------------------------------------------------------------------

const config: GenericConfigInput = { taxLabel: "VAT", tax: { kind: "rate", rate: "20" } };

const input = parseInvoiceInput({
  issueDate: "2026-03-15",
  currency: "GBP",
  client: { country: "GB", kind: "business", isWithholdingAgent: false, vatId: "GB123456789" },
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
      description: "Courier",
      quantity: "1",
      unit: "item",
      unitPrice: "16",
    },
  ],
});

// --- README: configuration examples --------------------------------------------------------------

const examples: Record<string, GenericConfigInput> = {
  ukVat: { taxLabel: "VAT", tax: { kind: "rate", rate: "20", allowedLineRates: ["5", "0"] } },
  australianGst: {
    taxLabel: "GST",
    tax: { kind: "rate", rate: "10" },
    rounding: { taxScope: "per-line" },
  },
  usSalesTax: {
    taxLabel: "Sales tax",
    tax: { kind: "rate", rate: "8.875" },
    rounding: { mode: "halfEven" },
  },
  noTax: {
    tax: { kind: "none", note: "VAT not applicable: small business exemption" },
    documentNote: "Registered in England and Wales, company number 01234567",
  },
  euReverseCharge: {
    taxLabel: "VAT",
    tax: { kind: "rate", rate: "19" },
    reverseCharge: {
      mode: "foreign-business-clients",
      supplierCountry: "DE",
      note: "Reverse charge",
    },
  },
  withholding: {
    taxLabel: "IVA",
    tax: { kind: "rate", rate: "21" },
    withholding: { label: "IRPF", rate: "15", appliesTo: "business-clients" },
  },
};

describe("README examples", () => {
  it("quick start: computes and explains a UK-style VAT invoice", () => {
    const computation = computeInvoice(genericPack, config, input);
    expect(computation.subtotal).toEqual({ amount: 101600n, currency: "GBP" });
    expect(computation.taxTotal).toEqual({ amount: 20000n, currency: "GBP" });
    expect(computation.total).toEqual({ amount: 121600n, currency: "GBP" });
    expect(computation.netPayable).toEqual({ amount: 121600n, currency: "GBP" });

    const lines = formatTrace(computation, genericPack, "en").map(
      (step) => `${step.step}. ${step.text}${step.formula ? ` (${step.formula})` : ""}`,
    );
    expect(lines).toEqual([
      "1. Design: 12.5 × £80.00 = £1,000.00",
      "2. Courier: 1 × £16.00 = £16.00",
      "3. Subtotal of the lines: £1,016.00",
      "4. Lines classified into tax groups: 2",
      "5. VAT at 20% on the taxable amount (20% × £1,000.00 = £200.00)",
      "6. Document total: £1,216.00",
      "7. Net amount payable: £1,216.00",
    ]);

    const formatted = formatComputation(computation, genericPack, "en");
    expect(formatted.vatSummary.map((row) => [row.label, row.base, row.tax])).toEqual([
      ["VAT 20%", "£1,000.00", "£200.00"],
      ["Disbursements (outside the taxable amount)", "£16.00", "£0.00"],
    ]);
  });

  it.each(Object.entries(examples))("configuration example %s is valid", (_name, example) => {
    expect(configSchema.safeParse(example).success).toBe(true);
  });

  it("reverse charge: a French business client of a German supplier", () => {
    const euInput = parseInvoiceInput({
      issueDate: "2026-03-15",
      currency: "EUR",
      client: {
        country: "FR",
        kind: "business",
        isWithholdingAgent: false,
        vatId: "FR12345678901",
      },
      lines: [
        {
          id: "l1",
          kind: "service",
          description: "Consulting",
          quantity: "20",
          unit: "hour",
          unitPrice: "90",
        },
      ],
    });
    const computation = computeInvoice(genericPack, examples.euReverseCharge, euInput);
    const formatted = formatComputation(computation, genericPack, "en");
    expect(formatted.totals.total).toBe("€1,800.00");
    expect(formatted.legalNotes).toEqual([
      { id: "generic.note.reverse-charge", text: "Reverse charge" },
    ]);
    // The same invoice, with the reverse charge suppressed for this one invoice:
    const skipped = computeInvoice(genericPack, examples.euReverseCharge, {
      ...euInput,
      options: { reverseCharge: "skip" },
    });
    expect(formatComputation(skipped, genericPack, "en").totals.total).toBe("€2,142.00");
  });
});
