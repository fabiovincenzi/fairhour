import { decimal, money, toDecimalString } from "@fairhour/money";
import { describe, expect, it } from "vitest";
import {
  InvalidConfigError,
  InvalidInputError,
  InvalidOptionsError,
  ParameterNotFoundError,
  ReconciliationError,
  RuleContractError,
  RuleExecutionError,
  UnsupportedInputError,
} from "../errors";
import { parseInvoiceInput } from "../input/json";
import type { InvoiceInputJson } from "../input/types";
import { message } from "../messages/params";
import { testPack } from "../testing/test-pack";
import { miniPack, miniRule } from "../testing/mini-pack";
import { ENGINE_VERSION } from "../version";
import { computeInvoice } from "./compute";
import { isDeeplyFrozen } from "./freeze";

const json = (overrides: Partial<InvoiceInputJson> = {}): InvoiceInputJson => ({
  issueDate: "2025-03-15",
  currency: "EUR",
  client: { country: "IT", kind: "business", isWithholdingAgent: true },
  lines: [
    {
      id: "l1",
      kind: "service",
      description: "Design",
      quantity: "10",
      unit: "hour",
      unitPrice: "100",
    },
  ],
  ...overrides,
});

const amounts = (c: ReturnType<typeof computeInvoice>): Record<string, string> => ({
  subtotal: toDecimalString(c.subtotal),
  taxableBase: toDecimalString(c.taxableBase),
  taxTotal: toDecimalString(c.taxTotal),
  total: toDecimalString(c.total),
  withholdingTotal: toDecimalString(c.withholdingTotal),
  netPayable: toDecimalString(c.netPayable),
});

