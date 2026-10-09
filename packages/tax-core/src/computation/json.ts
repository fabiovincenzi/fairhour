import {
  decimal,
  decimalToString,
  isCurrencyCode,
  parseMoney,
  price,
  toDecimalString,
  zero,
  type CurrencyCode,
  type Decimal,
  type Money,
  type Price,
} from "@fairhour/money";
import * as z from "zod";
import { InvalidInputError } from "../errors";
import { deepFreeze } from "../engine/freeze";
import { setOwn } from "../internal/records";
import { toSchemaIssues } from "../internal/zod-issues";
import {
  CLIENT_KINDS,
  DOCUMENT_KINDS,
  LINE_KINDS,
  LINE_UNITS,
  type LineTaxTreatment,
} from "../input/types";
import type { MessageParam, MessageRef } from "../messages/types";
import {
  COMPONENT_EFFECTS,
  COMPONENT_KINDS,
  TAX_TREATMENT_KINDS,
  type Allocation,
} from "../pack/rule";
import {
  isCountryCode,
  isIsoDate,
  type CountryCode,
  type IsoDate,
  type JsonValue,
} from "../primitives";
import { SOURCE_KINDS, copySource, type SourceRef } from "../sources";
import {
  ENGINE_NAME,
  type Component,
  type ComputedLine,
  type InvoiceComputation,
  type LegalNote,
  type TaxSummaryEntry,
  type TraceStep,
  type Warning,
} from "./types";

/** Canonical JSON: amounts as decimal strings in `currency`, keys in type order. */
export type InvoiceComputationJson = Readonly<Record<string, JsonValue>>;

type JsonObject = Readonly<Record<string, JsonValue>>;

/** An object from entries in order; undefined values are left out. */
function obj(entries: readonly (readonly [string, JsonValue | undefined])[]): JsonObject {
  const result: Record<string, JsonValue> = {};
  for (const [key, value] of entries) if (value !== undefined) setOwn(result, key, value);
  return result;
}

function stringRecord(
  record: Readonly<Record<string, string>> | undefined,
): JsonObject | undefined {
  return record === undefined ? undefined : obj(Object.entries(record));
}

function paramToJson(param: MessageParam): JsonObject {
  switch (param.type) {
    case "money":
      return { type: "money", value: toDecimalString(param.value) };
    case "price":
      return { type: "price", value: decimalToString(param.value.amount) };
    case "decimal":
    case "percent":
      return { type: param.type, value: decimalToString(param.value) };
    case "date":
    case "text":
      return { type: param.type, value: param.value };
    case "message":
      return { type: "message", value: messageToJson(param.value) };
  }
}

function messageToJson(ref: MessageRef): JsonObject {
  return obj([
    ["key", ref.key],
    [
      "params",
      ref.params === undefined
        ? undefined
        : obj(
            Object.entries(ref.params).map(([name, param]) => [name, paramToJson(param)] as const),
          ),
    ],
  ]);
}

function sourcesToJson(sources: readonly SourceRef[]): JsonValue {
  return sources.map((source) => {
    const copy = copySource(source);
    return obj([
      ["id", copy.id],
      ["kind", copy.kind],
      ["title", copy.title],
      ["citation", copy.citation],
      ["url", copy.url],
      [
        "verification",
        copy.verification.status === "verified"
          ? { status: "verified", on: copy.verification.on, against: copy.verification.against }
          : { status: "to-be-verified", reason: copy.verification.reason },
      ],
      ["note", copy.note],
    ]);
  });
}

function treatmentToJson(treatment: LineTaxTreatment): JsonObject {
  switch (treatment.kind) {
    case "standard":
    case "excluded":
      return { kind: treatment.kind };
    case "rate":
      return { kind: "rate", rate: decimalToString(treatment.rate) };
    case "exempt":
    case "out-of-scope":
      return obj([
        ["kind", treatment.kind],
        ["reference", treatment.reference],
      ]);
  }
}

