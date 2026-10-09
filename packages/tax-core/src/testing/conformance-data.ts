import type { InvoiceInputJson } from "../input/types";

/** Conformance options of the internal test pack (shared by the suite and the suite's tests). */
export const validConfigs: readonly unknown[] = [
  {},
  { taxScope: "per-line" },
  { fixedCharge: "absorb", contribution: false },
  { rounding: "halfEven", taxScope: "per-line" },
  { rounding: "down" },
];

export const invalidConfigs: readonly { readonly config: unknown; readonly reason: string }[] = [
  { config: { taxScope: "per-invoice" }, reason: "unknown tax scope" },
  { config: { contribution: "yes" }, reason: "contribution is a boolean" },
  { config: { unknown: true }, reason: "unknown keys are rejected" },
  { config: null, reason: "not an object" },
];

export const sampleInputs: readonly InvoiceInputJson[] = [
  {
    issueDate: "2023-05-10",
    currency: "EUR",
    client: { country: "IT", kind: "business", isWithholdingAgent: true },
    lines: [
      {
        id: "l1",
        kind: "service",
        description: "Consulting",
        quantity: "10",
        unit: "hour",
        unitPrice: "100",
      },
      {
        id: "l2",
        kind: "reimbursement",
        description: "Fee paid",
        quantity: "1",
        unit: "item",
        unitPrice: "16",
      },
    ],
  },
  {
    issueDate: "2024-06-01",
    documentKind: "credit-note",
    currency: "USD",
    client: { country: "US", kind: "individual", isWithholdingAgent: false },
    lines: [
      {
        id: "l1",
        kind: "service",
        description: "Workshop",
        quantity: "1",
        unit: "day",
        unitPrice: "800",
        treatment: { kind: "exempt", reference: "art. 10" },
      },
    ],
    options: { skipWithholding: true },
  },
  {
    issueDate: "2025-01-10",
    currency: "GBP",
    client: { country: "GB", kind: "business", isWithholdingAgent: false },
    lines: [],
  },
];

export const invoiceOptions: readonly unknown[] = [{}, { skipWithholding: true }];
