import { ROUNDING_MODES, type RoundingMode } from "@fairhour/money";
import { describe, expect, it } from "vitest";
import { amount, compute, format, line, NO_TAX, traceKeys, VAT20 } from "../../test/helpers";
import type { GenericConfigInput, TaxScope } from "../config";
import { TAX_COMPONENT_ID, TAX_RULE_ID } from "./tax";

const gst = (mode: RoundingMode, taxScope: TaxScope): GenericConfigInput => ({
  taxLabel: "GST",
  tax: { kind: "rate", rate: "10" },
  rounding: { mode, taxScope },
});

/** Expected GST per mode, in the order of ROUNDING_MODES (halfUp, halfEven, halfDown, up, down, ceiling, floor). */
const CASES: readonly [string, TaxScope, readonly string[], readonly string[]][] = [
  // 10% × 20.05 = 2.005: a tie on the document; halfEven goes down to the even 2.00.
  [
    "tie 2.005 per document",
    "per-document",
    ["10.00", "10.05"],
    ["2.01", "2.00", "2.00", "2.01", "2.00", "2.01", "2.00"],
  ],
  // 10% × 20.15 = 2.015: a tie where the even neighbour is 2.02.
  [
    "tie 2.015 per document",
    "per-document",
    ["10.00", "10.15"],
    ["2.02", "2.02", "2.01", "2.02", "2.01", "2.02", "2.01"],
  ],
  // 10% × 10.05 = 1.005 on each of two lines.
  [
    "tie 1.005 on each line",
    "per-line",
    ["10.05", "10.05"],
    ["2.02", "2.00", "2.00", "2.02", "2.00", "2.02", "2.00"],
  ],
  // 10% × 20.01 = 2.001: not a tie; only the directed modes away from zero go up.
  [
    "2.001 per document",
    "per-document",
    ["10.00", "10.01"],
    ["2.00", "2.00", "2.00", "2.01", "2.00", "2.01", "2.00"],
  ],
  // 1.000 + 1.001 per line: the second line rounds up only with up/ceiling.
  [
    "1.000 and 1.001 per line",
    "per-line",
    ["10.00", "10.01"],
    ["2.00", "2.00", "2.00", "2.01", "2.00", "2.01", "2.00"],
  ],
];

describe("generic.tax: both scopes with every rounding mode (section 2.2)", () => {
  const rows = CASES.flatMap(([name, scope, prices, expected]) =>
    ROUNDING_MODES.map(
      (mode, index) => [name, mode, scope, prices, expected[index] ?? ""] as const,
    ),
  );

  it.each(rows)("%s, %s", (_name, mode, scope, prices, expected) => {
    const c = compute(
      gst(mode, scope),
      prices.map((price) => line(price)),
      { currency: "AUD" },
    );
    const [tax] = c.components;
    expect(tax && amount(tax.amount)).toBe(expected);
    expect(tax && amount(tax.base)).toBe(amount(c.subtotal));
    expect(amount(c.taxTotal)).toBe(expected);
  });
});

