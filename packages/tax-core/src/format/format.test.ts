import { describe, expect, it } from "vitest";
import { computeInvoice } from "../engine/compute";
import { parseInvoiceInput } from "../input/json";
import { testPack } from "../testing/test-pack";
import { formatComputation } from "./computation";
import { formatTrace } from "./trace";

const normalize = (text: string | undefined): string | undefined =>
  text?.replace(/[\u00a0\u202f]/g, " ");

const computation = computeInvoice(
  testPack,
  {},
  parseInvoiceInput({
    issueDate: "2023-06-01",
    currency: "EUR",
    client: { country: "IT", kind: "business", isWithholdingAgent: true },
    lines: [
      {
        id: "l1",
        kind: "service",
        description: "Design",
        quantity: "10",
        unit: "hour",
        unitPrice: "100",
      },
      {
        id: "l2",
        kind: "service",
        description: "Training",
        quantity: "1",
        unit: "item",
        unitPrice: "60",
        treatment: { kind: "exempt" },
      },
    ],
  }),
);

describe("formatTrace", () => {
  it("formats every step in English with rule titles, formulas and amounts", () => {
    const steps = formatTrace(computation, testPack, "en").map((step) => ({
      ...step,
      text: normalize(step.text),
      formula: normalize(step.formula),
      amount: normalize(step.amount),
    }));
    expect(
      steps.map((step) => [
        step.step,
        step.ruleId,
        step.ruleTitle,
        step.text,
        step.formula,
        step.amount,
      ]),
    ).toEqual([
      [1, "core", undefined, "Design: 10 × €100.00 = €1,000.00", undefined, "€1,000.00"],
      [2, "core", undefined, "Training: 1 × €60.00 = €60.00", undefined, "€60.00"],
      [3, "core", undefined, "Subtotal of the lines: €1,060.00", undefined, "€1,060.00"],
      [
        4,
        "xx.classify-lines",
        "Line classification",
        "2 lines classified into tax groups",
        undefined,
        undefined,
      ],
      [
        5,
        "xx.contribution",
        "Contribution",
        "Contribution of 10% on the fees",
        "10% × €1,060.00 = €106.00",
        "€106.00",
      ],
      [6, "xx.tax", "Tax", "Tax at 20% on Tax 20%", "20% × €1,100.00 = €220.00", "€220.00"],
      [
        7,
        "xx.withholding",
        "Withholding",
        "Withholding of 10% on the fees and the contribution",
        "10% × €1,166.00 = €116.60",
        "€116.60",
      ],
      [
        8,
        "xx.fixed-charge",
        "Fixed charge",
        "Fixed charge of €1.50: untaxed amounts of €66.00 exceed €50.00",
        undefined,
        "€1.50",
      ],
      [9, "core", undefined, "Document total: €1,387.50", undefined, "€1,387.50"],
      [10, "core", undefined, "Deducted from the amount payable: €116.60", undefined, "€116.60"],
      [11, "core", undefined, "Net amount payable: €1,270.90", undefined, "€1,270.90"],
    ]);
    expect(steps[4]?.sources.map((source) => source.id)).toEqual(["xx.contribution-act.art-3"]);
    expect("ruleTitle" in (steps[0] ?? {})).toBe(false);
  });

  it("formats in Italian and falls back from a region", () => {
    const steps = formatTrace(computation, testPack, "it-IT");
    expect(normalize(steps[4]?.text)).toBe("Contributo del 10% sui compensi");
    expect(normalize(steps[4]?.formula)).toBe("10% × 1060,00 € = 106,00 €");
    expect(normalize(steps[10]?.text)).toBe("Netto a pagare: 1270,90 €");
  });

  it("shows steps of rules that left the pack without a title", () => {
    const steps = formatTrace(computation, { ...testPack, rules: [] }, "en");
    expect(steps[4]?.ruleTitle).toBeUndefined();
    expect(steps[4]?.text).toBe("Contribution of 10% on the fees");
  });
});

