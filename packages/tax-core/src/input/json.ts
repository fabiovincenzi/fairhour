import { decimalToString } from "@fairhour/money";
import { InvalidInputError } from "../errors";
import { cloneJson } from "../internal/json";
import { mapRecord } from "../internal/records";
import { toSchemaIssues } from "../internal/zod-issues";
import { InvoiceInputJsonSchema } from "./schema";
import type {
  InvoiceInput,
  InvoiceInputJson,
  LineTaxTreatment,
  LineTaxTreatmentJson,
} from "./types";

/** JSON form -> typed form. @throws InvalidInputError with every issue found */
export function parseInvoiceInput(json: unknown): InvoiceInput {
  const result = InvoiceInputJsonSchema.safeParse(json);
  if (!result.success) throw new InvalidInputError(toSchemaIssues(result.error.issues));
  return result.data;
}

function treatmentToJson(treatment: LineTaxTreatment): LineTaxTreatmentJson {
  switch (treatment.kind) {
    case "standard":
    case "excluded":
      return { kind: treatment.kind };
    case "rate":
      return { kind: "rate", rate: decimalToString(treatment.rate) };
    case "exempt":
    case "out-of-scope":
      return treatment.reference === undefined
        ? { kind: treatment.kind }
        : { kind: treatment.kind, reference: treatment.reference };
  }
}

/**
 * Typed form -> JSON form (decimal strings that keep their scale, every default written out).
 * `parseInvoiceInput(invoiceInputToJson(x))` equals `validateInvoiceInput(x)`.
 */
export function invoiceInputToJson(input: InvoiceInput): InvoiceInputJson {
  const json: InvoiceInputJson = {
    issueDate: input.issueDate,
    documentKind: input.documentKind,
    currency: input.currency,
    client: {
      country: input.client.country,
      kind: input.client.kind,
      isWithholdingAgent: input.client.isWithholdingAgent,
      ...(input.client.vatId === undefined ? {} : { vatId: input.client.vatId }),
    },
    lines: input.lines.map((line) => ({
      id: line.id,
      kind: line.kind,
      description: line.description,
      quantity: decimalToString(line.quantity),
      unit: line.unit,
      unitPrice: decimalToString(line.unitPrice.amount),
      treatment: treatmentToJson(line.treatment),
    })),
  };
  if (input.options !== undefined)
    json.options = mapRecord(input.options, (value) => cloneJson(value));
  if (input.exchangeRates !== undefined) {
    json.exchangeRates = input.exchangeRates.map((record) => ({
      from: record.from,
      rate: decimalToString(record.rate),
      date: record.date,
      ...(record.source === undefined ? {} : { source: record.source }),
    }));
  }
  return json;
}
