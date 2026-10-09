import {
  compareDecimal,
  decimal,
  decimalToString,
  isCurrencyCode,
  isDecimal,
  isPrice,
  price,
  signDecimal,
  tryDecimal,
  type CurrencyCode,
  type Decimal,
  type Price,
} from "@fairhour/money";
import * as z from "zod";
import { InvalidInputError, type SchemaIssue } from "../errors";
import { deepFreeze } from "../engine/freeze";
import { cloneJson } from "../internal/json";
import { mapRecord } from "../internal/records";
import { toSchemaIssues } from "../internal/zod-issues";
import {
  isCountryCode,
  isIsoDate,
  type CountryCode,
  type IsoDate,
  type JsonValue,
} from "../primitives";
import {
  CLIENT_KINDS,
  DOCUMENT_KINDS,
  LINE_KINDS,
  LINE_UNITS,
  type ClientInput,
  type ExchangeRecord,
  type InvoiceInput,
  type InvoiceInputJson,
  type InvoiceLineInput,
  type LineTaxTreatment,
} from "./types";

/** Line ids: unique within an invoice. */
export const LINE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;
/** VAT ids: 1..32 letters and digits, no separators. */
export const VAT_ID_PATTERN = /^[A-Za-z0-9]{1,32}$/;
export const MAX_INVOICE_LINES = 500;
/** Maximum fractional digits of quantities and unit prices. */
export const MAX_INPUT_SCALE = 8;
/** Maximum fractional digits of an explicit line rate. */
export const MAX_RATE_SCALE = 4;
const MAX_QUANTITY = decimal("1000000000");
const MAX_UNIT_PRICE = decimal("1000000000000");
const HUNDRED = decimal("100");
const DECIMAL_SYNTAX = /^-?(0|[1-9]\d*)(\.\d+)?$/;

type Path = readonly (string | number)[];

/** The fields the semantic rules of design 4.5 look at, shared by the typed and JSON forms. */
interface CheckableLine {
  readonly id: string;
  readonly quantity: Decimal | undefined;
  readonly unitPriceAmount: Decimal | undefined;
  /** Undefined in the JSON form, where prices are implicitly in the invoice currency. */
  readonly unitPriceCurrency: string | undefined;
  readonly rate: Decimal | undefined;
}

interface Checkable {
  readonly issueDate: string;
  readonly currency: string;
  readonly country: string;
  readonly vatId: string | undefined;
  readonly lines: readonly CheckableLine[];
  readonly exchangeRates: readonly {
    readonly from: string;
    readonly rate: Decimal | undefined;
    readonly date: string;
  }[];
}

function issue(path: Path, code: string, message: string): SchemaIssue {
  return { path, code, message };
}

function checkBounded(
  value: Decimal,
  max: Decimal,
  path: Path,
  what: string,
  issues: SchemaIssue[],
): void {
  if (value.scale > MAX_INPUT_SCALE) {
    issues.push(issue(path, "too-precise", `${what} has more than ${MAX_INPUT_SCALE} decimals`));
  }
  if (signDecimal(value) < 0 || compareDecimal(value, max) > 0) {
    issues.push(
      issue(path, "out-of-range", `${what} must be between 0 and ${decimalToString(max)}`),
    );
  }
}

