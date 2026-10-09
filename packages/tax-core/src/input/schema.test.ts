import { decimal, price } from "@fairhour/money";
import { describe, expect, it } from "vitest";
import { InvalidInputError, type SchemaIssue } from "../errors";
import { isDeeplyFrozen } from "../engine/freeze";
import { countryCode, isoDate } from "../primitives";
import { invoiceInputToJson, parseInvoiceInput } from "./json";
import { InvoiceInputJsonSchema, MAX_INVOICE_LINES, validateInvoiceInput } from "./schema";
import type { InvoiceInput, InvoiceInputJson, InvoiceLineInput } from "./types";

const baseJson = (): InvoiceInputJson => ({
  issueDate: "2026-03-15",
  currency: "EUR",
  client: { country: "IT", kind: "business", isWithholdingAgent: true, vatId: "01234567890" },
  lines: [
    {
      id: "l1",
      kind: "service",
      description: "Design",
      quantity: "20",
      unit: "hour",
      unitPrice: "50",
    },
  ],
});

const line = (overrides: Partial<InvoiceLineInput> = {}): InvoiceLineInput => ({
  id: "l1",
  kind: "service",
  description: "Design",
  quantity: decimal("20"),
  unit: "hour",
  unitPrice: price("50", "EUR"),
  treatment: { kind: "standard" },
  ...overrides,
});

const typed = (overrides: Partial<InvoiceInput> = {}): InvoiceInput => ({
  issueDate: isoDate("2026-03-15"),
  documentKind: "invoice",
  currency: "EUR",
  client: { country: countryCode("IT"), kind: "business", isWithholdingAgent: true },
  lines: [line()],
  ...overrides,
});

function issuesOf(run: () => unknown): readonly SchemaIssue[] {
  try {
    run();
  } catch (error) {
    if (error instanceof InvalidInputError) return error.issues;
    throw error;
  }
  throw new Error("expected InvalidInputError");
}

const codes = (run: () => unknown): string[] => issuesOf(run).map((issue) => issue.code);

