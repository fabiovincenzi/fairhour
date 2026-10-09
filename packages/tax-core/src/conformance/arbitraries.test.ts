import { compareDecimal, decimal, money, percentage, price } from "@fairhour/money";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { validateInvoiceInput } from "../input/schema";
import { message, p } from "../messages/params";
import { countryCode, isoDate } from "../primitives";
import { miniPack, miniRule } from "../testing/mini-pack";
import { testPack } from "../testing/test-pack";
import { decimalArbitrary, invoiceInputArbitrary, priceArbitrary } from "./arbitraries";
import { runConformanceCheck, type ConformanceOptions } from "./checks";
import { canonicalJson, deepEqual, structuralClone } from "./util";

describe("arbitraries", () => {
  it("generates decimals within bounds and scale", () => {
    fc.assert(
      fc.property(decimalArbitrary({ min: "-2.5", max: "10.25", maxScale: 3 }), (value) => {
        expect(value.scale).toBeLessThanOrEqual(3);
        expect(compareDecimal(value, decimal("-2.5"))).toBeGreaterThanOrEqual(0);
        expect(compareDecimal(value, decimal("10.25"))).toBeLessThanOrEqual(0);
      }),
    );
    // No integer lies in [0.5, 0.5]: scale 0 falls back to the minimum itself.
    fc.assert(
      fc.property(decimalArbitrary({ min: "0.5", max: "0.5", maxScale: 1 }), (value) => {
        expect(compareDecimal(value, decimal("0.5"))).toBe(0);
      }),
    );
    expect(() => decimalArbitrary({ min: "2", max: "1", maxScale: 0 })).toThrow(RangeError);
  });

  it("generates prices in the currency", () => {
    fc.assert(
      fc.property(priceArbitrary("JPY"), (value) => {
        expect(value.currency).toBe("JPY");
        expect(value.amount.scale).toBeLessThanOrEqual(4);
      }),
    );
    fc.assert(
      fc.property(priceArbitrary("EUR", { max: "1", maxScale: 0 }), (value) => {
        expect(["0", "1"]).toContain(`${value.amount.coefficient}`);
      }),
    );
  });

  it("generates valid invoice inputs", () => {
    const arbitrary = invoiceInputArbitrary({
      currency: "KWD",
      dateRange: { from: isoDate("2024-02-28"), to: isoDate("2024-03-01") },
      clientCountries: [countryCode("KW")],
      maxLines: 3,
      treatments: ["rate", "exempt"],
      documentKinds: ["credit-note"],
    });
    fc.assert(
      fc.property(arbitrary, (input) => {
        expect(validateInvoiceInput(input).lines.length).toBe(input.lines.length);
        expect(input.lines.length).toBeLessThanOrEqual(3);
        expect(["2024-02-28", "2024-02-29", "2024-03-01"]).toContain(input.issueDate);
        expect(input.documentKind).toBe("credit-note");
        for (const line of input.lines) expect(["rate", "exempt"]).toContain(line.treatment.kind);
      }),
    );
    expect(() =>
      invoiceInputArbitrary({
        currency: "EUR",
        dateRange: { from: isoDate("2024-01-02"), to: isoDate("2024-01-01") },
        clientCountries: [countryCode("IT")],
      }),
    ).toThrow(RangeError);
    expect(() =>
      invoiceInputArbitrary({
        currency: "EUR",
        dateRange: { from: isoDate("2024-01-01"), to: isoDate("2024-01-01") },
        clientCountries: [],
      }),
    ).toThrow(RangeError);
  });
});

describe("conformance utilities", () => {
  it.each<[string, unknown, unknown, boolean]>([
    ["equal bigints", 1n, 1n, true],
    ["equal arrays", [1, 2], [1, 2], true],
    ["arrays of different length", [1, 2], [1], false],
    ["an array and an object", [1], { 0: 1 }, false],
    ["undefined keys as absent", { a: 1, b: undefined }, { a: 1 }, true],
    ["different keys", { a: 1 }, { b: 1 }, false],
    ["nested bigints", { a: { b: [1n] } }, { a: { b: [1n] } }, true],
    ["null and an object", null, {}, false],
    ["a string and a number", "1", 1, false],
  ])("deepEqual: %s", (_label, a, b, equal) => {
    expect(deepEqual(a, b)).toBe(equal);
  });

  it("writes canonical JSON and clones plain data", () => {
    expect(canonicalJson({ b: 1n, a: [{ d: 1, c: 2 }] })).toBe('{"a":[{"c":2,"d":1}],"b":"1"}');
    expect(canonicalJson(undefined)).toBe("null");
    const value = { a: [{ b: decimal("1.5") }], c: money(1n, "EUR") };
    const clone = structuralClone(value);
    expect(clone).toEqual(value);
    expect(clone.a[0]).not.toBe(value.a[0]);
  });
});

describe("conformance edge cases", () => {
  const base: ConformanceOptions = {
    fixtures: [],
    validConfigs: [{}],
    invalidConfigs: [{ config: 1, reason: "number" }],
    sampleInputs: [],
    properties: { numRuns: 10 },
  };

  it("survives packs with unusable catalogs and far-future parameters", () => {
    const noCatalogs = { ...testPack, messages: null } as unknown as typeof testPack;
    expect(runConformanceCheck(noCatalogs, base, "meta.disclaimer").ok).toBe(false);
    const farFuture = {
      ...testPack,
      parameters: [{ ...testPack.parameters[0]!, effectiveFrom: isoDate("9999-06-01") }],
    };
    expect(
      runConformanceCheck(
        farFuture,
        { ...base, properties: { numRuns: 3 } },
        "property.immutability",
      ).failures,
    ).toEqual([]);
  });

  it("checks the rounding of tax allocations", () => {
    const wrongTax = miniPack([
      miniRule((state, ctx) => {
        const base = state.lines.reduce((total, line) => total + line.net.amount, 0n);
        const amount = percentage(money(base, ctx.currency), decimal("30"), "halfUp");
        return {
          components: [
            {
              id: "t",
              kind: "tax",
              label: message("mini.label", { unit: p.price(price("1", ctx.currency)) }),
              effect: "adds-to-total",
              base: money(base, ctx.currency),
              amount,
              allocations: [{ groupId: "std", base: money(base, ctx.currency), amount }],
            },
          ],
          trace: [{ message: message("mini.trace"), componentId: "t" }],
        };
      }),
    ]);
    const found = runConformanceCheck(
      wrongTax,
      { ...base, properties: { numRuns: 100 } },
      "property.rounding-bounds",
    ).failures;
    expect(found.join("\n")).toMatch(/tax "t" on "std": \d+ is too far/);
  });
});