const amount = (value: Money): string => toDecimalString(value);
const optionalDecimal = (value: Decimal | undefined): string | undefined =>
  value === undefined ? undefined : decimalToString(value);

/** Canonical JSON form: amounts as decimal strings in `currency`, keys in type order (G6, G9). */
export function computationToJson(c: InvoiceComputation): InvoiceComputationJson {
  return obj([
    ["schemaVersion", c.schemaVersion],
    ["engine", { name: c.engine.name, version: c.engine.version }],
    ["pack", { id: c.pack.id, version: c.pack.version }],
    ["parameters", { id: c.parameters.id, effectiveFrom: c.parameters.effectiveFrom }],
    ["issueDate", c.issueDate],
    ["documentKind", c.documentKind],
    ["currency", c.currency],
    [
      "client",
      obj([
        ["country", c.client.country],
        ["kind", c.client.kind],
        ["isWithholdingAgent", c.client.isWithholdingAgent],
        ["vatId", c.client.vatId],
      ]),
    ],
    [
      "exchangeRates",
      c.exchangeRates?.map((record) =>
        obj([
          ["from", record.from],
          ["rate", decimalToString(record.rate)],
          ["date", record.date],
          ["source", record.source],
        ]),
      ),
    ],
    [
      "lines",
      c.lines.map((line) =>
        obj([
          ["id", line.id],
          ["kind", line.kind],
          ["description", line.description],
          ["quantity", decimalToString(line.quantity)],
          ["unit", line.unit],
          ["unitPrice", decimalToString(line.unitPrice.amount)],
          ["treatment", treatmentToJson(line.treatment)],
          ["net", amount(line.net)],
          ["groupId", line.groupId],
        ]),
      ),
    ],
    ["subtotal", amount(c.subtotal)],
    [
      "components",
      c.components.map((component) =>
        obj([
          ["id", component.id],
          ["ruleId", component.ruleId],
          ["kind", component.kind],
          ["label", messageToJson(component.label)],
          ["effect", component.effect],
          ["base", amount(component.base)],
          ["rate", optionalDecimal(component.rate)],
          ["amount", amount(component.amount)],
          [
            "allocations",
            component.allocations.map((allocation) => ({
              groupId: allocation.groupId,
              base: amount(allocation.base),
              amount: amount(allocation.amount),
            })),
          ],
          ["exportCodes", stringRecord(component.exportCodes)],
          ["sources", sourcesToJson(component.sources)],
        ]),
      ),
    ],
    [
      "vatSummary",
      c.vatSummary.map((entry) =>
        obj([
          ["groupId", entry.groupId],
          ["treatment", entry.treatment],
          ["rate", optionalDecimal(entry.rate)],
          ["label", messageToJson(entry.label)],
          ["reference", entry.reference === undefined ? undefined : messageToJson(entry.reference)],
          ["base", amount(entry.base)],
          ["tax", amount(entry.tax)],
          ["exportCodes", stringRecord(entry.exportCodes)],
        ]),
      ),
    ],
    ["taxableBase", amount(c.taxableBase)],
    ["taxTotal", amount(c.taxTotal)],
    ["total", amount(c.total)],
    ["withholdingTotal", amount(c.withholdingTotal)],
    ["netPayable", amount(c.netPayable)],
    [
      "legalNotes",
      c.legalNotes.map((note) =>
        obj([
          ["id", note.id],
          ["ruleId", note.ruleId],
          ["message", messageToJson(note.message)],
          ["sources", sourcesToJson(note.sources)],
        ]),
      ),
    ],
    [
      "warnings",
      c.warnings.map((warning) =>
        obj([
          ["code", warning.code],
          ["severity", warning.severity],
          ["ruleId", warning.ruleId],
          ["message", messageToJson(warning.message)],
        ]),
      ),
    ],
    [
      "trace",
      c.trace.map((step) =>
        obj([
          ["step", step.step],
          ["ruleId", step.ruleId],
          ["message", messageToJson(step.message)],
          ["formula", step.formula === undefined ? undefined : messageToJson(step.formula)],
          ["amount", step.amount === undefined ? undefined : amount(step.amount)],
          ["componentId", step.componentId],
          ["sources", sourcesToJson(step.sources)],
        ]),
      ),
    ],
  ]);
}