describe("parseInvoiceInput (JSON form)", () => {
  it("parses and fills the defaults", () => {
    const input = parseInvoiceInput({
      ...baseJson(),
      lines: [
        ...baseJson().lines,
        {
          id: "l2",
          kind: "reimbursement",
          description: "Fee",
          quantity: "1",
          unit: "item",
          unitPrice: "16.00",
        },
      ],
    });
    expect(input.documentKind).toBe("invoice");
    expect(input.lines[0]?.treatment).toEqual({ kind: "standard" });
    expect(input.lines[1]?.treatment).toEqual({ kind: "excluded" });
    expect(input.lines[1]?.unitPrice).toEqual(price("16.00", "EUR"));
    expect(input.client.vatId).toBe("01234567890");
    expect(isDeeplyFrozen(input)).toBe(true);
  });

  it("keeps every treatment, options and exchange records", () => {
    const input = parseInvoiceInput({
      ...baseJson(),
      documentKind: "credit-note",
      lines: [
        { ...baseJson().lines[0]!, id: "a", treatment: { kind: "rate", rate: "10" } },
        { ...baseJson().lines[0]!, id: "b", treatment: { kind: "exempt", reference: "art. 10" } },
        { ...baseJson().lines[0]!, id: "c", treatment: { kind: "out-of-scope" } },
        { ...baseJson().lines[0]!, id: "d", treatment: { kind: "excluded" } },
      ],
      options: { stampDuty: "absorb", nested: { list: [1, true, null] } },
      exchangeRates: [
        { from: "USD", rate: "0.92", date: "2026-03-14", source: "ECB reference rate" },
      ],
    });
    expect(input.lines.map((item) => item.treatment)).toEqual([
      { kind: "rate", rate: decimal("10") },
      { kind: "exempt", reference: "art. 10" },
      { kind: "out-of-scope" },
      { kind: "excluded" },
    ]);
    expect(input.options).toEqual({ stampDuty: "absorb", nested: { list: [1, true, null] } });
    expect(input.exchangeRates).toEqual([
      { from: "USD", rate: decimal("0.92"), date: "2026-03-14", source: "ECB reference rate" },
    ]);
  });

  it.each<[string, (json: InvoiceInputJson) => unknown, string[]]>([
    ["invalid-date", (json) => ({ ...json, issueDate: "2026-02-30" }), ["invalid-date"]],
    ["invalid-currency", (json) => ({ ...json, currency: "EURO" }), ["invalid-currency"]],
    [
      "out-of-range quantity",
      (json) => ({ ...json, lines: [{ ...json.lines[0]!, quantity: "-1" }] }),
      ["out-of-range"],
    ],
    [
      "out-of-range quantity (too large)",
      (json) => ({ ...json, lines: [{ ...json.lines[0]!, quantity: "1000000001" }] }),
      ["out-of-range"],
    ],
    [
      "out-of-range price",
      (json) => ({ ...json, lines: [{ ...json.lines[0]!, unitPrice: "1000000000000.01" }] }),
      ["out-of-range"],
    ],
    [
      "too-precise quantity",
      (json) => ({ ...json, lines: [{ ...json.lines[0]!, quantity: "1.123456789" }] }),
      ["too-precise"],
    ],
    [
      "too-precise price",
      (json) => ({ ...json, lines: [{ ...json.lines[0]!, unitPrice: "0.000000001" }] }),
      ["too-precise"],
    ],
    [
      "invalid-decimal",
      (json) => ({ ...json, lines: [{ ...json.lines[0]!, quantity: "1,5" }] }),
      ["invalid-decimal"],
    ],
    [
      "too many digits",
      (json) => ({ ...json, lines: [{ ...json.lines[0]!, quantity: "1".repeat(81) }] }),
      ["out-of-range"],
    ],
    [
      "duplicate-line-id",
      (json) => ({ ...json, lines: [json.lines[0]!, json.lines[0]!] }),
      ["duplicate-line-id"],
    ],
    [
      "invalid-line-id",
      (json) => ({ ...json, lines: [{ ...json.lines[0]!, id: "line 1" }] }),
      ["invalid-line-id"],
    ],
    [
      "invalid-line-id (too long)",
      (json) => ({ ...json, lines: [{ ...json.lines[0]!, id: "x".repeat(65) }] }),
      ["invalid-line-id"],
    ],
    [
      "invalid-rate (above 100)",
      (json) => ({
        ...json,
        lines: [{ ...json.lines[0]!, treatment: { kind: "rate", rate: "100.5" } }],
      }),
      ["invalid-rate"],
    ],
    [
      "invalid-rate (negative)",
      (json) => ({
        ...json,
        lines: [{ ...json.lines[0]!, treatment: { kind: "rate", rate: "-1" } }],
      }),
      ["invalid-rate"],
    ],
    [
      "invalid-rate (scale)",
      (json) => ({
        ...json,
        lines: [{ ...json.lines[0]!, treatment: { kind: "rate", rate: "7.12345" } }],
      }),
      ["invalid-rate"],
    ],
    [
      "invalid rate syntax",
      (json) => ({
        ...json,
        lines: [{ ...json.lines[0]!, treatment: { kind: "rate", rate: "ten" } }],
      }),
      ["invalid-decimal"],
    ],
    [
      "invalid-country",
      (json) => ({ ...json, client: { ...json.client, country: "UK" } }),
      ["invalid-country"],
    ],
    [
      "invalid-vat-id",
      (json) => ({ ...json, client: { ...json.client, vatId: "IT 0123" } }),
      ["invalid-vat-id"],
    ],
    [
      "invalid-vat-id (too long)",
      (json) => ({ ...json, client: { ...json.client, vatId: "1".repeat(33) } }),
      ["invalid-vat-id"],
    ],
    [
      "invalid-exchange-rate (zero)",
      (json) => ({ ...json, exchangeRates: [{ from: "USD", rate: "0", date: "2026-03-14" }] }),
      ["invalid-exchange-rate"],
    ],
    [
      "invalid-exchange-rate (same currency)",
      (json) => ({ ...json, exchangeRates: [{ from: "EUR", rate: "1", date: "2026-03-14" }] }),
      ["invalid-exchange-rate"],
    ],
    [
      "invalid-exchange-rate (unknown currency)",
      (json) => ({ ...json, exchangeRates: [{ from: "XYZ", rate: "1", date: "2026-03-14" }] }),
      ["invalid-exchange-rate"],
    ],
    [
      "exchange date",
      (json) => ({ ...json, exchangeRates: [{ from: "USD", rate: "1.1", date: "yesterday" }] }),
      ["invalid-date"],
    ],
    [
      "exchange rate syntax",
      (json) => ({ ...json, exchangeRates: [{ from: "USD", rate: "x", date: "2026-03-14" }] }),
      ["invalid-decimal"],
    ],
    [
      "too-many-lines",
      (json) => ({
        ...json,
        lines: Array.from({ length: MAX_INVOICE_LINES + 1 }, (_, index) => ({
          ...json.lines[0]!,
          id: `l${index}`,
        })),
      }),
      ["too-many-lines"],
    ],
    ["unknown keys (strict)", (json) => ({ ...json, discount: "10" }), ["unrecognized_keys"]],
    ["a wrong type", (json) => ({ ...json, lines: "none" }), ["invalid_type"]],
    [
      "an empty description",
      (json) => ({ ...json, lines: [{ ...json.lines[0]!, description: "" }] }),
      ["too_small"],
    ],
    [
      "an unknown treatment",
      (json) => ({ ...json, lines: [{ ...json.lines[0]!, treatment: { kind: "zero" } }] }),
      ["invalid_union"],
    ],
    ["non-JSON options", (json) => ({ ...json, options: { a: Number.NaN } }), ["invalid_union"]],
  ])("reports %s", (_label, mutate, expected) => {
    expect(codes(() => parseInvoiceInput(mutate(baseJson())))).toEqual(expected);
  });

  it("collects every issue with its path", () => {
    const issues = issuesOf(() =>
      parseInvoiceInput({
        ...baseJson(),
        issueDate: "2026-13-01",
        currency: "XXX",
        lines: [{ ...baseJson().lines[0]!, quantity: "-1.123456789" }],
      }),
    );
    expect(issues.map((found) => [found.code, found.path])).toEqual([
      ["invalid-date", ["issueDate"]],
      ["invalid-currency", ["currency"]],
      ["too-precise", ["lines", 0, "quantity"]],
      ["out-of-range", ["lines", 0, "quantity"]],
    ]);
  });

  it("accepts the bounds", () => {
    const input = parseInvoiceInput({
      ...baseJson(),
      lines: [
        { ...baseJson().lines[0]!, quantity: "1000000000", unitPrice: "1000000000000" },
        {
          ...baseJson().lines[0]!,
          id: "z",
          quantity: "0",
          unitPrice: "0.00000001",
          treatment: { kind: "rate", rate: "100" },
        },
      ],
    });
    expect(input.lines).toHaveLength(2);
    expect(parseInvoiceInput({ ...baseJson(), lines: [] }).lines).toEqual([]);
  });

  it("exposes the issue code on the zod schema", () => {
    const result = InvoiceInputJsonSchema.safeParse({ ...baseJson(), issueDate: "nope" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      code: "custom",
      params: { code: "invalid-date" },
      path: ["issueDate"],
    });
  });
});