function semanticIssues(input: Checkable): readonly SchemaIssue[] {
  const issues: SchemaIssue[] = [];
  if (!isIsoDate(input.issueDate)) {
    issues.push(issue(["issueDate"], "invalid-date", "Expected a date YYYY-MM-DD from 1900-01-01"));
  }
  const currencyValid = isCurrencyCode(input.currency);
  if (!currencyValid) {
    issues.push(issue(["currency"], "invalid-currency", "Expected an ISO 4217 currency code"));
  }
  if (!isCountryCode(input.country)) {
    issues.push(
      issue(
        ["client", "country"],
        "invalid-country",
        "Expected an assigned ISO 3166-1 alpha-2 code",
      ),
    );
  }
  if (input.vatId !== undefined && !VAT_ID_PATTERN.test(input.vatId)) {
    issues.push(
      issue(
        ["client", "vatId"],
        "invalid-vat-id",
        "Expected 1 to 32 letters and digits, no spaces",
      ),
    );
  }
  if (input.lines.length > MAX_INVOICE_LINES) {
    issues.push(issue(["lines"], "too-many-lines", `At most ${MAX_INVOICE_LINES} lines`));
  }
  const seen = new Set<string>();
  input.lines.forEach((line, index) => {
    const path = ["lines", index] as const;
    if (!LINE_ID_PATTERN.test(line.id)) {
      issues.push(
        issue(
          [...path, "id"],
          "invalid-line-id",
          "Expected 1 to 64 characters among A-Z a-z 0-9 . _ : -",
        ),
      );
    } else if (seen.has(line.id)) {
      issues.push(issue([...path, "id"], "duplicate-line-id", "Line ids must be unique"));
    }
    seen.add(line.id);
    if (line.quantity !== undefined) {
      checkBounded(line.quantity, MAX_QUANTITY, [...path, "quantity"], "The quantity", issues);
    }
    if (
      currencyValid &&
      line.unitPriceCurrency !== undefined &&
      line.unitPriceCurrency !== input.currency
    ) {
      issues.push(
        issue(
          [...path, "unitPrice"],
          "currency-mismatch",
          "The unit price is not in the invoice currency",
        ),
      );
    }
    if (line.unitPriceAmount !== undefined) {
      checkBounded(
        line.unitPriceAmount,
        MAX_UNIT_PRICE,
        [...path, "unitPrice"],
        "The unit price",
        issues,
      );
    }
    if (
      line.rate !== undefined &&
      (signDecimal(line.rate) < 0 ||
        compareDecimal(line.rate, HUNDRED) > 0 ||
        line.rate.scale > MAX_RATE_SCALE)
    ) {
      issues.push(
        issue(
          [...path, "treatment", "rate"],
          "invalid-rate",
          `A rate must be between 0 and 100 with at most ${MAX_RATE_SCALE} decimals`,
        ),
      );
    }
  });
  input.exchangeRates.forEach((record, index) => {
    const path = ["exchangeRates", index] as const;
    if (!isCurrencyCode(record.from) || record.from === input.currency) {
      issues.push(
        issue(
          [...path, "from"],
          "invalid-exchange-rate",
          "Expected a currency code different from the invoice currency",
        ),
      );
    }
    if (record.rate !== undefined && signDecimal(record.rate) <= 0) {
      issues.push(
        issue([...path, "rate"], "invalid-exchange-rate", "An exchange rate must be positive"),
      );
    }
    if (!isIsoDate(record.date)) {
      issues.push(
        issue([...path, "date"], "invalid-date", "Expected a date YYYY-MM-DD from 1900-01-01"),
      );
    }
  });
  return issues;
}

// ---------------------------------------------------------------------------------------------
// Typed form

const descriptionSchema = z.string().min(1).max(1000);
const referenceSchema = z.string().min(1).max(500);
const exchangeSourceSchema = z.string().min(1).max(200);
const decimalValue = z.custom<Decimal>((value) => isDecimal(value), {
  message: "Expected a Decimal from @fairhour/money",
});
const priceValue = z.custom<Price>((value) => isPrice(value), {
  message: "Expected a Price from @fairhour/money",
});

const typedTreatmentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("standard") }),
  z.object({ kind: z.literal("rate"), rate: decimalValue }),
  z.object({ kind: z.literal("exempt"), reference: referenceSchema.optional() }),
  z.object({ kind: z.literal("out-of-scope"), reference: referenceSchema.optional() }),
  z.object({ kind: z.literal("excluded") }),
]);

const typedInputSchema = z.object({
  issueDate: z.string(),
  documentKind: z.enum(DOCUMENT_KINDS),
  currency: z.string(),
  client: z.object({
    country: z.string(),
    kind: z.enum(CLIENT_KINDS),
    isWithholdingAgent: z.boolean(),
    vatId: z.string().optional(),
  }),
  lines: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(LINE_KINDS),
      description: descriptionSchema,
      quantity: decimalValue,
      unit: z.enum(LINE_UNITS),
      unitPrice: priceValue,
      treatment: typedTreatmentSchema,
    }),
  ),
  options: z.record(z.string(), z.json()).optional(),
  exchangeRates: z
    .array(
      z.object({
        from: z.string(),
        rate: decimalValue,
        date: z.string(),
        source: exchangeSourceSchema.optional(),
      }),
    )
    .optional(),
});

type TypedStructural = z.output<typeof typedInputSchema>;
type TreatmentStructural = z.output<typeof typedTreatmentSchema>;

/** A fresh, frozen Decimal owned by money (the caller's object is never frozen or kept). */
function ownDecimal(value: Decimal): Decimal {
  return decimal(decimalToString(value));
}