// ---------------------------------------------------------------------------------------------
// JSON -> InvoiceComputation

const decimalString = z.string().regex(/^-?(0|[1-9]\d*)(\.\d+)?$/, "Expected a decimal string");

interface MessageRefJson {
  readonly key: string;
  readonly params?: Readonly<Record<string, MessageParamJson>> | undefined;
}
type MessageParamJson =
  | {
      readonly type: "money" | "price" | "decimal" | "percent" | "date" | "text";
      readonly value: string;
    }
  | { readonly type: "message"; readonly value: MessageRefJson };

const messageSchema: z.ZodType<MessageRefJson> = z.lazy(() =>
  z.strictObject({
    key: z.string().min(1),
    params: z.record(z.string(), paramSchema).optional(),
  }),
);
const paramSchema: z.ZodType<MessageParamJson> = z.lazy(() =>
  z.union([
    z.strictObject({
      type: z.enum(["money", "price", "decimal", "percent", "date", "text"]),
      value: z.string(),
    }),
    z.strictObject({ type: z.literal("message"), value: messageSchema }),
  ]),
);

const sourceSchema = z.strictObject({
  id: z.string().min(1),
  kind: z.enum(SOURCE_KINDS),
  title: z.string().min(1),
  citation: z.string().min(1),
  url: z.string().optional(),
  verification: z.discriminatedUnion("status", [
    z.strictObject({
      status: z.literal("verified"),
      on: z.string(),
      against: z.enum(["primary-text", "official-summary", "secondary"]),
    }),
    z.strictObject({ status: z.literal("to-be-verified"), reason: z.string() }),
  ]),
  note: z.string().optional(),
});

const exportCodesSchema = z.record(z.string(), z.string()).optional();

const structuralSchema = z.strictObject({
  schemaVersion: z.literal(1),
  engine: z.strictObject({ name: z.literal(ENGINE_NAME), version: z.string().min(1) }),
  pack: z.strictObject({ id: z.string().min(1), version: z.string().min(1) }),
  parameters: z.strictObject({ id: z.string().min(1), effectiveFrom: z.string() }),
  issueDate: z.string(),
  documentKind: z.enum(DOCUMENT_KINDS),
  currency: z.string(),
  client: z.strictObject({
    country: z.string(),
    kind: z.enum(CLIENT_KINDS),
    isWithholdingAgent: z.boolean(),
    vatId: z.string().optional(),
  }),
  exchangeRates: z
    .array(
      z.strictObject({
        from: z.string(),
        rate: decimalString,
        date: z.string(),
        source: z.string().optional(),
      }),
    )
    .optional(),
  lines: z.array(
    z.strictObject({
      id: z.string().min(1),
      kind: z.enum(LINE_KINDS),
      description: z.string(),
      quantity: decimalString,
      unit: z.enum(LINE_UNITS),
      unitPrice: decimalString,
      treatment: z.discriminatedUnion("kind", [
        z.strictObject({ kind: z.literal("standard") }),
        z.strictObject({ kind: z.literal("rate"), rate: decimalString }),
        z.strictObject({ kind: z.literal("exempt"), reference: z.string().optional() }),
        z.strictObject({ kind: z.literal("out-of-scope"), reference: z.string().optional() }),
        z.strictObject({ kind: z.literal("excluded") }),
      ]),
      net: decimalString,
      groupId: z.string().min(1),
    }),
  ),
  subtotal: decimalString,
  components: z.array(
    z.strictObject({
      id: z.string().min(1),
      ruleId: z.string().min(1),
      kind: z.enum(COMPONENT_KINDS),
      label: messageSchema,
      effect: z.enum(COMPONENT_EFFECTS),
      base: decimalString,
      rate: decimalString.optional(),
      amount: decimalString,
      allocations: z.array(
        z.strictObject({ groupId: z.string().min(1), base: decimalString, amount: decimalString }),
      ),
      exportCodes: exportCodesSchema,
      sources: z.array(sourceSchema),
    }),
  ),
  vatSummary: z.array(
    z.strictObject({
      groupId: z.string().min(1),
      treatment: z.enum(TAX_TREATMENT_KINDS),
      rate: decimalString.optional(),
      label: messageSchema,
      reference: messageSchema.optional(),
      base: decimalString,
      tax: decimalString,
      exportCodes: exportCodesSchema,
    }),
  ),
  taxableBase: decimalString,
  taxTotal: decimalString,
  total: decimalString,
  withholdingTotal: decimalString,
  netPayable: decimalString,
  legalNotes: z.array(
    z.strictObject({
      id: z.string().min(1),
      ruleId: z.string().min(1),
      message: messageSchema,
      sources: z.array(sourceSchema),
    }),
  ),
  warnings: z.array(
    z.strictObject({
      code: z.string().min(1),
      severity: z.enum(["info", "warning"]),
      ruleId: z.string().min(1),
      message: messageSchema,
    }),
  ),
  trace: z.array(
    z.strictObject({
      step: z.number().int().positive(),
      ruleId: z.string().min(1),
      message: messageSchema,
      formula: messageSchema.optional(),
      amount: decimalString.optional(),
      componentId: z.string().optional(),
      sources: z.array(sourceSchema),
    }),
  ),
});

