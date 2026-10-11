/**
 * Conformance options of the Italian pack: valid and invalid configurations for both regimes,
 * sample inputs and per-invoice options. Shared by the conformance suite and the pack's own
 * property tests.
 */
import type { InvoiceInputJson } from "@fairhour/tax-core";

export const validConfigs: readonly unknown[] = [
  { regime: "forfettario", socialSecurity: { kind: "none" } },
  {
    regime: "forfettario",
    socialSecurity: { kind: "inps-gestione-separata" },
    stampDuty: { charge: "absorbed" },
    noWithholdingNote: "always",
  },
  {
    regime: "forfettario",
    socialSecurity: { kind: "cassa", preset: "cassa-forense" },
    generalExpenses: {},
    noWithholdingNote: "never",
    wording: {
      vat: "Operazione in franchigia da IVA ai sensi della L. 190/2014.",
      noWithholding: "Compenso non soggetto a ritenuta ai sensi della L. 190/2014, art. 1, c. 67.",
    },
    revenueTracker: { warningRatio: "90" },
  },
  { regime: "ordinario", socialSecurity: { kind: "inps-gestione-separata", rivalsa: true } },
  {
    regime: "ordinario",
    socialSecurity: { kind: "cassa", preset: "cassa-forense" },
    generalExpenses: { rate: "15" },
  },
  {
    regime: "ordinario",
    socialSecurity: { kind: "none" },
    withholding: { enabled: false },
    stampDuty: { charge: "absorbed" },
  },
  {
    regime: "ordinario",
    socialSecurity: {
      kind: "cassa",
      preset: "custom",
      rate: "3.5",
      tipoCassa: "TC09",
      name: "ENPAM",
    },
    withholding: { rate: "23", baseShare: "50", tipoRitenuta: "RT02", causalePagamento: "R" },
    splitPayment: "never",
  },
  { regime: "ordinario", socialSecurity: { kind: "cassa", preset: "eppi" } },
  {
    regime: "ordinario",
    socialSecurity: { kind: "inps-gestione-separata", rivalsa: false },
  },
];

export const invalidConfigs: readonly { readonly config: unknown; readonly reason: string }[] = [
  { config: null, reason: "not an object" },
  { config: {}, reason: "the regime is required" },
  { config: { regime: "forfettario" }, reason: "the social-security scheme is required" },
  {
    config: { regime: "minimi", socialSecurity: { kind: "none" } },
    reason: "unknown regime",
  },
  {
    config: {
      regime: "ordinario",
      socialSecurity: { kind: "inps-gestione-separata", rate: "5" },
    },
    reason: "the INPS rivalsa cannot exceed 4 %",
  },
  {
    config: { regime: "ordinario", socialSecurity: { kind: "cassa", preset: "custom" } },
    reason: "a custom fund needs rate, tipoCassa and name",
  },
  {
    config: {
      regime: "ordinario",
      socialSecurity: { kind: "cassa", preset: "custom", rate: "4", tipoCassa: "TC22", name: "X" },
    },
    reason: "TC22 is the INPS code, not a fund's",
  },
  {
    config: { regime: "ordinario", socialSecurity: { kind: "cassa", preset: "unknown-fund" } },
    reason: "unknown preset",
  },
  {
    config: {
      regime: "forfettario",
      socialSecurity: { kind: "none" },
      withholding: { enabled: true },
    },
    reason: "forfettario has no withholding settings (strict object)",
  },
  {
    config: {
      regime: "ordinario",
      socialSecurity: { kind: "none" },
      withholding: { rate: "4.12345" },
    },
    reason: "percent with more than 4 decimals",
  },
  {
    config: {
      regime: "ordinario",
      socialSecurity: { kind: "none" },
      withholding: { baseShare: "0" },
    },
    reason: "the base share must be greater than 0",
  },
  {
    config: {
      regime: "ordinario",
      socialSecurity: { kind: "none" },
      withholding: { causalePagamento: "a" },
    },
    reason: "CausalePagamento is upper case",
  },
  {
    config: {
      regime: "forfettario",
      socialSecurity: { kind: "none" },
      revenueTracker: { warningRatio: "0" },
    },
    reason: "the warning ratio must be greater than 0",
  },
  {
    config: { regime: "forfettario", socialSecurity: { kind: "none" }, wording: { vat: "short" } },
    reason: "custom wording needs at least 10 characters",
  },
  {
    config: { regime: "ordinario", socialSecurity: { kind: "none" }, splitPayment: "always" },
    reason: "unknown split payment mode",
  },
  {
    config: {
      regime: "forfettario",
      socialSecurity: { kind: "none" },
      generalExpenses: { rate: "101" },
    },
    reason: "percent above 100",
  },
];

const fees = {
  id: "l1",
  kind: "service",
  description: "Consulting",
  quantity: "20",
  unit: "hour",
  unitPrice: "50",
} as const;

const courtFee = {
  id: "l2",
  kind: "reimbursement",
  description: "Court fee paid in the client's name",
  quantity: "1",
  unit: "item",
  unitPrice: "100",
} as const;

export const sampleInputs: readonly InvoiceInputJson[] = [
  {
    issueDate: "2026-03-15",
    currency: "EUR",
    client: { country: "IT", kind: "business", isWithholdingAgent: true, vatId: "01234567890" },
    lines: [fees, courtFee],
  },
  {
    issueDate: "2024-11-30",
    currency: "EUR",
    client: { country: "IT", kind: "individual", isWithholdingAgent: false },
    lines: [
      { ...fees, treatment: { kind: "exempt", reference: "art. 10, n. 18" } },
      {
        id: "l2",
        kind: "goods",
        description: "Book",
        quantity: "2",
        unit: "item",
        unitPrice: "19.90",
      },
    ],
  },
  {
    issueDate: "2026-07-01",
    currency: "EUR",
    client: { country: "IT", kind: "public-administration", isWithholdingAgent: true },
    lines: [fees],
  },
  {
    issueDate: "2020-02-29",
    documentKind: "credit-note",
    currency: "EUR",
    client: { country: "GB", kind: "business", isWithholdingAgent: false, vatId: "GB123456789" },
    lines: [fees, { ...courtFee, id: "l3" }],
  },
  {
    issueDate: "2023-01-01",
    currency: "EUR",
    client: { country: "IT", kind: "business", isWithholdingAgent: true },
    lines: [{ ...fees, treatment: { kind: "rate", rate: "10" } }],
  },
  {
    issueDate: "2025-05-05",
    currency: "EUR",
    client: { country: "US", kind: "business", isWithholdingAgent: false },
    lines: [],
  },
];

export const invoiceOptions: readonly unknown[] = [
  {},
  { stampDuty: "absorb" },
  { stampDuty: "charge" },
  { stampDuty: "not-due" },
  { splitPayment: "skip" },
  { splitPayment: "apply" },
];
