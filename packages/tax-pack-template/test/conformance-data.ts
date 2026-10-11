/**
 * Inputs of the shared conformance suite (src/conformance.test.ts). The suite computes every
 * sample with every valid configuration, and generates hundreds of random invoices from the valid
 * configurations: cover every regime and option here.
 */
import type { InvoiceInputJson } from "@fairhour/tax-core";
import type { XxConfigInput } from "../src/index";

// TEMPLATE: list a valid configuration per regime and per option value, the mistakes users and
// stored settings can make (each with the reason it must fail), and realistic sample invoices.

/** Every option and every value appears at least once. */
export const validConfigs: readonly XxConfigInput[] = [
  // Defaults: VAT-registered, standard rate, withholding enabled at the standard rate.
  {},
  { defaultVatRate: "reduced", withholding: { rate: "new-business" } },
  { vatRegistered: true, defaultVatRate: "standard", withholding: { enabled: false } },
  { vatRegistered: false },
  {
    vatRegistered: false,
    smallBusinessNote: "Small business: VAT not charged (art. 30 VAT Act).",
    withholding: { enabled: true, rate: "standard" },
  },
];

export const invalidConfigs: readonly { readonly config: unknown; readonly reason: string }[] = [
  { config: { vatRegistered: "yes" }, reason: "vatRegistered is a boolean" },
  { config: { defaultVatRate: "super-reduced" }, reason: "unknown VAT rate name" },
  { config: { defaultVatRate: "21" }, reason: "rates are named, never numbers" },
  { config: { smallBusinessNote: "" }, reason: "an empty note" },
  { config: { smallBusinessNote: "   " }, reason: "a blank note" },
  { config: { smallBusinessNote: "x".repeat(501) }, reason: "a note over 500 characters" },
  { config: { withholding: { rate: "15" } }, reason: "unknown withholding rate name" },
  { config: { withholding: { enabled: "no" } }, reason: "enabled is a boolean" },
  { config: { withholding: { enabled: true, base: "fees" } }, reason: "unknown withholding key" },
  { config: { vatRate: "21" }, reason: "unknown key" },
  { config: "registered", reason: "not an object" },
  { config: null, reason: "null" },
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

/** Every client kind and line treatment, a credit note, three currencies and an empty draft. */
export const sampleInputs: readonly InvoiceInputJson[] = [
  {
    issueDate: "2026-03-16",
    currency: "EUR",
    client: { country: "FR", kind: "business", isWithholdingAgent: false, vatId: "FR12345678901" },
    lines: [service("l1", "12.5", "80")],
  },
  {
    issueDate: "2025-06-16",
    currency: "EUR",
    client: { country: "DE", kind: "business", isWithholdingAgent: true, vatId: "DE123456789" },
    lines: [
      service("l1", "20", "90"),
      { ...service("l2", "1", "200"), treatment: { kind: "exempt" } },
      { ...service("l3", "1", "50"), treatment: { kind: "out-of-scope", reference: "art. 7" } },
      { ...service("l4", "1", "40"), kind: "reimbursement", unit: "item" },
      { ...service("l5", "3", "12.5"), kind: "goods", unit: "item" },
    ],
  },
  {
    issueDate: "2026-03-16",
    documentKind: "credit-note",
    currency: "USD",
    client: { country: "US", kind: "individual", isWithholdingAgent: false },
    lines: [
      service("l1", "2", "101"),
      { ...service("l2", "1", "10"), treatment: { kind: "rate", rate: "10" } },
    ],
  },
  {
    issueDate: "2027-01-15",
    currency: "JPY",
    client: { country: "JP", kind: "public-administration", isWithholdingAgent: true },
    lines: [service("l1", "7.5", "8333")],
  },
  {
    issueDate: "2026-03-16",
    currency: "EUR",
    client: { country: "IT", kind: "business", isWithholdingAgent: false },
    lines: [],
  },
];

export const invoiceOptions: readonly unknown[] = [
  {},
  { withholding: "auto" },
  { withholding: "skip" },
];