type Structural = z.output<typeof structuralSchema>;
type Path = readonly (string | number)[];
type SourceJson = z.output<typeof sourceSchema>;

/** Converts strings to typed values, recording an issue (and a placeholder) on failure. */
class Decoder {
  readonly issues: { readonly path: Path; readonly message: string; readonly code: string }[] = [];

  constructor(readonly currency: CurrencyCode) {}

  private attempt<T>(path: Path, code: string, fallback: T, convert: () => T): T {
    try {
      return convert();
    } catch (error) {
      this.issues.push({
        path,
        code,
        message: error instanceof Error ? error.message : "invalid value",
      });
      return fallback;
    }
  }

  money(text: string, path: Path): Money {
    return this.attempt(path, "invalid-amount", zero(this.currency), () => {
      const value = parseMoney(text, this.currency);
      if (value.amount < 0n) throw new RangeError("Amounts in a computation are never negative");
      return value;
    });
  }

  decimal(text: string, path: Path): Decimal {
    return this.attempt(path, "invalid-decimal", decimal("0"), () => decimal(text));
  }

  price(text: string, path: Path): Price {
    return this.attempt(path, "invalid-decimal", price("0", this.currency), () =>
      price(text, this.currency),
    );
  }

  date(text: string, path: Path): IsoDate {
    if (!isIsoDate(text))
      this.issues.push({ path, code: "invalid-date", message: "Expected an ISO date" });
    return text as IsoDate;
  }

  currencyCode(text: string, path: Path): CurrencyCode {
    if (!isCurrencyCode(text))
      this.issues.push({ path, code: "invalid-currency", message: "Expected a currency code" });
    return text as CurrencyCode;
  }

  message(json: MessageRefJson, path: Path): MessageRef {
    if (json.params === undefined) return { key: json.key };
    const params: Record<string, MessageParam> = {};
    for (const [name, param] of Object.entries(json.params)) {
      setOwn(params, name, this.param(param, [...path, "params", name, "value"]));
    }
    return { key: json.key, params };
  }

