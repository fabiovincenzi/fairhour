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
    const exact = (input: InvoiceInput): InvoiceInput => {
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
    };
    fc.assert(
      fc.property(cases(["invoice"]), fc.integer({ min: 2, max: 5 }), (item, k) => {
        const config = { ...item.config, contribution: false, fixedCharge: "absorb" };
        const input = exact(item.input);
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
        // Per group, each tax is within one unit of its exact value (any mode), so
        // |tax(k·x) − k·tax(x)| < 1 + k per taxable group.
        const groups = BigInt(
          one.vatSummary.filter((entry) => entry.treatment === "taxable").length,
        );
        const difference = many.taxTotal.amount - one.taxTotal.amount * factor;
        const absolute = difference < 0n ? -difference : difference;
        expect(absolute <= groups * (factor + 1n)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