function buildTreatment(
  treatment: TreatmentStructural,
  rate: (value: Decimal) => Decimal,
): LineTaxTreatment {
  switch (treatment.kind) {
    case "standard":
    case "excluded":
      return { kind: treatment.kind };
    case "rate":
      return { kind: "rate", rate: rate(treatment.rate) };
    case "exempt":
    case "out-of-scope":
      return treatment.reference === undefined
        ? { kind: treatment.kind }
        : { kind: treatment.kind, reference: treatment.reference };
  }
}

function buildClient(client: {
  readonly country: string;
  readonly kind: ClientInput["kind"];
  readonly isWithholdingAgent: boolean;
  readonly vatId?: string | undefined;
}): ClientInput {
  return {
    country: client.country as CountryCode,
    kind: client.kind,
    isWithholdingAgent: client.isWithholdingAgent,
    ...(client.vatId === undefined ? {} : { vatId: client.vatId }),
  };
}

function buildOptions(
  options: Readonly<Record<string, JsonValue>> | undefined,
): Pick<InvoiceInput, "options"> {
  return options === undefined ? {} : { options: mapRecord(options, (value) => cloneJson(value)) };
}

function buildExchangeRates(
  records:
    | readonly {
        readonly from: string;
        readonly rate: Decimal;
        readonly date: string;
        readonly source?: string | undefined;
      }[]
    | undefined,
): Pick<InvoiceInput, "exchangeRates"> {
  if (records === undefined) return {};
  return {
    exchangeRates: records.map((record): ExchangeRecord => ({
      from: record.from as CurrencyCode,
      rate: ownDecimal(record.rate),
      date: record.date as IsoDate,
      ...(record.source === undefined ? {} : { source: record.source }),
    })),
  };
}

function checkableFromTyped(input: TypedStructural): Checkable {
  return {
    issueDate: input.issueDate,
    currency: input.currency,
    country: input.client.country,
    vatId: input.client.vatId,
    lines: input.lines.map((line) => ({
      id: line.id,
      quantity: line.quantity,
      unitPriceAmount: line.unitPrice.amount,
      unitPriceCurrency: line.unitPrice.currency,
      rate: line.treatment.kind === "rate" ? line.treatment.rate : undefined,
    })),
    exchangeRates: (input.exchangeRates ?? []).map((record) => ({
      from: record.from,
      rate: record.rate,
      date: record.date,
    })),
  };
}

/**
 * Validates the typed form (bigint/Decimal shapes and every rule of design 4.5) and returns a
 * normalized, deeply frozen copy: unknown keys are dropped, the caller's objects are not kept.
 * @throws InvalidInputError with every issue found
 */
export function validateInvoiceInput(input: InvoiceInput): InvoiceInput {
  const structural = typedInputSchema.safeParse(input);
  if (!structural.success) throw new InvalidInputError(toSchemaIssues(structural.error.issues));
  const data = structural.data;
  const issues = semanticIssues(checkableFromTyped(data));
  if (issues.length > 0) throw new InvalidInputError(issues);
  const currency = data.currency as CurrencyCode;
  const result: InvoiceInput = {
    issueDate: data.issueDate as IsoDate,
    documentKind: data.documentKind,
    currency,
    client: buildClient(data.client),
    lines: data.lines.map((line): InvoiceLineInput => ({
      id: line.id,
      kind: line.kind,
      description: line.description,
      quantity: ownDecimal(line.quantity),
      unit: line.unit,
      unitPrice: price(decimalToString(line.unitPrice.amount), currency),
      treatment: buildTreatment(line.treatment, ownDecimal),
    })),
    ...buildOptions(data.options),
    ...buildExchangeRates(data.exchangeRates),
  };
  return deepFreeze(result);
}

// ---------------------------------------------------------------------------------------------
// JSON form

const jsonTreatmentSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("standard") }),
  z.strictObject({ kind: z.literal("rate"), rate: z.string() }),
  z.strictObject({ kind: z.literal("exempt"), reference: referenceSchema.optional() }),
  z.strictObject({ kind: z.literal("out-of-scope"), reference: referenceSchema.optional() }),
  z.strictObject({ kind: z.literal("excluded") }),
]);