  private param(json: MessageParamJson, path: Path): MessageParam {
    switch (json.type) {
      case "money":
        return { type: "money", value: this.money(json.value, path) };
      case "price":
        return { type: "price", value: this.price(json.value, path) };
      case "decimal":
      case "percent":
        return { type: json.type, value: this.decimal(json.value, path) };
      case "date":
        return { type: "date", value: this.date(json.value, path) };
      case "text":
        return { type: "text", value: json.value };
      case "message":
        return { type: "message", value: this.message(json.value, path) };
    }
  }

  sources(json: readonly SourceJson[], path: Path): readonly SourceRef[] {
    return json.map((source, index): SourceRef => {
      if (source.verification.status === "verified")
        this.date(source.verification.on, [...path, index, "verification", "on"]);
      return copySource(source as SourceRef);
    });
  }
}

function decode(json: Structural, decoder: Decoder): InvoiceComputation {
  const d = decoder;
  const exportCodes = (codes: Readonly<Record<string, string>> | undefined) =>
    codes === undefined ? {} : { exportCodes: { ...codes } };
  const country = json.client.country;
  if (!isCountryCode(country))
    d.issues.push({
      path: ["client", "country"],
      code: "invalid-country",
      message: "Expected a country code",
    });
  return {
    schemaVersion: 1,
    engine: { name: ENGINE_NAME, version: json.engine.version },
    pack: { id: json.pack.id, version: json.pack.version },
    parameters: {
      id: json.parameters.id,
      effectiveFrom: d.date(json.parameters.effectiveFrom, ["parameters", "effectiveFrom"]),
    },
    issueDate: d.date(json.issueDate, ["issueDate"]),
    documentKind: json.documentKind,
    currency: d.currency,
    client: {
      country: country as CountryCode,
      kind: json.client.kind,
      isWithholdingAgent: json.client.isWithholdingAgent,
      ...(json.client.vatId === undefined ? {} : { vatId: json.client.vatId }),
    },
    ...(json.exchangeRates === undefined
      ? {}
      : {
          exchangeRates: json.exchangeRates.map((record, index) => ({
            from: d.currencyCode(record.from, ["exchangeRates", index, "from"]),
            rate: d.decimal(record.rate, ["exchangeRates", index, "rate"]),
            date: d.date(record.date, ["exchangeRates", index, "date"]),
            ...(record.source === undefined ? {} : { source: record.source }),
          })),
        }),
    lines: json.lines.map((line, index): ComputedLine => {
      const at = ["lines", index] as const;
      const treatment: LineTaxTreatment =
        line.treatment.kind === "rate"
          ? { kind: "rate", rate: d.decimal(line.treatment.rate, [...at, "treatment", "rate"]) }
          : line.treatment.kind === "exempt" || line.treatment.kind === "out-of-scope"
            ? line.treatment.reference === undefined
              ? { kind: line.treatment.kind }
              : { kind: line.treatment.kind, reference: line.treatment.reference }
            : { kind: line.treatment.kind };
      return {
        id: line.id,
        kind: line.kind,
        description: line.description,
        quantity: d.decimal(line.quantity, [...at, "quantity"]),
        unit: line.unit,
        unitPrice: d.price(line.unitPrice, [...at, "unitPrice"]),
        treatment,
        net: d.money(line.net, [...at, "net"]),
        groupId: line.groupId,
      };
    }),
    subtotal: d.money(json.subtotal, ["subtotal"]),
    components: json.components.map((component, index): Component => {
      const at = ["components", index] as const;
      return {
        id: component.id,
        ruleId: component.ruleId,
        kind: component.kind,
        label: d.message(component.label, [...at, "label"]),
        effect: component.effect,
        base: d.money(component.base, [...at, "base"]),
        ...(component.rate === undefined
          ? {}
          : { rate: d.decimal(component.rate, [...at, "rate"]) }),
        amount: d.money(component.amount, [...at, "amount"]),
        allocations: component.allocations.map((allocation, j): Allocation => ({
          groupId: allocation.groupId,
          base: d.money(allocation.base, [...at, "allocations", j, "base"]),
          amount: d.money(allocation.amount, [...at, "allocations", j, "amount"]),
        })),
        ...exportCodes(component.exportCodes),
        sources: d.sources(component.sources, [...at, "sources"]),
      };
    }),
    vatSummary: json.vatSummary.map((entry, index): TaxSummaryEntry => {
      const at = ["vatSummary", index] as const;
      return {
        groupId: entry.groupId,
        treatment: entry.treatment,
        ...(entry.rate === undefined ? {} : { rate: d.decimal(entry.rate, [...at, "rate"]) }),
        label: d.message(entry.label, [...at, "label"]),
        ...(entry.reference === undefined
          ? {}
          : { reference: d.message(entry.reference, [...at, "reference"]) }),
        base: d.money(entry.base, [...at, "base"]),
        tax: d.money(entry.tax, [...at, "tax"]),
        ...exportCodes(entry.exportCodes),
      };
    }),
    taxableBase: d.money(json.taxableBase, ["taxableBase"]),
    taxTotal: d.money(json.taxTotal, ["taxTotal"]),
    total: d.money(json.total, ["total"]),
    withholdingTotal: d.money(json.withholdingTotal, ["withholdingTotal"]),
    netPayable: d.money(json.netPayable, ["netPayable"]),
    legalNotes: json.legalNotes.map((note, index): LegalNote => ({
      id: note.id,
      ruleId: note.ruleId,
      message: d.message(note.message, ["legalNotes", index, "message"]),
      sources: d.sources(note.sources, ["legalNotes", index, "sources"]),
    })),
    warnings: json.warnings.map((warning, index): Warning => ({
      code: warning.code,
      severity: warning.severity,
      ruleId: warning.ruleId,
      message: d.message(warning.message, ["warnings", index, "message"]),
    })),
    trace: json.trace.map((step, index): TraceStep => {
      const at = ["trace", index] as const;
      return {
        step: step.step,
        ruleId: step.ruleId,
        message: d.message(step.message, [...at, "message"]),
        ...(step.formula === undefined
          ? {}
          : { formula: d.message(step.formula, [...at, "formula"]) }),
        ...(step.amount === undefined ? {} : { amount: d.money(step.amount, [...at, "amount"]) }),
        ...(step.componentId === undefined ? {} : { componentId: step.componentId }),
        sources: d.sources(step.sources, [...at, "sources"]),
      };
    }),
  };
}