describe("generic.tax component", () => {
  it("has the group's rate when there is one rate", () => {
    const c = compute(VAT20, [line("100.00"), line("50.00", { kind: "exempt" })]);
    expect(
      c.components.map((component) => [component.id, component.kind, component.effect]),
    ).toEqual([[TAX_COMPONENT_ID, "tax", "adds-to-total"]]);
    const [tax] = c.components;
    expect(tax?.rate?.coefficient).toBe(20n);
    expect(
      tax?.allocations.map((allocation) => [allocation.groupId, amount(allocation.amount)]),
    ).toEqual([["tax-20", "20.00"]]);
  });

  it("has no rate of its own across several rates", () => {
    const c = compute(VAT20, [
      line("100.00"),
      line("40.00", { kind: "rate", rate: "5" }),
      line("10.00", { kind: "rate", rate: "0" }),
    ]);
    const [tax] = c.components;
    expect(tax?.rate).toBeUndefined();
    expect(
      tax?.allocations.map((allocation) => [
        allocation.groupId,
        amount(allocation.base),
        amount(allocation.amount),
      ]),
    ).toEqual([
      ["tax-20", "100.00", "20.00"],
      ["tax-5", "40.00", "2.00"],
      ["tax-0", "10.00", "0.00"],
    ]);
    expect(tax && amount(tax.amount)).toBe("22.00");
  });

  it("is labelled with the user's tax label in every locale", () => {
    const c = compute(
      { taxLabel: "Sales tax", tax: { kind: "rate", rate: "8.875" } },
      [line("100")],
      {
        currency: "USD",
      },
    );
    const [tax] = c.components;
    expect(tax && format(tax.label, "en")).toBe("Sales tax");
    expect(tax && format(tax.label, "it")).toBe("Sales tax");
  });

  it.each([
    ["no lines", []],
    [
      "only exempt and excluded lines",
      [line("10", { kind: "exempt" }), line("10", { kind: "excluded" })],
    ],
    ["a taxable line of zero", [line("0")]],
  ])("is absent with %s, and the trace says why", (_name, lines) => {
    const c = compute(VAT20, lines);
    expect(c.components).toEqual([]);
    expect(traceKeys(c, TAX_RULE_ID)).toEqual(["generic.trace.tax.none"]);
  });

  it("does not run without tax", () => {
    const c = compute(NO_TAX, [line("100")]);
    expect(c.components).toEqual([]);
    expect(traceKeys(c, TAX_RULE_ID)).toEqual([]);
  });
});

describe("generic.tax trace", () => {
  it("per document: one step per rate with the percentage formula", () => {
    const c = compute(VAT20, [
      line("100.00"),
      line("50.00"),
      line("40.00", { kind: "rate", rate: "5" }),
    ]);
    const steps = c.trace.filter((step) => step.ruleId === TAX_RULE_ID);
    expect(
      steps.map((step) => [step.message.key, step.componentId, step.amount && amount(step.amount)]),
    ).toEqual([
      ["generic.trace.tax", TAX_COMPONENT_ID, "30.00"],
      ["generic.trace.tax", TAX_COMPONENT_ID, "2.00"],
    ]);
    const [first] = steps;
    expect(first && format(first.message)).toBe("VAT at 20% on the taxable amount");
    expect(first?.formula && format(first.formula)).toBe("20% × £150.00 = £30.00");
  });

  it("per line: one step per line, then the sum per rate", () => {
    const config: GenericConfigInput = { ...gst("halfUp", "per-line") };
    const c = compute(
      config,
      [
        line("10.05", undefined, { description: "Consulting" }),
        line("10.05", undefined, { description: "Support" }),
      ],
      { currency: "AUD" },
    );
    const steps = c.trace.filter((step) => step.ruleId === TAX_RULE_ID);
    expect(steps.map((step) => step.message.key)).toEqual([
      "generic.trace.tax.line",
      "generic.trace.tax.line",
      "generic.trace.tax.per-line",
    ]);
    expect(steps.map((step) => step.amount && amount(step.amount))).toEqual([
      "1.01",
      "1.01",
      "2.02",
    ]);
    const [first, , sum] = steps;
    expect(first && format(first.message)).toBe("GST at 10% on “Consulting”");
    expect(first?.formula && format(first.formula)).toBe("10% × A$10.05 = A$1.01");
    expect(sum?.formula && format(sum.formula)).toBe(
      "10% × A$20.10, rounded line by line = A$2.02",
    );
    expect(sum?.formula && format(sum.formula, "it")).toContain("arrotondato riga per riga");
  });

  it("per line: the line steps add up to each allocation", () => {
    const c = compute(gst("halfEven", "per-line"), [
      line("10.05"),
      line("3.35"),
      line("7.25", { kind: "rate", rate: "5" }),
      line("1.15", { kind: "rate", rate: "5" }),
    ]);
    const lineSteps = c.trace.filter((step) => step.message.key === "generic.trace.tax.line");
    const sumOfSteps = lineSteps.reduce((total, step) => total + (step.amount?.amount ?? 0n), 0n);
    expect(sumOfSteps).toBe(c.taxTotal.amount);
    // 1.005 -> 1.00, 0.335 -> 0.34, 0.3625 -> 0.36, 0.0575 -> 0.06
    expect(amount(c.taxTotal)).toBe("1.76");
  });
});
