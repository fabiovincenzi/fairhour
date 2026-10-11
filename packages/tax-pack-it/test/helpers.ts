/**
 * Test helpers: build invoice inputs in JSON form with sensible defaults, compute them with the
 * Italian pack and read the result as decimal strings.
 */
import { toDecimalString, zero, type Money } from "@fairhour/money";
import {
  computeInvoice,
  formatComputation,
  formatTrace,
  parseInvoiceInput,
  resolveParameters,
  validateInvoiceInput,
  type Component,
  type ComputationState,
  type InvoiceComputation,
  type InvoiceInputJson,
} from "@fairhour/tax-core";
import { configSchema } from "../src/config";
import { itPack } from "../src/index";
import { optionsSchema } from "../src/options";
import { parameters } from "../src/parameters";
import { roundingPolicy } from "../src/rounding";
import type { ItContext, ItFacts } from "../src/types";

type LineJson = InvoiceInputJson["lines"][number];
type ClientJson = InvoiceInputJson["client"];

export const IT_BUSINESS_AGENT: ClientJson = {
  country: "IT",
  kind: "business",
  isWithholdingAgent: true,
  vatId: "01234567890",
};
export const IT_PRIVATE: ClientJson = {
  country: "IT",
  kind: "individual",
  isWithholdingAgent: false,
};
export const IT_PA: ClientJson = {
  country: "IT",
  kind: "public-administration",
  isWithholdingAgent: true,
};

/** A line; `price` is the unit price, quantity 1 unless given. */
export function line(
  id: string,
  price: string,
  overrides: Partial<Omit<LineJson, "id" | "unitPrice">> = {},
): LineJson {
  return {
    id,
    kind: "service",
    description: `Line ${id}`,
    quantity: "1",
    unit: "lump-sum",
    unitPrice: price,
    ...overrides,
  };
}

/** €1,000.00 of fees: 20 hours at €50.00. */
export const FEES: LineJson = line("l1", "50", {
  quantity: "20",
  unit: "hour",
  description: "Consulting",
});

export function invoice(overrides: Partial<InvoiceInputJson> = {}): InvoiceInputJson {
  return {
    issueDate: "2026-03-15",
    currency: "EUR",
    client: IT_BUSINESS_AGENT,
    lines: [FEES],
    ...overrides,
  };
}

export function compute(
  config: unknown,
  overrides: Partial<InvoiceInputJson> = {},
): InvoiceComputation {
  return computeInvoice(itPack, config, parseInvoiceInput(invoice(overrides)));
}

export const FORFETTARIO = { regime: "forfettario", socialSecurity: { kind: "none" } } as const;
export const ORDINARIO = { regime: "ordinario", socialSecurity: { kind: "none" } } as const;
export const INPS = { kind: "inps-gestione-separata" } as const;

export const amount = (value: Money): string => toDecimalString(value);

export function findComponent(c: InvoiceComputation, id: string): Component | undefined {
  return c.components.find((component) => component.id === id);
}

/** The component, or a test failure. */
export function component(c: InvoiceComputation, id: string): Component {
  const found = findComponent(c, id);
  if (found === undefined) throw new Error(`component "${id}" is missing`);
  return found;
}

export const componentIds = (c: InvoiceComputation): readonly string[] =>
  c.components.map((item) => item.id);
export const noteIds = (c: InvoiceComputation): readonly string[] =>
  c.legalNotes.map((note) => note.id);
export const warningCodes = (c: InvoiceComputation): readonly string[] =>
  c.warnings.map((warning) => warning.code);
export const groupOfLine = (c: InvoiceComputation, lineId: string): string | undefined =>
  c.lines.find((item) => item.id === lineId)?.groupId;
export const summaryRows = (c: InvoiceComputation): readonly string[] =>
  c.vatSummary.map((entry) => `${entry.groupId} ${amount(entry.base)}/${amount(entry.tax)}`);

/** ICU versions differ in the space around currency symbols: compare with plain spaces. */
export const plainSpaces = (text: string): string => text.replace(/[\u00a0\u202f]/g, " ");

/** The trace steps of one rule, formatted in `locale`. */
export function ruleTrace(
  c: InvoiceComputation,
  ruleId: string,
  locale: "en" | "it" = "en",
): readonly string[] {
  return formatTrace(c, itPack, locale)
    .filter((step) => step.ruleId === ruleId)
    .map((step) =>
      plainSpaces(step.formula === undefined ? step.text : `${step.text} (${step.formula})`),
    );
}

/** The legal notes as printed on the document (Italian). */
export function documentNotes(c: InvoiceComputation): readonly string[] {
  return formatComputation(c, itPack, "en").documentLegalNotes.map((note) =>
    plainSpaces(note.text),
  );
}

/** A rule context as the engine builds it, for calling a rule's `apply` directly. */
export function ruleContext(config: unknown, overrides: Partial<InvoiceInputJson> = {}): ItContext {
  const input = validateInvoiceInput(parseInvoiceInput(invoice(overrides)));
  const parsed = configSchema.parse(config);
  const version = resolveParameters(parameters, "it", input.issueDate);
  return {
    input,
    config: parsed,
    options: optionsSchema.parse(input.options ?? {}),
    params: version.params,
    parameterVersion: { id: version.id, effectiveFrom: version.effectiveFrom },
    rounding: roundingPolicy(parsed),
    currency: input.currency,
    zero: zero(input.currency),
  };
}

/** The state before any rule ran, without lines. */
export const EMPTY_STATE: ComputationState<ItFacts> = {
  lines: [],
  groups: [],
  lineGroups: {},
  components: [],
  legalNotes: [],
  warnings: [],
  trace: [],
  facts: { withholdingApplied: false },
};
