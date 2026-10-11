/**
 * The examples of README.md, executed. Keep the two in sync: if this test changes, update the
 * README (and the other way round).
 */
import { parseMoney } from "@fairhour/money";
import {
  computeInvoice,
  coreMessages,
  formatComputation,
  formatMessage,
  formatTrace,
  isoDate,
  mergeCatalogs,
  parseInvoiceInput,
} from "@fairhour/tax-core";
import { describe, expect, it } from "vitest";
import { plainSpaces } from "../test/helpers";
import {
  configSchema,
  countableRevenue,
  evaluateRevenue,
  itMessages,
  itPack,
  type ItConfigInput,
} from "./index";

// --- README: quick start ------------------------------------------------------------------------

const config: ItConfigInput = {
  regime: "ordinario",
  socialSecurity: { kind: "inps-gestione-separata", rivalsa: true },
};

const input = parseInvoiceInput({
  issueDate: "2026-03-15",
  currency: "EUR",
  client: { country: "IT", kind: "business", isWithholdingAgent: true, vatId: "01234567890" },
  lines: [
    {
      id: "l1",
      kind: "service",
      description: "UX design",
      quantity: "20",
      unit: "hour",
      unitPrice: "50",
    },
  ],
});

const flatRate: ItConfigInput = {
  regime: "forfettario",
  socialSecurity: { kind: "inps-gestione-separata", rivalsa: true },
  stampDuty: { charge: "client" },
};

// --- README: configuration examples --------------------------------------------------------------

const examples: Record<string, ItConfigInput> = {
  forfettarioNoContribution: { regime: "forfettario", socialSecurity: { kind: "none" } },
  forfettarioAbsorbedStampDuty: {
    regime: "forfettario",
    socialSecurity: { kind: "inps-gestione-separata" },
    stampDuty: { charge: "absorbed" },
    noWithholdingNote: "always",
    revenueTracker: { warningRatio: "90" },
  },
  lawyer: {
    regime: "ordinario",
    socialSecurity: { kind: "cassa", preset: "cassa-forense" },
    generalExpenses: {},
  },
  engineer: { regime: "ordinario", socialSecurity: { kind: "cassa", preset: "inarcassa" } },
  otherFund: {
    regime: "ordinario",
    socialSecurity: {
      kind: "cassa",
      preset: "custom",
      rate: "2",
      tipoCassa: "TC09",
      name: "ENPAM",
    },
  },
  commercialAgent: {
    regime: "ordinario",
    socialSecurity: { kind: "none" },
    withholding: { rate: "23", baseShare: "50" },
  },
  noWithholding: {
    regime: "ordinario",
    socialSecurity: { kind: "none" },
    withholding: { enabled: false },
  },
};

const trace = (computation: ReturnType<typeof computeInvoice>, locale: "en" | "it") =>
  formatTrace(computation, itPack, locale).map((step) =>
    plainSpaces(`${step.step}. ${step.text}${step.formula ? ` (${step.formula})` : ""}`),
  );

