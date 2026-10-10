/**
 * Inputs of the shared conformance suite (src/conformance.test.ts): valid configurations that
 * cover every option, configurations the schema must reject, and sample invoices.
 */
import type { InvoiceInputJson } from "@fairhour/tax-core";
import type { GenericConfigInput } from "../src/index";

const longText = (length: number): string => "x".repeat(length);

/** Every option of section 1, every rounding mode and both tax scopes appear at least once. */
export const validConfigs: readonly GenericConfigInput[] = [
  // Defaults: label "VAT", reverse charge off, halfUp, per-document.
  { tax: { kind: "rate", rate: "20" } },
  { taxLabel: "GST", tax: { kind: "rate", rate: "10" }, rounding: { taxScope: "per-line" } },
  {
    taxLabel: "Sales tax",
    tax: { kind: "rate", rate: "8.875" },
    rounding: { mode: "halfEven", taxScope: "per-document" },
  },
  {
    taxLabel: "MwSt",
    tax: { kind: "rate", rate: "19", allowedLineRates: ["7", "0"] },
    exemptNote: "Steuerfreie Leistung",
    reverseCharge: {
      mode: "foreign-business-clients",
      supplierCountry: "DE",
      note: "Steuerschuldnerschaft des Leistungsempfängers",
    },
    withholding: { label: "Withholding tax", rate: "15", appliesTo: "withholding-agents" },
    rounding: { mode: "up", taxScope: "per-line" },
    documentNote: "Registered in Germany, VAT ID DE123456789",
  },
  {
    taxLabel: "VAT",
    tax: { kind: "none", note: "VAT not applicable" },
    withholding: { label: "IRPF", rate: "15", appliesTo: "business-clients" },
    rounding: { mode: "halfDown" },
    documentNote: "Thank you for your business.",
  },
  { tax: { kind: "none" }, rounding: { mode: "down" } },
  {
    taxLabel: "IVA",
    tax: { kind: "rate", rate: "21" },
    reverseCharge: { mode: "foreign-business-clients", supplierCountry: "ES" },
    withholding: { rate: "7" },
    rounding: { mode: "ceiling", taxScope: "per-line" },
  },
  { taxLabel: "Tax", tax: { kind: "rate", rate: "0" }, rounding: { mode: "floor" } },
  { tax: { kind: "rate", rate: "100", allowedLineRates: [] }, withholding: { rate: "100" } },
];

