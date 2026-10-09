/**
 * Some property checks can only fail when the engine itself is broken (it asserts the same
 * invariants on every computation). Here `computeInvoice` is wrapped so that each test can
 * corrupt its result, proving that each of those checks fails when it should.
 */
import { money } from "@fairhour/money";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InvoiceComputation } from "../computation/types";
import type * as ComputeModule from "../engine/compute";
import {
  invalidConfigs,
  invoiceOptions,
  sampleInputs,
  validConfigs,
} from "../testing/conformance-data";
import { testPack } from "../testing/test-pack";
import { runConformanceCheck, type ConformanceCheckId, type ConformanceOptions } from "./checks";

const control = vi.hoisted(() => ({
  corrupt: undefined as ((computation: InvoiceComputation) => InvoiceComputation) | undefined,
  /** What happens to engine errors: rethrown, replaced by a computation, or by a TypeError. */
  onError: "throw",
}));

vi.mock("../engine/compute", async (importOriginal) => {
  const actual = await importOriginal<typeof ComputeModule>();
  const fallback = (pack: Parameters<typeof actual.computeInvoice>[0]) =>
    actual.computeInvoice(pack, {}, {
      issueDate: "2025-01-10",
      documentKind: "invoice",
      currency: "EUR",
      client: { country: "IT", kind: "business", isWithholdingAgent: false },
      lines: [],
    } as never);
  return {
    computeInvoice: (...args: Parameters<typeof actual.computeInvoice>) => {
      let computation: InvoiceComputation;
      try {
        computation = actual.computeInvoice(...args);
      } catch (error) {
        if (control.onError === "throw") throw error;
        if (control.onError === "replace")
          throw new TypeError("not an engine error", { cause: error });
        computation = fallback(args[0]);
      }
      return control.corrupt === undefined ? computation : control.corrupt(computation);
    },
  };
});

const options: ConformanceOptions = {
  fixtures: [],
  validConfigs,
  invalidConfigs,
  sampleInputs,
  invoiceOptions,
  input: { currencies: ["EUR"] },
  properties: { numRuns: 5 },
};

const failuresOf = (id: ConformanceCheckId): string =>
  runConformanceCheck(testPack, options, id).failures.join("\n");

afterEach(() => {
  control.corrupt = undefined;
  control.onError = "throw";
});

describe("property checks against a corrupted engine", () => {
  it("passes without corruption", () => {
    expect(failuresOf("property.non-negative")).toBe("");
  });

  it.each<[ConformanceCheckId, (c: InvoiceComputation) => InvoiceComputation, RegExp]>([
    [
      "property.non-negative",
      (c) => ({ ...c, total: money(-1n, c.currency) }),
      /total is negative/,
    ],
    [
      "property.currency",
      (c) => ({ ...c, subtotal: money(c.subtotal.amount, "USD") }),
      /subtotal is in USD, not EUR/,
    ],
    ["property.immutability", (c) => ({ ...c }), /not deeply frozen/],
    [
      "property.trace",
      (c) => ({ ...c, trace: c.trace.map((step) => ({ ...step, step: step.step + 1 })) }),
      /trace\[0\] is numbered 2/,
    ],
    [
      "property.trace",
      (c) => ({
        ...c,
        components: [
          ...c.components,
          {
            id: "ghost",
            ruleId: "xx.tax",
            kind: "other",
            label: { key: "xx.tax.label" },
            effect: "informational",
            base: c.subtotal,
            amount: c.subtotal,
            allocations: [],
            sources: [],
          },
        ],
      }),
      /"ghost" has no trace step by its rule/,
    ],
    ["property.json", (c) => ({ ...c, unknown: true }) as InvoiceComputation, /differs from c/],
    [
      "property.reconciliation",
      (c) => ({ ...c, netPayable: money(c.netPayable.amount + 1n, c.currency) }),
      /R5 netPayable = total − Σ deducted-from-payable: expected/,
    ],
  ])("%s detects the corruption", (id, corrupt, pattern) => {
    control.corrupt = corrupt;
    expect(failuresOf(id)).toMatch(pattern);
  });

  it("property.invalid-input detects malformed inputs that are accepted", () => {
    control.onError = "swallow";
    expect(failuresOf("property.invalid-input")).toMatch(/a negative quantity was accepted/);
  });

  it("property.invalid-input requires InvalidInputError, not another error", () => {
    control.onError = "replace";
    expect(failuresOf("property.invalid-input")).toMatch(
      /expected InvalidInputError, got TypeError: not an engine error/,
    );
  });
});