describe("validateInvoiceInput (typed form)", () => {
  it("returns a normalized, frozen copy and never freezes the caller's objects", () => {
    const input = { ...typed(), extra: "dropped" } as InvoiceInput;
    const result = validateInvoiceInput(input);
    expect(result).toEqual(typed());
    expect("extra" in result).toBe(false);
    expect(isDeeplyFrozen(result)).toBe(true);
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(input.lines)).toBe(false);
  });

  it("copies hand-built decimals instead of freezing them", () => {
    const quantity = { coefficient: 15n, scale: 1 };
    const result = validateInvoiceInput(typed({ lines: [line({ quantity })] }));
    expect(result.lines[0]?.quantity).toEqual(decimal("1.5"));
    expect(Object.isFrozen(quantity)).toBe(false);
  });

  it("keeps options, exchange records, treatments and the VAT id", () => {
    const input = typed({
      client: {
        country: countryCode("DE"),
        kind: "public-administration",
        isWithholdingAgent: false,
        vatId: "DE123",
      },
      lines: [
        line({ id: "a", treatment: { kind: "rate", rate: decimal("7") } }),
        line({ id: "b", treatment: { kind: "exempt", reference: "§ 4" } }),
        line({ id: "c", treatment: { kind: "out-of-scope" } }),
      ],
      options: { flag: true },
      exchangeRates: [{ from: "CHF", rate: decimal("1.05"), date: isoDate("2026-03-14") }],
    });
    expect(validateInvoiceInput(input)).toEqual(input);
  });

  it.each<[string, Partial<InvoiceInput>, string[]]>([
    [
      "currency-mismatch",
      { lines: [line({ unitPrice: price("50", "USD") })] },
      ["currency-mismatch"],
    ],
    ["negative quantity", { lines: [line({ quantity: decimal("-1") })] }, ["out-of-range"]],
    [
      "too-precise price",
      { lines: [line({ unitPrice: price("1.000000001", "EUR") })] },
      ["too-precise"],
    ],
    ["invalid-date", { issueDate: "2026-02-30" as InvoiceInput["issueDate"] }, ["invalid-date"]],
    [
      "invalid-currency (no price check)",
      { currency: "EURO" as InvoiceInput["currency"] },
      ["invalid-currency"],
    ],
    [
      "a non-Decimal quantity",
      { lines: [line({ quantity: 20 as unknown as InvoiceLineInput["quantity"] })] },
      ["custom"],
    ],
    [
      "a non-Price unit price",
      { lines: [line({ unitPrice: "50" as unknown as InvoiceLineInput["unitPrice"] })] },
      ["custom"],
    ],
    [
      "an unknown kind",
      { documentKind: "receipt" as InvoiceInput["documentKind"] },
      ["invalid_value"],
    ],
  ])("reports %s", (_label, overrides, expected) => {
    expect(codes(() => validateInvoiceInput(typed(overrides)))).toEqual(expected);
  });
});