export const invalidConfigs: readonly { readonly config: unknown; readonly reason: string }[] = [
  { config: {}, reason: "tax is required" },
  { config: { tax: { kind: "rate" } }, reason: "a rate tax needs a rate" },
  { config: { tax: { kind: "rate", rate: 20 } }, reason: "a rate is a decimal string" },
  { config: { tax: { kind: "rate", rate: "100.01" } }, reason: "a rate is at most 100" },
  { config: { tax: { kind: "rate", rate: "-1" } }, reason: "a rate is not negative" },
  { config: { tax: { kind: "rate", rate: "8.87501" } }, reason: "at most 4 decimals" },
  { config: { tax: { kind: "rate", rate: "020" } }, reason: "no leading zeros" },
  { config: { tax: { kind: "rate", rate: "20%" } }, reason: "no percent sign" },
  { config: { tax: { kind: "sales", rate: "20" } }, reason: "unknown tax kind" },
  {
    config: { tax: { kind: "rate", rate: "20", allowedLineRates: ["5", "5.5", "abc"] } },
    reason: "allowed rates are percents",
  },
  {
    config: {
      tax: {
        kind: "rate",
        rate: "20",
        allowedLineRates: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"],
      },
    },
    reason: "at most 10 allowed rates",
  },
  { config: { tax: { kind: "none", rate: "20" } }, reason: "no rate without tax" },
  { config: { tax: { kind: "none", note: "" } }, reason: "an empty note" },
  { config: { tax: { kind: "none", note: longText(501) } }, reason: "a note over 500 characters" },
  { config: { taxLabel: "", tax: { kind: "rate", rate: "20" } }, reason: "an empty label" },
  { config: { taxLabel: "   ", tax: { kind: "rate", rate: "20" } }, reason: "a blank label" },
  {
    config: { taxLabel: longText(33), tax: { kind: "rate", rate: "20" } },
    reason: "a label over 32 characters",
  },
  {
    config: {
      tax: { kind: "rate", rate: "20" },
      reverseCharge: { mode: "foreign-business-clients" },
    },
    reason: "the reverse charge needs the supplier's country",
  },
  {
    config: {
      tax: { kind: "rate", rate: "20" },
      reverseCharge: { mode: "foreign-business-clients", supplierCountry: "de" },
    },
    reason: "country codes are upper case",
  },
  {
    config: {
      tax: { kind: "rate", rate: "20" },
      reverseCharge: { mode: "foreign-business-clients", supplierCountry: "XX" },
    },
    reason: "country codes are assigned ISO 3166-1 codes",
  },
  {
    config: { tax: { kind: "rate", rate: "20" }, reverseCharge: { mode: "always" } },
    reason: "unknown reverse-charge mode",
  },
  {
    config: { tax: { kind: "rate", rate: "20" }, reverseCharge: { note: "" } },
    reason: "an empty reverse-charge note",
  },
  {
    config: { tax: { kind: "rate", rate: "20" }, withholding: { label: "IRPF" } },
    reason: "a withholding needs a rate",
  },
  {
    config: { tax: { kind: "rate", rate: "20" }, withholding: { rate: "15", label: longText(41) } },
    reason: "a withholding label over 40 characters",
  },
  {
    config: {
      tax: { kind: "rate", rate: "20" },
      withholding: { rate: "15", appliesTo: "everyone" },
    },
    reason: "unknown withholding scope",
  },
  {
    config: { tax: { kind: "rate", rate: "20" }, rounding: { mode: "bankers" } },
    reason: "unknown rounding mode",
  },
  {
    config: { tax: { kind: "rate", rate: "20" }, rounding: { taxScope: "per-group" } },
    reason: "the pack's scopes are per-document and per-line",
  },
  { config: { tax: { kind: "rate", rate: "20" }, exemptNote: "" }, reason: "an empty exempt note" },
  {
    config: { tax: { kind: "rate", rate: "20" }, documentNote: longText(1001) },
    reason: "a document note over 1000 characters",
  },
  { config: { tax: { kind: "rate", rate: "20" }, vatRate: "20" }, reason: "unknown keys" },
  { config: "VAT 20%", reason: "not an object" },
];

const service = (
  id: string,
  quantity: string,
  unitPrice: string,
): InvoiceInputJson["lines"][number] => ({
  id,
  kind: "service",
  description: `Service ${id}`,
  quantity,
  unit: "hour",
  unitPrice,
});

/** Every client kind, every treatment, a credit note and an empty draft. */
export const sampleInputs: readonly InvoiceInputJson[] = [
  {
    issueDate: "2026-03-15",
    currency: "GBP",
    client: { country: "GB", kind: "business", isWithholdingAgent: false, vatId: "GB123456789" },
    lines: [service("l1", "12.5", "80")],
  },
  {
    issueDate: "2026-03-15",
    currency: "EUR",
    client: { country: "FR", kind: "business", isWithholdingAgent: true, vatId: "FR12345678901" },
    lines: [
      service("l1", "20", "90"),
      { ...service("l2", "1", "200"), treatment: { kind: "exempt" } },
      { ...service("l3", "1", "50"), treatment: { kind: "out-of-scope", reference: "art. 44" } },
      { ...service("l4", "1", "40"), kind: "reimbursement", unit: "item" },
    ],
  },
  {
    issueDate: "2026-03-15",
    currency: "USD",
    client: { country: "US", kind: "individual", isWithholdingAgent: false },
    lines: [
      service("l1", "12", "101"),
      { ...service("l2", "1", "10"), treatment: { kind: "rate", rate: "0" } },
    ],
  },
  {
    issueDate: "2026-03-15",
    documentKind: "credit-note",
    currency: "JPY",
    client: { country: "JP", kind: "public-administration", isWithholdingAgent: true },
    lines: [service("l1", "7.5", "8333")],
  },
  {
    issueDate: "2026-03-15",
    currency: "KWD",
    client: { country: "KW", kind: "business", isWithholdingAgent: false },
    lines: [service("l1", "2.5", "49.483")],
  },
  {
    issueDate: "2026-03-15",
    currency: "AUD",
    client: { country: "AU", kind: "business", isWithholdingAgent: false },
    lines: [],
  },
];

export const invoiceOptions: readonly unknown[] = [
  {},
  { reverseCharge: "auto" },
  { reverseCharge: "apply" },
  { reverseCharge: "skip" },
];
