/**
 * The examples of README.md, executed. Keep the two in sync: if this test changes, update the
 * README (and the other way round). TEMPLATE: rewrite both for your pack's quick start.
 */
import { computeInvoice, formatTrace, parseInvoiceInput } from "@fairhour/tax-core";
import { describe, expect, it } from "vitest";
import { configSchema, xxPack } from "./index";

const input = parseInvoiceInput({
  issueDate: "2026-03-16",
  currency: "EUR",
  client: { country: "DE", kind: "business", isWithholdingAgent: true, vatId: "DE123456789" },
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

describe("README examples", () => {
  it("quick start: computes and explains an invoice", () => {
    const computation = computeInvoice(xxPack, {}, input);
    expect(computation.total).toEqual({ amount: 122600n, currency: "EUR" });
    expect(computation.netPayable).toEqual({ amount: 107600n, currency: "EUR" });

    const lines = formatTrace(computation, xxPack, "en").map(
      (step) => `${String(step.step)}. ${step.text}${step.formula ? ` (${step.formula})` : ""}`,
    );
    expect(lines).toEqual([
      "1. Design: 12.5 × €80.00 = €1,000.00",
      "2. Courier: 1 × €16.00 = €16.00",
      "3. Subtotal of the lines: €1,016.00",
      "4. Lines classified into tax groups: 2",
      "5. VAT at 21% on the taxable amount (21% × €1,000.00 = €210.00)",
      "6. Withholding tax: 15% of the fees before VAT (15% × €1,000.00 = €150.00)",
      "7. Document total: €1,226.00",
      "8. Deducted from the amount payable: €150.00",
      "9. Net amount payable: €1,076.00",
    ]);
  });

  it("the configuration with every default filled in", () => {
    expect(configSchema.parse({})).toEqual({
      vatRegistered: true,
      defaultVatRate: "standard",
      withholding: { enabled: true, rate: "standard" },
    });
  });
});