const jsonStructuralSchema = z.strictObject({
  issueDate: z.string(),
  documentKind: z.enum(DOCUMENT_KINDS).default("invoice"),
  currency: z.string(),
  client: z.strictObject({
    country: z.string(),
    kind: z.enum(CLIENT_KINDS),
    isWithholdingAgent: z.boolean(),
    vatId: z.string().optional(),
  }),
  lines: z.array(
    z.strictObject({
      id: z.string(),
      kind: z.enum(LINE_KINDS),
      description: descriptionSchema,
      quantity: z.string(),
      unit: z.enum(LINE_UNITS),
      unitPrice: z.string(),
      treatment: jsonTreatmentSchema.optional(),
    }),
  ),
  options: z.record(z.string(), z.json()).optional(),
  exchangeRates: z
    .array(
      z.strictObject({
        from: z.string(),
        rate: z.string(),
        date: z.string(),
        source: exchangeSourceSchema.optional(),
      }),
    )
    .optional(),
});

type JsonStructural = z.output<typeof jsonStructuralSchema>;

function parseDecimalField(text: string, path: Path, issues: SchemaIssue[]): Decimal | undefined {
  const value = tryDecimal(text);
  if (value !== undefined) return value;
  issues.push(
    DECIMAL_SYNTAX.test(text)
      ? issue(path, "out-of-range", "The number has too many digits")
      : issue(path, "invalid-decimal", 'Expected a decimal string such as "1234.56"'),
  );
  return undefined;
}

type ConvertResult =
  | { readonly ok: true; readonly input: InvoiceInput }
  | { readonly ok: false; readonly issues: readonly SchemaIssue[] };

function convertJson(json: JsonStructural): ConvertResult {
  const issues: SchemaIssue[] = [];
  const lines = json.lines.map((line, index) => {
    const treatment = line.treatment ?? {
      kind: line.kind === "reimbursement" ? "excluded" : "standard",
    };
    return {
      line,
      treatment,
      quantity: parseDecimalField(line.quantity, ["lines", index, "quantity"], issues),
      unitPrice: parseDecimalField(line.unitPrice, ["lines", index, "unitPrice"], issues),
      rate:
        treatment.kind === "rate"
          ? parseDecimalField(treatment.rate, ["lines", index, "treatment", "rate"], issues)
          : undefined,
    };
  });
  const exchangeRates = (json.exchangeRates ?? []).map((record, index) => ({
    record,
    rate: parseDecimalField(record.rate, ["exchangeRates", index, "rate"], issues),
  }));
  issues.push(
    ...semanticIssues({
      issueDate: json.issueDate,
      currency: json.currency,
      country: json.client.country,
      vatId: json.client.vatId,
      lines: lines.map((item) => ({
        id: item.line.id,
        quantity: item.quantity,
        unitPriceAmount: item.unitPrice,
        unitPriceCurrency: undefined,
        rate: item.rate,
      })),
      exchangeRates: exchangeRates.map((item) => ({
        from: item.record.from,
        rate: item.rate,
        date: item.record.date,
      })),
    }),
  );
  if (issues.length > 0) return { ok: false, issues };
  const currency = json.currency as CurrencyCode;
  const input: InvoiceInput = {
    issueDate: json.issueDate as IsoDate,
    documentKind: json.documentKind,
    currency,
    client: buildClient(json.client),
    lines: lines.map(({ line, treatment }): InvoiceLineInput => ({
      id: line.id,
      kind: line.kind,
      description: line.description,
      quantity: decimal(line.quantity),
      unit: line.unit,
      unitPrice: price(line.unitPrice, currency),
      treatment: buildTreatment(
        treatment.kind === "rate" ? { kind: "rate", rate: decimal(treatment.rate) } : treatment,
        (value) => value,
      ),
    })),
    ...buildOptions(json.options),
    ...buildExchangeRates(
      json.exchangeRates?.map((record) => ({ ...record, rate: decimal(record.rate) })),
    ),
  };
  return { ok: true, input: deepFreeze(input) };
}

/**
 * JSON form -> typed InvoiceInput. Amounts are decimal strings in the invoice currency;
 * `documentKind` defaults to "invoice" and a line's treatment to "excluded" for reimbursements
 * and "standard" otherwise. Semantic violations are custom issues whose `params.code` is the
 * issue code of design 4.5 (`parseInvoiceInput` reports that code).
 */
export const InvoiceInputJsonSchema: z.ZodType<InvoiceInput, InvoiceInputJson> =
  jsonStructuralSchema.transform((json, ctx) => {
    const result = convertJson(json);
    if (result.ok) return result.input;
    for (const found of result.issues) {
      ctx.addIssue({
        code: "custom",
        path: [...found.path],
        message: found.message,
        params: { code: found.code },
        input: json,
      });
    }
    return z.NEVER;
  });