/**
 * JSON form -> InvoiceComputation (deeply frozen). Amounts are parsed in the document's
 * `currency`; semantic failures are custom issues whose `params.code` names them.
 */
export const InvoiceComputationJsonSchema: z.ZodType<InvoiceComputation, InvoiceComputationJson> =
  structuralSchema.transform((json, ctx) => {
    if (!isCurrencyCode(json.currency)) {
      ctx.addIssue({
        code: "custom",
        path: ["currency"],
        message: "Expected an ISO 4217 currency code",
        params: { code: "invalid-currency" },
        input: json.currency,
      });
      return z.NEVER;
    }
    const decoder = new Decoder(json.currency);
    const computation = decode(json, decoder);
    if (decoder.issues.length === 0) return deepFreeze(computation);
    for (const found of decoder.issues) {
      ctx.addIssue({
        code: "custom",
        path: [...found.path],
        message: found.message,
        params: { code: found.code },
        input: json,
      });
    }
    return z.NEVER;
  }) as unknown as z.ZodType<InvoiceComputation, InvoiceComputationJson>;
// The cast only widens the input type: zod infers optional JSON properties as `T | undefined`,
// which is not assignable to the JsonValue index signature of InvoiceComputationJson.

/** @throws InvalidInputError when the document does not match InvoiceComputationJsonSchema. */
export function computationFromJson(json: unknown): InvoiceComputation {
  const result = InvoiceComputationJsonSchema.safeParse(json);
  if (!result.success) throw new InvalidInputError(toSchemaIssues(result.error.issues));
  return result.data;
}
