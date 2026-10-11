import { describe, expect, it } from "vitest";
import { computeInvoice } from "../engine/compute";
import { isDeeplyFrozen } from "../engine/freeze";
import { InvalidInputError } from "../errors";
import { parseInvoiceInput } from "../input/json";
import { message, p } from "../messages/params";
import { isoDate } from "../primitives";
import { testPack } from "../testing/test-pack";
import { InvoiceComputationJsonSchema, computationFromJson, computationToJson } from "./json";
import type { InvoiceComputation } from "./types";

const computation: InvoiceComputation = computeInvoice(
  testPack,
  { taxScope: "per-line" },
  parseInvoiceInput({
    issueDate: "2023-06-01",
    documentKind: "credit-note",
    currency: "EUR",
    client: { country: "IT", kind: "business", isWithholdingAgent: true, vatId: "IT01234567890" },
    lines: [
      {
        id: "l1",
        kind: "service",
        description: "Design",
        quantity: "2.5",
        unit: "hour",
        unitPrice: "50.00",
      },
      {
        id: "l2",
        kind: "expense",
        description: "Travel",
        quantity: "1",
        unit: "item",
        unitPrice: "30",
        treatment: { kind: "rate", rate: "10" },
      },
      {
        id: "l3",
        kind: "service",
        description: "Training",
        quantity: "1",
        unit: "item",
        unitPrice: "40",
        treatment: { kind: "exempt", reference: "art. 10" },
      },
      {
        id: "l4",
        kind: "mileage",
        description: "Trip",
        quantity: "100",
        unit: "km",
        unitPrice: "0.4253",
        treatment: { kind: "out-of-scope" },
      },
      {
        id: "l5",
        kind: "reimbursement",
        description: "Fee",
        quantity: "1",
        unit: "item",
        unitPrice: "16",
      },
    ],
    exchangeRates: [{ from: "USD", rate: "0.92", date: "2023-05-31", source: "ECB" }],
  }),
);

type Json = Record<string, unknown>;
const jsonOf = (c: InvoiceComputation): Json =>
  JSON.parse(JSON.stringify(computationToJson(c))) as Json;

