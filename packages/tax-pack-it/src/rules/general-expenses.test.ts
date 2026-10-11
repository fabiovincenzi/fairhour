import type { InvoiceInputJson } from "@fairhour/tax-core";
import { describe, expect, test } from "vitest";
import {
  amount,
  compute,
  component,
  componentIds,
  EMPTY_STATE,
  FEES,
  FORFETTARIO,
  line,
  ORDINARIO,
  ruleContext,
  ruleTrace,
} from "../../test/helpers";
import { generalExpenses, generalExpensesRate } from "./general-expenses";

const RULE = "it.common.general-expenses";
const LAWYER = { ...ORDINARIO, generalExpenses: { rate: "15" } };

describe("it.common.general-expenses", () => {
  const rows: readonly {
    readonly name: string;
    readonly config: unknown;
    readonly lines: InvoiceInputJson["lines"];
    readonly base: string;
    readonly amount: string;
    readonly allocations: readonly string[];
  }[] = [
    {
      name: "15 % configured",
      config: LAWYER,
      lines: [FEES],
      base: "1000.00",
      amount: "150.00",
      allocations: ["vat-22 1000.00 150.00"],
    },
    {
      name: "{} uses the parameter (15 %)",
      config: { ...ORDINARIO, generalExpenses: {} },
      lines: [FEES],
      base: "1000.00",
      amount: "150.00",
      allocations: ["vat-22 1000.00 150.00"],
    },
    {
      name: "a configured 10 %",
      config: { ...ORDINARIO, generalExpenses: { rate: "10" } },
      lines: [FEES],
      base: "1000.00",
      amount: "100.00",
      allocations: ["vat-22 1000.00 100.00"],
    },
    {
      name: "only the fee (service lines): expenses, mileage and disbursements are not",
      config: LAWYER,
      lines: [
        FEES,
        line("e", "200", { kind: "expense" }),
        line("m", "50", { kind: "mileage" }),
        line("r", "30", { kind: "reimbursement" }),
        line("x", "100", { treatment: { kind: "excluded" } }),
      ],
      base: "1000.00",
      amount: "150.00",
      allocations: ["vat-22 1000.00 150.00"],
    },
    {
      name: "per group: it follows the VAT treatment of the fees",
      config: LAWYER,
      lines: [FEES, line("r10", "500", { treatment: { kind: "rate", rate: "10" } })],
      base: "1500.00",
      amount: "225.00",
      allocations: ["vat-22 1000.00 150.00", "vat-10 500.00 75.00"],
    },
    {
      name: "half up once per group: 15 % × 333.33 = 49.9995 -> 50.00",
      config: LAWYER,
      lines: [line("l1", "333.33")],
      base: "333.33",
      amount: "50.00",
      allocations: ["vat-22 333.33 50.00"],
    },
    {
      name: "forfettario: allocated to N2.2",
      config: { ...FORFETTARIO, generalExpenses: {} },
      lines: [FEES],
      base: "1000.00",
      amount: "150.00",
      allocations: ["n2.2 1000.00 150.00"],
    },
  ];

  test.each(rows)("$name", ({ config, lines, base, amount: expected, allocations }) => {
    const c = compute(config, { lines });
    const surcharge = component(c, "it.general-expenses");
    expect(surcharge.kind).toBe("surcharge");
    expect(surcharge.effect).toBe("adds-to-total");
    expect(amount(surcharge.base)).toBe(base);
    expect(amount(surcharge.amount)).toBe(expected);
    expect(
      surcharge.allocations.map(
        (item) => `${item.groupId} ${amount(item.base)} ${amount(item.amount)}`,
      ),
    ).toEqual(allocations);
  });

  test("the trace shows the formula", () => {
    expect(ruleTrace(compute(LAWYER), RULE)).toEqual([
      "Flat general expenses of 15% of the fee (15% × €1,000.00 = €150.00)",
    ]);
  });

  test("without a fee there is nothing to compute", () => {
    const c = compute(LAWYER, { lines: [line("e", "200", { kind: "expense" })] });
    expect(componentIds(c)).not.toContain("it.general-expenses");
    expect(ruleTrace(c, RULE)).toEqual(["No general expenses: the invoice has no fee"]);
  });

  test("not configured: the rule does not run", () => {
    const c = compute(ORDINARIO);
    expect(ruleTrace(c, RULE)).toEqual([]);
    expect(generalExpenses.apply(EMPTY_STATE, ruleContext(ORDINARIO))).toEqual({});
  });

  test("generalExpensesRate is undefined when general expenses are not configured", () => {
    const ctx = ruleContext(ORDINARIO);
    expect(generalExpensesRate(ctx.config, ctx.params)).toBeUndefined();
  });
});