describe("formatComputation", () => {
  it("formats components, the summary, totals, notes, warnings and the disclaimer", () => {
    const formatted = formatComputation(computation, testPack, "en");
    expect(formatted.locale).toBe("en");
    expect(
      formatted.components.map((component) => [
        component.id,
        component.label,
        normalize(component.amount),
        normalize(component.base),
        component.rate,
      ]),
    ).toEqual([
      ["xx.contribution", "Contribution 10%", "€106.00", "€1,060.00", "10%"],
      ["xx.tax", "Tax", "€220.00", "€1,100.00", "20%"],
      ["xx.withholding", "Withholding 10%", "€116.60", "€1,166.00", "10%"],
      ["xx.fixed-charge", "Fixed charge", "€1.50", "€66.00", undefined],
    ]);
    expect(
      formatted.vatSummary.map((entry) => [
        entry.groupId,
        entry.label,
        entry.reference,
        normalize(entry.base),
        normalize(entry.tax),
      ]),
    ).toEqual([
      ["vat-20", "Tax 20%", undefined, "€1,100.00", "€220.00"],
      ["exempt", "Exempt", "art. 10 of the Fictional Tax Act", "€66.00", "€0.00"],
      ["charge", "Fixed charge", undefined, "€1.50", "€0.00"],
    ]);
    expect(
      Object.fromEntries(
        Object.entries(formatted.totals).map(([key, value]) => [key, normalize(value)]),
      ),
    ).toEqual({
      subtotal: "€1,060.00",
      taxableBase: "€1,166.00",
      taxTotal: "€220.00",
      total: "€1,387.50",
      withholdingTotal: "€116.60",
      netPayable: "€1,270.90",
    });
    expect(formatted.legalNotes.map((note) => note.id)).toEqual([
      "xx.note.exempt",
      "xx.note.withholding",
      "xx.note.fixed-charge",
    ]);
    expect(formatted.legalNotes[0]?.text).toBe(
      "Exempt supply under art. 10 of the Fictional Tax Act.",
    );
    expect(formatted.disclaimer).toBe("Figures are informational: verify them with an accountant.");
  });

  it("prints legal notes in the pack's document locale", () => {
    const formatted = formatComputation(computation, testPack, "en");
    expect(formatted.documentLegalNotes[0]?.text).toBe(
      "Operazione esente ai sensi dell’art. 10 della Legge fiscale fittizia.",
    );
    expect(normalize(formatted.documentLegalNotes[1]?.text)).toBe(
      "Ritenuta di 116,60 € versata dal cliente all’erario.",
    );
    const withoutDocumentLocale = formatComputation(
      computation,
      { ...testPack, meta: { ...testPack.meta, documentLocale: undefined } as never },
      "en",
    );
    expect(withoutDocumentLocale.documentLegalNotes).toEqual(withoutDocumentLocale.legalNotes);
  });

  it("formats warnings", () => {
    const absorbed = computeInvoice(
      testPack,
      { fixedCharge: "absorb" },
      parseInvoiceInput({
        issueDate: "2024-06-01",
        documentKind: "credit-note",
        currency: "EUR",
        client: { country: "IT", kind: "individual", isWithholdingAgent: false },
        lines: [
          {
            id: "l1",
            kind: "service",
            description: "Exempt",
            quantity: "1",
            unit: "item",
            unitPrice: "100",
            treatment: { kind: "exempt" },
          },
        ],
      }),
    );
    const formatted = formatComputation(absorbed, testPack, "it");
    expect(
      formatted.warnings.map((warning) => [
        warning.code,
        warning.severity,
        normalize(warning.text),
      ]),
    ).toEqual([
      [
        "xx.credit-note",
        "info",
        "Nota di credito: importi positivi, il tipo di documento indica il verso.",
      ],
      ["xx.fixed-charge.absorbed", "info", "Il diritto fisso di 2,00 € è a carico del fornitore"],
    ]);
  });
});