describe("computation JSON", () => {
  it("writes amounts as decimal strings in the invoice currency, keys in type order", () => {
    const json = jsonOf(computation);
    expect(Object.keys(json)[0]).toBe("schemaVersion");
    expect(json.subtotal).toBe("253.53"); // 125.00 + 30.00 + 40.00 + 42.53 + 16.00
    const lines = json.lines as Json[];
    expect(lines[0]).toMatchObject({
      quantity: "2.5",
      unitPrice: "50.00",
      net: "125.00",
      groupId: "vat-20",
    });
    expect(lines[1]?.treatment).toEqual({ kind: "rate", rate: "10" });
    expect(lines[2]?.treatment).toEqual({ kind: "exempt", reference: "art. 10" });
    const components = json.components as Json[];
    expect(Object.keys(components[0] ?? {})).toEqual([
      "id",
      "ruleId",
      "kind",
      "label",
      "effect",
      "base",
      "rate",
      "amount",
      "allocations",
      "sources",
    ]);
    expect(components[0]?.label).toEqual({
      key: "xx.contribution.label",
      params: { rate: { type: "percent", value: "10" } },
    });
    expect(JSON.stringify(json)).not.toMatch(/"amount":\d/);
  });

  it("round-trips to an equal, deeply frozen computation", () => {
    const back = computationFromJson(jsonOf(computation));
    expect(back).toEqual(computation);
    expect(isDeeplyFrozen(back)).toBe(true);
    expect(JSON.stringify(computationToJson(back))).toBe(
      JSON.stringify(computationToJson(computation)),
    );
  });

  it("is byte-stable across computations of the same input", () => {
    const first = computeInvoice(
      testPack,
      { taxScope: "per-line" },
      parseInvoiceInput(jsonOfInput()),
    );
    const second = computeInvoice(
      testPack,
      { taxScope: "per-line" },
      parseInvoiceInput(jsonOfInput()),
    );
    expect(first).not.toBe(second);
    expect(JSON.stringify(computationToJson(second))).toBe(
      JSON.stringify(computationToJson(first)),
    );
  });

  it("round-trips every message parameter type", () => {
    const params = {
      a: p.money(computation.total),
      b: p.price(computation.lines[0]!.unitPrice),
      c: p.decimal(computation.lines[0]!.quantity),
      d: p.percent(
        computation.lines[1]!.treatment.kind === "rate"
          ? computation.lines[1]!.treatment.rate
          : computation.lines[0]!.quantity,
      ),
      e: p.date(isoDate("2023-06-01")),
      f: p.text("free text"),
      g: p.message(message("nested", { h: p.money(computation.subtotal) })),
    };
    const extended: InvoiceComputation = {
      ...computation,
      trace: [
        ...computation.trace,
        {
          step: computation.trace.length + 1,
          ruleId: "core",
          message: message("all", params),
          sources: [],
        },
      ],
      vatSummary: computation.vatSummary.map((entry) => ({ ...entry, reference: message("ref") })),
    };
    expect(computationFromJson(jsonOf(extended))).toEqual(extended);
  });

  it.each<[string, (json: Json) => void, string]>([
    ["an unknown currency", (json) => (json.currency = "EURO"), "invalid-currency"],
    ["a malformed amount", (json) => (json.total = "12,00"), "invalid_format"],
    ["a too precise amount", (json) => (json.total = "1.001"), "invalid-amount"],
    ["a negative amount", (json) => (json.total = "-1.00"), "invalid-amount"],
    ["a bad date", (json) => (json.issueDate = "2023-02-30"), "invalid-date"],
    ["a bad country", (json) => ((json.client as Json).country = "XX"), "invalid-country"],
    [
      "a bad exchange currency",
      (json) => ((json.exchangeRates as Json[])[0]!.from = "ABC"),
      "invalid-currency",
    ],
    [
      "a too long decimal",
      (json) => ((json.lines as Json[])[0]!.quantity = "1".repeat(90)),
      "invalid-decimal",
    ],
    [
      "a too long price",
      (json) => ((json.lines as Json[])[0]!.unitPrice = "1".repeat(90)),
      "invalid-decimal",
    ],
    [
      "a bad verification date",
      (json) => {
        const source = ((json.components as Json[])[0]!.sources as Json[])[0]!;
        source.verification = { status: "verified", on: "someday", against: "secondary" };
      },
      "invalid-date",
    ],
    ["an unknown key", (json) => (json.extra = 1), "unrecognized_keys"],
    ["another schema version", (json) => (json.schemaVersion = 2), "invalid_value"],
    [
      "a bad money parameter",
      (json) => {
        ((json.components as Json[])[0]!.label as Json).params = {
          a: { type: "money", value: "1.001" },
        };
      },
      "invalid-amount",
    ],
  ])("rejects %s", (_label, tamper, code) => {
    const json = jsonOf(computation);
    tamper(json);
    try {
      computationFromJson(json);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidInputError);
      expect((error as InvalidInputError).issues.map((issue) => issue.code)).toContain(code);
    }
  });

  it("rejects a 20,000-level message with InvalidInputError, never a stack overflow", () => {
    const json = jsonOf(computation);
    (json.trace as Json[])[0]!.message = deepMessage(20_000);
    try {
      computationFromJson(json);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidInputError);
      const [issue] = (error as InvalidInputError).issues;
      expect(issue?.code).toBe("too-deep");
      expect(issue?.path.slice(0, 3)).toEqual(["trace", 0, "message"]);
    }
  });

  it.each<[string, (json: Json) => void, string, readonly (string | number)[]]>([
    [
      "totals that do not reconcile",
      (json) => {
        json.total = "1.00";
      },
      "reconciliation-failed",
      [],
    ],
    [
      "a duplicate line id",
      (json) => {
        (json.lines as Json[])[1]!.id = "l1";
      },
      "duplicate-id",
      ["lines", 1, "id"],
    ],
    [
      "a duplicate component id",
      (json) => {
        const components = json.components as Json[];
        components[1]!.id = components[0]!.id;
      },
      "duplicate-id",
      ["components", 1, "id"],
    ],
    [
      "a duplicate legal note id",
      (json) => {
        const notes = json.legalNotes as Json[];
        notes[1]!.id = notes[0]!.id;
      },
      "duplicate-id",
      ["legalNotes", 1, "id"],
    ],
    [
      "a duplicate warning code",
      (json) => {
        const warnings = json.warnings as Json[];
        warnings.push({ ...warnings[0]! });
      },
      "duplicate-id",
      ["warnings", 1, "code"],
    ],
    [
      "a negative quantity",
      (json) => {
        (json.lines as Json[])[0]!.quantity = "-2.5";
      },
      "out-of-range",
      ["lines", 0, "quantity"],
    ],
    [
      "a negative unit price",
      (json) => {
        (json.lines as Json[])[0]!.unitPrice = "-50.00";
      },
      "out-of-range",
      ["lines", 0, "unitPrice"],
    ],
    [
      "a negative line rate",
      (json) => {
        (json.lines as Json[])[1]!.treatment = { kind: "rate", rate: "-10" };
      },
      "out-of-range",
      ["lines", 1, "treatment", "rate"],
    ],
    [
      "a negative component rate",
      (json) => {
        (json.components as Json[])[0]!.rate = "-10";
      },
      "out-of-range",
      ["components", 0, "rate"],
    ],
    [
      "a negative summary rate",
      (json) => {
        (json.vatSummary as Json[])[0]!.rate = "-20";
      },
      "out-of-range",
      ["vatSummary", 0, "rate"],
    ],
    [
      "a zero exchange rate",
      (json) => {
        (json.exchangeRates as Json[])[0]!.rate = "0";
      },
      "out-of-range",
      ["exchangeRates", 0, "rate"],
    ],
    [
      "an http source URL",
      (json) => {
        const source = ((json.components as Json[])[0]!.sources as Json[])[0]!;
        source.url = "http://example.com/act";
      },
      "invalid-source",
      ["components", 0, "sources", 0],
    ],
    [
      "a blank source title in a trace step",
      (json) => {
        const step = (json.trace as Json[]).find((item) => (item.sources as Json[]).length > 0)!;
        (step.sources as Json[])[0]!.title = "   ";
      },
      "invalid-source",
      ["trace"],
    ],
    [
      "a blank source citation in a legal note",
      (json) => {
        ((json.legalNotes as Json[])[0]!.sources as Json[])[0]!.citation = " ";
      },
      "invalid-source",
      ["legalNotes", 0, "sources", 0],
    ],
    [
      "a message nested deeper than MAX_MESSAGE_DEPTH",
      (json) => {
        (json.warnings as Json[])[0]!.message = deepMessage(5);
      },
      "invalid-message",
      ["warnings", 0, "message"],
    ],
    [
      "a summary reference nested too deep",
      (json) => {
        (json.vatSummary as Json[])[0]!.reference = deepMessage(5);
      },
      "invalid-message",
      ["vatSummary", 0, "reference"],
    ],
    [
      "a trace formula nested too deep",
      (json) => {
        (json.trace as Json[])[0]!.formula = deepMessage(5);
      },
      "invalid-message",
      ["trace", 0, "formula"],
    ],
  ])("rejects %s", (_label, tamper, code, path) => {
    const json = jsonOf(computation);
    tamper(json);
    try {
      computationFromJson(json);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidInputError);
      const issue = (error as InvalidInputError).issues.find((found) => found.code === code);
      expect(issue, JSON.stringify((error as InvalidInputError).issues)).toBeDefined();
      expect(issue?.path.slice(0, path.length)).toEqual(path);
    }
  });

  it("reports every consistency problem, not only the first", () => {
    const json = jsonOf(computation);
    (json.lines as Json[])[1]!.id = "l1";
    (json.lines as Json[])[0]!.quantity = "-2.5";
    json.total = "1.00";
    try {
      computationFromJson(json);
      expect.unreachable();
    } catch (error) {
      const found = new Set((error as InvalidInputError).issues.map((issue) => issue.code));
      expect([...found].sort()).toEqual(["duplicate-id", "out-of-range", "reconciliation-failed"]);
    }
  });

  it("exposes the zod schema", () => {
    expect(InvoiceComputationJsonSchema.safeParse(jsonOf(computation)).success).toBe(true);
    expect(InvoiceComputationJsonSchema.safeParse({}).success).toBe(false);
  });
});

/** A message ref in JSON form with `levels` nested messages. */
function deepMessage(levels: number): Json {
  let deep: Json = { key: "leaf" };
  for (let level = 0; level < levels; level += 1) {
    deep = { key: "nested", params: { next: { type: "message", value: deep } } };
  }
  return deep;
}

function jsonOfInput(): unknown {
  return {
    issueDate: "2023-06-01",
    currency: "EUR",
    client: { country: "IT", kind: "business", isWithholdingAgent: true },
    lines: [
      {
        id: "l1",
        kind: "service",
        description: "Design",
        quantity: "2.5",
        unit: "hour",
        unitPrice: "50.00",
      },
    ],
  };
}
