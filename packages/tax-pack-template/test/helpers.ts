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
import { xxPack, type XxConfigInput } from "../src/index";

export type LineJson = InvoiceInputJson["lines"][number];
export type TreatmentJson = NonNullable<LineJson["treatment"]>;
export type ClientJson = InvoiceInputJson["client"];
/** A line without its id: `invoice` numbers the lines l1, l2, ... */
export type LineSpec = Omit<LineJson, "id"> & { readonly id?: string };

/** A service line of quantity 1 at `unitPrice`, with an optional treatment and overrides. */
export function line(
  unitPrice: string,
  treatment?: TreatmentJson,
  extra: Partial<LineJson> = {},
): LineSpec {
  return {
    kind: "service",
    description: "Consulting",
    quantity: "1",
    unit: "item",
    unitPrice,
    ...(treatment === undefined ? {} : { treatment }),
    ...extra,
  };
}

// TEMPLATE: the clients and the default invoice that matter to your rules: domestic and foreign,
// business and private, withholding agents or not; your country's currency and a date inside your
// parameter timeline.
export const CLIENTS = {
  business: { country: "FR", kind: "business", isWithholdingAgent: false, vatId: "FR12345678901" },
  agent: { country: "DE", kind: "business", isWithholdingAgent: true, vatId: "DE123456789" },
  individual: { country: "IT", kind: "individual", isWithholdingAgent: false },
} as const satisfies Record<string, ClientJson>;

/** An invoice of `lines` in EUR, dated 2026-03-16, to a business that does not withhold. */
export function invoice(
  lines: readonly LineSpec[],
  overrides: Partial<InvoiceInputJson> = {},
): InvoiceInput {
  return parseInvoiceInput({
    issueDate: "2026-03-16",
    currency: "EUR",
    client: CLIENTS.business,
    lines: lines.map((item, index) => ({ id: `l${index + 1}`, ...item })),
    ...overrides,
  });
}

export function compute(
  config: XxConfigInput,
  lines: readonly LineSpec[],
  overrides: Partial<InvoiceInputJson> = {},
): InvoiceComputation {
  return computeInvoice(xxPack, config, invoice(lines, overrides));
}

export const catalogs = mergeCatalogs(coreMessages, xxPack.messages);

export function format(ref: MessageRef, locale = "en"): string {
  return formatMessage(ref, catalogs, locale);
}

/** An amount as written in fixtures: "1210.00" (EUR), "6250" (JPY). */
export function amount(value: Money): string {
  return toDecimalString(value);
}

/** The message keys of the trace steps produced by `ruleId`, in order. */
export function traceKeys(c: InvoiceComputation, ruleId: string): readonly string[] {
  return c.trace.filter((step) => step.ruleId === ruleId).map((step) => step.message.key);
}
