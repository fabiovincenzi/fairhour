/** Builders shared by the unit tests: compact invoices, computation and message formatting. */
import { toDecimalString, type Money } from "@fairhour/money";
import {
  computeInvoice,
  coreMessages,
  formatMessage,
  mergeCatalogs,
  parseInvoiceInput,
  type InvoiceComputation,
  type InvoiceInput,
  type InvoiceInputJson,
  type MessageRef,
} from "@fairhour/tax-core";
import { genericPack, type GenericConfigInput } from "../src/index";

export type LineJson = InvoiceInputJson["lines"][number];
export type TreatmentJson = NonNullable<LineJson["treatment"]>;
export type ClientJson = InvoiceInputJson["client"];

let counter = 0;

/** A service line of quantity 1 at `unitPrice` (or another kind with `extra`). */
export function line(
  unitPrice: string,
  treatment?: TreatmentJson,
  extra: Partial<LineJson> = {},
): LineJson {
  counter += 1;
  const id = extra.id ?? `l${counter}`;
  return {
    id,
    kind: "service",
    description: `Line ${id}`,
    quantity: "1",
    unit: "item",
    unitPrice,
    ...(treatment === undefined ? {} : { treatment }),
    ...extra,
  };
}

export const CLIENTS = {
  gbBusiness: { country: "GB", kind: "business", isWithholdingAgent: false, vatId: "GB123456789" },
  frBusiness: { country: "FR", kind: "business", isWithholdingAgent: false, vatId: "FR1234567" },
  frBusinessNoVatId: { country: "FR", kind: "business", isWithholdingAgent: false },
  deBusiness: { country: "DE", kind: "business", isWithholdingAgent: false, vatId: "DE123456789" },
  frIndividual: { country: "FR", kind: "individual", isWithholdingAgent: false },
  frAdministration: { country: "FR", kind: "public-administration", isWithholdingAgent: false },
  agent: { country: "IT", kind: "business", isWithholdingAgent: true, vatId: "01234567890" },
  agentIndividual: { country: "IT", kind: "individual", isWithholdingAgent: true },
} as const satisfies Record<string, ClientJson>;

/** An invoice of `lines` (ids made unique per call) in GBP to a UK business, unless overridden. */
export function invoice(
  lines: readonly LineJson[],
  overrides: Partial<InvoiceInputJson> = {},
): InvoiceInput {
  return parseInvoiceInput({
    issueDate: "2026-03-15",
    currency: "GBP",
    client: CLIENTS.gbBusiness,
    lines,
    ...overrides,
  });
}

export function compute(
  config: GenericConfigInput,
  lines: readonly LineJson[],
  overrides: Partial<InvoiceInputJson> = {},
): InvoiceComputation {
  return computeInvoice(genericPack, config, invoice(lines, overrides));
}

export const catalogs = mergeCatalogs(coreMessages, genericPack.messages);

export function format(ref: MessageRef, locale = "en"): string {
  return formatMessage(ref, catalogs, locale);
}

/** An amount as written in fixtures: "1200.00", "6250" (JPY), "6.185" (KWD). */
export function amount(value: Money): string {
  return toDecimalString(value);
}

/** The message keys of the trace steps produced by `ruleId`, in order. */
export function traceKeys(c: InvoiceComputation, ruleId: string): readonly string[] {
  return c.trace.filter((step) => step.ruleId === ruleId).map((step) => step.message.key);
}

export const VAT20: GenericConfigInput = { taxLabel: "VAT", tax: { kind: "rate", rate: "20" } };
export const NO_TAX: GenericConfigInput = { tax: { kind: "none" } };