describe("computeInvoice", () => {
  it("builds the computation in the key order of the type", () => {
    const c = computeInvoice(
      testPack,
      {},
      parseInvoiceInput(
        json({ exchangeRates: [{ from: "USD", rate: "0.9", date: "2025-03-14" }] }),
      ),
    );
    expect(Object.keys(c)).toEqual([
      "schemaVersion",
      "engine",
      "pack",
      "parameters",
      "issueDate",
      "documentKind",
      "currency",
      "client",
      "exchangeRates",
      "lines",
      "subtotal",
      "components",
      "vatSummary",
      "taxableBase",
      "taxTotal",
      "total",
      "withholdingTotal",
      "netPayable",
      "legalNotes",
      "warnings",
      "trace",
    ]);
    expect(c.engine).toEqual({ name: "@fairhour/tax-core", version: ENGINE_VERSION });
    expect(c.pack).toEqual({ id: "xx", version: "1.0.0" });
    expect(c.parameters).toEqual({ id: "xx-2024-01-01", effectiveFrom: "2024-01-01" });
    expect(Object.keys(c.lines[0] ?? {})).toEqual([
      "id",
      "kind",
      "description",
      "quantity",
      "unit",
      "unitPrice",
      "treatment",
      "net",
      "groupId",
    ]);
    expect(amounts(c)).toEqual({
      subtotal: "1000.00",
      taxableBase: "1100.00",
      taxTotal: "220.00",
      total: "1320.00",
      withholdingTotal: "110.00",
      netPayable: "1210.00",
    });
  });

  it("numbers trace steps and adds the core steps", () => {
    const c = computeInvoice(testPack, {}, parseInvoiceInput(json()));
    expect(c.trace.map((step) => step.step)).toEqual(c.trace.map((_, index) => index + 1));
    expect(c.trace.map((step) => step.message.key)).toEqual([
      "core.line",
      "core.subtotal",
      "xx.classify.trace",
      "xx.contribution.trace",
      "xx.tax.trace",
      "xx.withholding.trace",
      "xx.fixed-charge.below",
      "core.total",
      "core.deductions",
      "core.net-payable",
    ]);
    expect(c.trace[0]?.sources).toEqual([]);
    expect(c.trace[3]?.sources.map((source) => source.id)).toEqual(["xx.contribution-act.art-3"]);
  });

  it("computes an empty invoice with the core.no-lines warning", () => {
    const c = computeInvoice(testPack, {}, parseInvoiceInput(json({ lines: [] })));
    expect(amounts(c)).toEqual({
      subtotal: "0.00",
      taxableBase: "0.00",
      taxTotal: "0.00",
      total: "0.00",
      withholdingTotal: "0.00",
      netPayable: "0.00",
    });
    expect(c.warnings.map((warning) => [warning.code, warning.ruleId])).toEqual([
      ["core.no-lines", "core"],
    ]);
    expect(c.trace.some((step) => step.message.key === "core.deductions")).toBe(false);
  });

  it("keeps positive magnitudes for credit notes", () => {
    const c = computeInvoice(
      testPack,
      {},
      parseInvoiceInput(json({ documentKind: "credit-note" })),
    );
    expect(c.documentKind).toBe("credit-note");
    expect(amounts(c).total).toBe("1320.00");
    expect(c.warnings.map((warning) => warning.code)).toEqual(["xx.credit-note"]);
  });

  it("rounds the tax per group or per line as configured", () => {
    const lines = ["a", "b", "c"].map((id) => ({
      id,
      kind: "service" as const,
      description: id,
      quantity: "1",
      unit: "item" as const,
      unitPrice: "0.05",
      treatment: { kind: "rate" as const, rate: "10" },
    }));
    const input = parseInvoiceInput(
      json({ lines, client: { country: "IT", kind: "individual", isWithholdingAgent: false } }),
    );
    const perGroup = computeInvoice(testPack, { contribution: false }, input);
    const perLine = computeInvoice(testPack, { contribution: false, taxScope: "per-line" }, input);
    expect(toDecimalString(perGroup.taxTotal)).toBe("0.02");
    expect(toDecimalString(perLine.taxTotal)).toBe("0.03");
  });

  it("applies per-invoice options", () => {
    const c = computeInvoice(
      testPack,
      {},
      parseInvoiceInput(json({ options: { skipWithholding: true } })),
    );
    expect(c.components.map((component) => component.id)).toEqual(["xx.contribution", "xx.tax"]);
    expect(c.trace.find((step) => step.ruleId === "xx.withholding")?.message.key).toBe(
      "xx.withholding.skipped",
    );
  });

  it("leaves no trace for skipped rules", () => {
    const c = computeInvoice(testPack, { contribution: false }, parseInvoiceInput(json()));
    expect(c.trace.some((step) => step.ruleId === "xx.contribution")).toBe(false);
    expect(c.components.some((component) => component.id === "xx.contribution")).toBe(false);
  });

  it("wraps exceptions of apply and appliesTo in RuleExecutionError", () => {
    const failing = miniRule(() => {
      throw new TypeError("boom");
    });
    const error = (() => {
      try {
        computeInvoice(miniPack([failing]), {}, parseInvoiceInput(json()));
      } catch (caught) {
        return caught;
      }
      return undefined;
    })();
    expect(error).toBeInstanceOf(RuleExecutionError);
    expect((error as RuleExecutionError).ruleId).toBe("mini.test");
    expect((error as RuleExecutionError).cause).toBeInstanceOf(TypeError);
    const guard = miniRule(() => ({}), {
      appliesTo: () => {
        throw new Error("guard");
      },
    });
    expect(() => computeInvoice(miniPack([guard]), {}, parseInvoiceInput(json()))).toThrow(
      RuleExecutionError,
    );
  });

  it("gives rules frozen state, context and configuration", () => {
    const mutating = miniRule((state, ctx) => {
      expect(Object.isFrozen(state.lines)).toBe(true);
      expect(Object.isFrozen(ctx)).toBe(true);
      expect(isDeeplyFrozen(ctx.input)).toBe(true);
      (ctx.config as { mode: string }).mode = "halfEven";
      return {};
    });
    expect(() => computeInvoice(miniPack([mutating]), {}, parseInvoiceInput(json()))).toThrow(
      RuleExecutionError,
    );
  });

  it("returns a deeply frozen result and never freezes the caller's values", () => {
    const config = { taxScope: "per-line" };
    const input = { ...parseInvoiceInput(json()) };
    const c = computeInvoice(testPack, config, input);
    expect(isDeeplyFrozen(c)).toBe(true);
    expect(Object.isFrozen(config)).toBe(false);
    expect(Object.isFrozen(input)).toBe(false);
  });

  it.each([
    ["invalid input", {}, json({ issueDate: "2025-02-30" }), InvalidInputError],
    ["an invalid configuration", { taxScope: "never" }, json(), InvalidConfigError],
    ["invalid options", {}, json({ options: { skipWithholding: 1 } }), InvalidOptionsError],
    ["an unsupported currency", {}, json({ currency: "GBP" }), UnsupportedInputError],
    ["a date before the parameters", {}, json({ issueDate: "2019-06-01" }), ParameterNotFoundError],
  ])("rejects %s", (_label, config, input, type) => {
    // Bypass parseInvoiceInput for the invalid date: validateInvoiceInput must catch it.
    const typed =
      input.issueDate === "2025-02-30"
        ? { ...parseInvoiceInput(json()), issueDate: input.issueDate }
        : parseInvoiceInput(input);
    expect(() => computeInvoice(testPack, config, typed as never)).toThrow(type);
  });

  it("rejects an invalid rounding policy", () => {
    const pack = miniPack([], { roundingPolicy: () => ({ step: "cash" }) as never });
    expect(() => computeInvoice(pack, {}, parseInvoiceInput(json()))).toThrow(RuleContractError);
  });

  it("rejects a pack whose taxes are computed before the contribution (R3)", () => {
    const tax = testPack.rules.find((rule) => rule.id === "xx.tax");
    const reordered = { ...testPack, rules: testPack.rules.filter((rule) => rule !== tax) };
    const misordered = {
      ...reordered,
      rules: [reordered.rules[0]!, tax!, ...reordered.rules.slice(1)],
    };
    try {
      computeInvoice(misordered, {}, parseInvoiceInput(json()));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ReconciliationError);
      expect((error as ReconciliationError).check).toBe("R3");
      expect((error as ReconciliationError).expected).toBe("1100.00 EUR");
      expect((error as ReconciliationError).actual).toBe("1000.00 EUR");
    }
  });

  it("rejects deductions larger than the total", () => {
    const greedy = miniRule(() => ({
      components: [
        {
          id: "w",
          kind: "withholding",
          label: message("mini.label"),
          effect: "deducted-from-payable",
          base: money(0n, "EUR"),
          amount: money(10_000_000n, "EUR"),
        },
      ],
      trace: [{ message: message("mini.trace"), componentId: "w" }],
    }));
    expect(() => computeInvoice(miniPack([greedy]), {}, parseInvoiceInput(json()))).toThrow(
      ReconciliationError,
    );
  });

  it("computes line totals with the lines rounding mode", () => {
    const input = parseInvoiceInput(
      json({
        lines: [
          {
            id: "l1",
            kind: "mileage",
            description: "Trip",
            quantity: "100",
            unit: "km",
            unitPrice: "0.4255",
          },
        ],
      }),
    );
    expect(toDecimalString(computeInvoice(miniPack([]), {}, input).subtotal)).toBe("42.55");
    const half = parseInvoiceInput(
      json({
        lines: [
          {
            id: "l1",
            kind: "mileage",
            description: "Trip",
            quantity: "10",
            unit: "km",
            unitPrice: "0.4125",
          },
        ],
      }),
    );
    expect(toDecimalString(computeInvoice(miniPack([]), { mode: "halfUp" }, half).subtotal)).toBe(
      "4.13",
    );
    expect(toDecimalString(computeInvoice(miniPack([]), { mode: "halfEven" }, half).subtotal)).toBe(
      "4.12",
    );
    expect(decimal("0.4125")).toEqual(half.lines[0]?.unitPrice.amount);
  });
});
