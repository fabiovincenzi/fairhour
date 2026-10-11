import {
  decimal,
  decimalToString,
  isMoney,
  minorUnitExponent,
  multiplyDecimal,
  price,
  rescaleDecimal,
  type CurrencyCode,
} from "@fairhour/money";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { computationToJson } from "../computation/json";
import { invoiceInputArbitrary } from "../conformance/arbitraries";
import { amountsOf } from "../conformance/util";
import type { InvoiceComputation } from "../computation/types";
import { parseInvoiceInput } from "../input/json";
import type { InvoiceInput } from "../input/types";
import { countryCode, isoDate } from "../primitives";
import { testPack } from "../testing/test-pack";
import { computeInvoice } from "./compute";
import { isDeeplyFrozen } from "./freeze";
import { reconciliationFailures } from "./reconcile";

const CONFIGS = [
  {},
  { taxScope: "per-line" },
  { rounding: "halfEven" },
  { fixedCharge: "absorb", contribution: false },
  { rounding: "up" },
];
const CURRENCIES: readonly CurrencyCode[] = ["EUR", "USD", "JPY", "KWD"];

const cases = (documentKinds?: readonly ("invoice" | "credit-note")[]) =>
  fc.record({
    config: fc.constantFrom(...CONFIGS),
    options: fc.constantFrom({}, { skipWithholding: true }),
    input: fc.constantFrom(...CURRENCIES).chain((currency) =>
      invoiceInputArbitrary({
        currency,
        dateRange: { from: isoDate("2020-01-01"), to: isoDate("2026-12-31") },
        clientCountries: [countryCode("IT"), countryCode("US"), countryCode("JP")],
        ...(documentKinds === undefined ? {} : { documentKinds }),
      }),
    ),
  });

const compute = (item: { config: object; options: object; input: InvoiceInput }) =>
  computeInvoice(testPack, item.config, { ...item.input, options: item.options as never });

/** Quantities rounded down to integers and unit prices to the minor unit: exact line totals. */
function exactInput(input: InvoiceInput): InvoiceInput {
  const exponent = minorUnitExponent(input.currency);
  return {
    ...input,
    lines: input.lines.map((line) => ({
      ...line,
      quantity: rescaleDecimal(line.quantity, 0, "down"),
      unitPrice: price(
        decimalToString(rescaleDecimal(line.unitPrice.amount, exponent, "down")),
        input.currency,
      ),
    })),
  };
}

/**
 * Computes `item` (made exact) and the same invoice with every quantity times `k`, and asserts the
 * scaling invariant: the subtotal scales exactly, and the tax total within the rounding bound.
 * Each rounded tax is within one unit of its exact value in any mode, so one rounding gives
 * |tax(k·x) − k·tax(x)| < 1 + k. Taxes are rounded once per taxable group (per-group scope) or
 * once per item of the group, lines and non-tax allocations (per-line scope).
 */
function checkScaling(
  item: { config: object; options: object; input: InvoiceInput },
  k: number,
): { readonly one: InvoiceComputation; readonly many: InvoiceComputation } {
  const config = { ...item.config, contribution: false, fixedCharge: "absorb" };
  const input = exactInput(item.input);
  const scaled = {
    ...input,
    lines: input.lines.map((line) => ({
      ...line,
      quantity: multiplyDecimal(line.quantity, decimal(`${k}`)),
    })),
  };
  const one = compute({ ...item, config, input });
  const many = compute({ ...item, config, input: scaled });
  const factor = BigInt(k);
  expect(many.subtotal.amount).toBe(one.subtotal.amount * factor);
  const perLine = "taxScope" in config && config.taxScope === "per-line";
  let roundings = 0n;
  for (const entry of one.vatSummary) {
    if (entry.treatment !== "taxable") continue;
    if (!perLine) {
      roundings += 1n;
      continue;
    }
    const lines = one.lines.filter((line) => line.groupId === entry.groupId).length;
    const others = one.components.filter(
      (component) =>
        component.kind !== "tax" &&
        component.allocations.some((allocation) => allocation.groupId === entry.groupId),
    ).length;
    roundings += BigInt(lines + others);
  }
  const difference = many.taxTotal.amount - one.taxTotal.amount * factor;
  const absolute = difference < 0n ? -difference : difference;
  expect(absolute <= roundings * (factor + 1n), `|${difference}| > ${roundings} × ${k + 1}`).toBe(
    true,
  );
  return { one, many };
}

describe("computeInvoice properties (test pack)", () => {
  it("reconciles (R1 to R8) for random valid inputs", () => {
    fc.assert(
      fc.property(cases(), (item) => {
        expect(reconciliationFailures(compute(item))).toEqual([]);
      }),
      { numRuns: 150 },
    );
  });

  it("is deterministic, frozen and currency-consistent", () => {
    fc.assert(
      fc.property(cases(), (item) => {
        const first = compute(item);
        const second = compute(item);
        expect(JSON.stringify(computationToJson(second))).toBe(
          JSON.stringify(computationToJson(first)),
        );
        expect(isDeeplyFrozen(first)).toBe(true);
        for (const found of amountsOf(first))
          expect(found.value.currency).toBe(item.input.currency);
      }),
      { numRuns: 100 },
    );
  });

  it("never produces a negative amount for invoices", () => {
    fc.assert(
      fc.property(cases(["invoice"]), (item) => {
        const negatives = amountsOf(compute(item)).filter(
          (found) => isMoney(found.value) && found.value.amount < 0n,
        );
        expect(negatives).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });

  it("rounds every line total to the minor unit: within ½ (half modes) or 1 (directed modes) of quantity × unit price", () => {
    fc.assert(
      fc.property(cases(), (item) => {
        const c = compute(item);
        const half = !("rounding" in item.config) || item.config.rounding === "halfEven";
        for (const line of c.lines) {
          const exact = multiplyDecimal(line.quantity, line.unitPrice.amount);
          const unit = 10n ** BigInt(minorUnitExponent(c.currency));
          const scale = 10n ** BigInt(exact.scale);
          // |net / unit − exact| in units of 1 / (unit × scale), times 2.
          const distance = 2n * (line.net.amount * scale - exact.coefficient * unit);
          const absolute = distance < 0n ? -distance : distance;
          if (half) expect(absolute <= scale).toBe(true);
          else expect(absolute < 2n * scale).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("scales: k × quantities gives k × subtotal exactly and taxes within rounding", () => {
    fc.assert(
      fc.property(cases(["invoice"]), fc.integer({ min: 2, max: 5 }), (item, k) => {
        checkScaling(item, k);
      }),
      { numRuns: 100 },
    );
  });

  it("scales per-line taxes within one rounding per line (regression)", () => {
    // Three 0.03 goods lines taxed per line: 3 × round(0.006) = 0.03, and with k = 4,
    // 3 × round(0.024) = 0.06, so |tax(4x) − 4 tax(x)| = 0.06 (6 units). A bound of one rounding
    // per group (5 units) is wrong for per-line scope; one per line (15 units) holds.
    const input = parseInvoiceInput({
      issueDate: "2025-03-15",
      currency: "EUR",
      client: { country: "IT", kind: "individual", isWithholdingAgent: false },
      lines: ["a", "b", "c"].map((id) => ({
        id,
        kind: "goods" as const,
        description: id,
        quantity: "1",
        unit: "item" as const,
        unitPrice: "0.03",
      })),
    });
    const { one, many } = checkScaling({ config: { taxScope: "per-line" }, options: {}, input }, 4);
    expect(many.taxTotal.amount - one.taxTotal.amount * 4n).toBe(-6n);
  });
});
