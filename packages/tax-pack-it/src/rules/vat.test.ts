import { describe, expect, test } from "vitest";
import {
  amount,
  compute,
  component,
  componentIds,
  FEES,
  FORFETTARIO,
  INPS,
  IT_PRIVATE,
  line,
  ORDINARIO,
  ruleTrace,
} from "../../test/helpers";

const RULE = "it.ordinario.vat";

describe("it.ordinario.vat", () => {
  test.each([
    { name: "standard rate", price: "1000", treatment: undefined, rate: "22", vat: "220.00" },
    {
      name: "reduced 10 %",
      price: "1000",
      treatment: { kind: "rate", rate: "10" },
      rate: "10",
      vat: "100.00",
    },
    {
      name: "reduced 5 %",
      price: "1000",
      treatment: { kind: "rate", rate: "5" },
      rate: "5",
      vat: "50.00",
    },
    {
      name: "super-reduced 4 %",
      price: "1000",
      treatment: { kind: "rate", rate: "4" },
      rate: "4",
      vat: "40.00",
    },
    {
      name: "tie 22 % × 12.75 = 2.805 -> 2.81 (half up)",
      price: "12.75",
      treatment: undefined,
      rate: "22",
      vat: "2.81",
    },
    {
      name: "22 % × 0.02 = 0.0044 -> 0.00",
      price: "0.02",
      treatment: undefined,
      rate: "22",
      vat: "0.00",
    },
  ] as const)("$name", ({ price, treatment, rate, vat }) => {
    const c = compute(ORDINARIO, {
      client: IT_PRIVATE,
      lines: [line("l1", price, treatment === undefined ? {} : { treatment })],
    });
    const tax = component(c, "it.vat");
    expect(tax.kind).toBe("tax");
    expect(amount(tax.amount)).toBe(vat);
    expect(tax.rate?.coefficient).toBe(BigInt(rate));
    expect(amount(c.taxTotal)).toBe(vat);
  });

  test("one allocation per rate; no component rate with several rates", () => {
    const c = compute(ORDINARIO, {
      client: IT_PRIVATE,
      lines: [FEES, line("l2", "500", { treatment: { kind: "rate", rate: "10" } })],
    });
    const tax = component(c, "it.vat");
    expect(tax.rate).toBeUndefined();
    expect(tax.allocations.map((item) => `${item.groupId} ${amount(item.amount)}`)).toEqual([
      "vat-22 220.00",
      "vat-10 50.00",
    ]);
    expect(ruleTrace(c, RULE)).toEqual([
      "VAT at 22% on the taxable amount (22% × €1,000.00 = €220.00)",
      "VAT at 10% on the taxable amount (10% × €500.00 = €50.00)",
    ]);
  });

  test("the base includes the rivalsa allocated to the group, rounded once per rate", () => {
    // Fees 333.33; rivalsa 13.33; 22 % × 346.66 = 76.2652 -> 76.27 (docs section 8).
    const c = compute({ ...ORDINARIO, socialSecurity: INPS }, { lines: [line("l1", "333.33")] });
    expect(amount(component(c, "it.vat").base)).toBe("346.66");
    expect(amount(component(c, "it.vat").amount)).toBe("76.27");
  });

  test("a taxable group with a zero base gets no allocation and no step", () => {
    const c = compute(ORDINARIO, {
      client: IT_PRIVATE,
      lines: [FEES, line("free", "0", { treatment: { kind: "rate", rate: "10" } })],
    });
    expect(component(c, "it.vat").allocations.map((item) => item.groupId)).toEqual(["vat-22"]);
    expect(ruleTrace(c, RULE)).toHaveLength(1);
  });

  test("no taxable amount: no component, the trace says so", () => {
    const c = compute(ORDINARIO, {
      client: { country: "US", kind: "business", isWithholdingAgent: false },
    });
    expect(componentIds(c)).not.toContain("it.vat");
    expect(ruleTrace(c, RULE)).toEqual([
      "No VAT: no part of the invoice is subject to Italian VAT",
    ]);
  });

  test("forfettario: the rule does not run", () => {
    expect(ruleTrace(compute(FORFETTARIO), RULE)).toEqual([]);
  });
});
