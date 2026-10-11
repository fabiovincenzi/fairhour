import { describe, expect, test } from "vitest";
import {
  amount,
  compute,
  component,
  EMPTY_STATE,
  FEES,
  FORFETTARIO,
  INPS,
  IT_BUSINESS_AGENT,
  IT_PRIVATE,
  line,
  ORDINARIO,
  ruleContext,
  ruleTrace,
} from "../../test/helpers";
import { inpsRivalsa, rivalsaRate } from "./inps-rivalsa";

const RULE = "it.common.inps-rivalsa";

describe("it.common.inps-rivalsa", () => {
  test.each([
    { name: "default 4 %", socialSecurity: INPS, amount: "40.00" },
    {
      name: "explicit rivalsa and 4 %",
      socialSecurity: { ...INPS, rivalsa: true, rate: "4" },
      amount: "40.00",
    },
    {
      name: "a lower rate (open point 2)",
      socialSecurity: { ...INPS, rate: "2.5" },
      amount: "25.00",
    },
  ])("$name -> $amount", ({ socialSecurity, amount: expected }) => {
    const c = compute({ ...ORDINARIO, socialSecurity });
    const rivalsa = component(c, "it.inps-rivalsa");
    expect(rivalsa.kind).toBe("contribution");
    expect(amount(rivalsa.amount)).toBe(expected);
  });

  test.each([
    { regime: "ordinario", withholding: {}, client: IT_BUSINESS_AGENT, ritenuta: "SI" },
    { regime: "ordinario", withholding: {}, client: IT_PRIVATE, ritenuta: "NO" },
    {
      regime: "ordinario",
      withholding: { enabled: false },
      client: IT_BUSINESS_AGENT,
      ritenuta: "NO",
    },
    { regime: "forfettario", withholding: undefined, client: IT_BUSINESS_AGENT, ritenuta: "NO" },
  ])(
    "FatturaPA Ritenuta is $ritenuta ($regime, client agent: $client.isWithholdingAgent)",
    ({ regime, withholding, client, ritenuta }) => {
      const config =
        regime === "ordinario"
          ? { ...ORDINARIO, socialSecurity: INPS, withholding }
          : { ...FORFETTARIO, socialSecurity: INPS };
      const c = compute(config, { client });
      expect(component(c, "it.inps-rivalsa").exportCodes).toEqual({
        "fatturapa.TipoCassa": "TC22",
        "fatturapa.Ritenuta": ritenuta,
      });
    },
  );

  test("base: fee lines (service, expense, mileage) plus general expenses", () => {
    const c = compute(
      { ...ORDINARIO, socialSecurity: INPS, generalExpenses: { rate: "10" } },
      {
        lines: [
          FEES,
          line("e", "100", { kind: "expense" }),
          line("m", "40", { kind: "mileage" }),
          line("r", "100", { kind: "reimbursement" }),
          line("g", "100", { kind: "goods" }),
        ],
      },
    );
    // 1,000.00 + 100.00 + 40.00 + 10 % × 1,000.00 = 1,240.00; 4 % = 49.60.
    const rivalsa = component(c, "it.inps-rivalsa");
    expect(amount(rivalsa.base)).toBe("1240.00");
    expect(amount(rivalsa.amount)).toBe("49.60");
  });

  test("half up once per group, allocated to the fees' groups", () => {
    const c = compute(
      { ...ORDINARIO, socialSecurity: INPS },
      {
        lines: [
          line("a", "333.33"),
          line("b", "0.13", { treatment: { kind: "rate", rate: "10" } }),
        ],
      },
    );
    // 4 % × 333.33 = 13.3332 -> 13.33; 4 % × 0.13 = 0.0052 -> 0.01.
    expect(
      component(c, "it.inps-rivalsa").allocations.map(
        (item) => `${item.groupId} ${amount(item.amount)}`,
      ),
    ).toEqual(["vat-22 13.33", "vat-10 0.01"]);
  });

  test("trace and the no-fee case", () => {
    expect(ruleTrace(compute({ ...FORFETTARIO, socialSecurity: INPS }), RULE)).toEqual([
      "INPS rivalsa of 4% on the fees (4% × €1,000.00 = €40.00)",
    ]);
    const c = compute(
      { ...FORFETTARIO, socialSecurity: INPS },
      { lines: [line("r", "50", { kind: "reimbursement" })] },
    );
    expect(ruleTrace(c, RULE)).toEqual(["No INPS rivalsa: the invoice has no fees"]);
  });

  test("rivalsa: false, or no INPS scheme: the rule does not run", () => {
    const c = compute({ ...ORDINARIO, socialSecurity: { ...INPS, rivalsa: false } });
    expect(ruleTrace(c, RULE)).toEqual([]);
    expect(rivalsaRate({ kind: "none" })).toBeUndefined();
    expect(inpsRivalsa.apply(EMPTY_STATE, ruleContext(ORDINARIO))).toEqual({});
  });
});