describe("invoiceInputToJson", () => {
  it("round-trips through parseInvoiceInput, keeping decimal scales", () => {
    const input = typed({
      documentKind: "credit-note",
      client: {
        country: countryCode("IT"),
        kind: "individual",
        isWithholdingAgent: false,
        vatId: "X1",
      },
      lines: [
        line({
          quantity: decimal("1.50"),
          unitPrice: price("0.4253", "EUR"),
          treatment: { kind: "rate", rate: decimal("5.5") },
        }),
        line({ id: "l2", treatment: { kind: "exempt", reference: "art. 10" } }),
        line({ id: "l3", treatment: { kind: "out-of-scope" } }),
        line({ id: "l4", kind: "reimbursement", treatment: { kind: "excluded" } }),
      ],
      options: { a: [1, { b: null }] },
      exchangeRates: [
        { from: "USD", rate: decimal("0.920"), date: isoDate("2026-03-14") },
        { from: "GBP", rate: decimal("1.17"), date: isoDate("2026-03-14"), source: "ECB" },
      ],
    });
    const json = invoiceInputToJson(input);
    expect(json.lines[0]).toMatchObject({
      quantity: "1.50",
      unitPrice: "0.4253",
      treatment: { kind: "rate", rate: "5.5" },
    });
    expect(json.exchangeRates?.[0]).toEqual({ from: "USD", rate: "0.920", date: "2026-03-14" });
    expect(parseInvoiceInput(JSON.parse(JSON.stringify(json)))).toEqual(
      validateInvoiceInput(input),
    );
    const minimal = invoiceInputToJson(typed());
    expect(Object.keys(minimal)).toEqual([
      "issueDate",
      "documentKind",
      "currency",
      "client",
      "lines",
    ]);
  });
});