describe("README examples", () => {
  it("quick start: an ordinario invoice with INPS rivalsa, VAT and withholding", () => {
    const computation = computeInvoice(itPack, config, input);
    expect(computation.total).toEqual(parseMoney("1268.80", "EUR"));
    expect(computation.withholdingTotal).toEqual(parseMoney("208.00", "EUR"));
    expect(computation.netPayable).toEqual(parseMoney("1060.80", "EUR"));
    expect(trace(computation, "en")).toEqual([
      "1. UX design: 20 × €50.00 = €1,000.00",
      "2. Subtotal of the lines: €1,000.00",
      "3. VAT 22%: €1,000.00 (subject to VAT at 22%)",
      "4. INPS rivalsa of 4% on the fees (4% × €1,000.00 = €40.00)",
      "5. VAT at 22% on the taxable amount (22% × €1,040.00 = €228.80)",
      "6. Amount subject to withholding: fees, general expenses and INPS rivalsa (the fund contribution, VAT, disbursements, goods and stamp duty are excluded) (€1,000.00 + €0.00 + €40.00 = €1,040.00)",
      "7. Withholding tax of 20%, retained by the client and paid to the State (20% × €1,040.00 = €208.00)",
      "8. No stamp duty: the amount not subject to VAT, €0.00, does not exceed €77.47 (€0.00 ≤ €77.47)",
      "9. Document total: €1,268.80",
      "10. Deducted from the amount payable: €208.00",
      "11. Net amount payable: €1,060.80",
    ]);
    const formatted = formatComputation(computation, itPack, "it");
    expect(formatted.components.map((row) => [row.label, plainSpaces(row.amount)])).toEqual([
      ["Rivalsa INPS 4%", "40,00 €"],
      ["IVA", "228,80 €"],
      ["Ritenuta d'acconto 20%", "208,00 €"],
    ]);
    const tc22 = computation.components.find((component) => component.id === "it.inps-rivalsa");
    expect(tc22?.exportCodes).toEqual({
      "fatturapa.TipoCassa": "TC22",
      "fatturapa.Ritenuta": "SI",
    });
  });

  it("forfettario: no VAT, the legal notes in Italian, stamp duty charged", () => {
    const computation = computeInvoice(itPack, flatRate, input);
    expect(computation.total).toEqual(parseMoney("1042.00", "EUR"));
    expect(computation.netPayable).toEqual(parseMoney("1042.00", "EUR"));
    const formatted = formatComputation(computation, itPack, "en");
    expect(formatted.documentLegalNotes.map((note) => note.text)).toEqual([
      "Operazione effettuata in regime forfettario ai sensi dell'articolo 1, commi da 54 a 89, della Legge n. 190/2014 e successive modificazioni.",
      "Si richiede la non applicazione della ritenuta alla fonte a titolo d'acconto ai sensi dell'articolo 1, comma 67, della Legge n. 190/2014.",
      "Imposta di bollo assolta in modo virtuale ai sensi dell'articolo 6 del DM 17 giugno 2014.",
    ]);
    expect(formatted.vatSummary.map((row) => [row.label, plainSpaces(row.base)])).toEqual([
      ["N2.2 – Not subject to VAT (flat-rate scheme)", "€1,042.00"],
    ]);
    expect(formatted.disclaimer).toBe(
      "Figures are informational and must be verified with your accountant before you issue an invoice.",
    );
    expect(countableRevenue(configSchema.parse(flatRate), computation)).toEqual(
      parseMoney("1042.00", "EUR"),
    );
  });

  it.each(Object.entries(examples))("configuration example %s is valid", (_name, example) => {
    expect(configSchema.safeParse(example).success).toBe(true);
  });

  it("revenue tracker: approaching the €85,000 ceiling", () => {
    const status = evaluateRevenue(configSchema.parse(flatRate), {
      year: 2026,
      currency: "EUR",
      receipts: [
        { date: isoDate("2026-02-10"), amount: parseMoney("30000.00", "EUR") },
        { date: isoDate("2026-06-30"), amount: parseMoney("40000.00", "EUR") },
      ],
      asOf: isoDate("2026-10-10"),
    });
    expect(status.status).toBe("approaching");
    const catalogs = mergeCatalogs(coreMessages, itMessages);
    expect(
      status.explanation.map((step) => plainSpaces(formatMessage(step.message, catalogs, "en"))),
    ).toEqual([
      "Fees collected in 2026 up to October 10, 2026: €70,000.00 (receipts: 2)",
      "€70,000.00 is 82.35% of the €85,000.00 ceiling, at or above the warning level of 80%",
      "€70,000.00 does not exceed the immediate exit limit of €100,000.00",
    ]);
    expect(status.warnings.map((warning) => warning.code)).toEqual([
      "it.forfettario.ceiling-approaching",
    ]);
  });
});
