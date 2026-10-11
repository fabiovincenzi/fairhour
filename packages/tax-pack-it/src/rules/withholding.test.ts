import { describe, expect, test } from "vitest";
import {
  amount,
  compute,
  component,
  componentIds,
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
  warningCodes,
} from "../../test/helpers";
import { withholding, withholdingSettings } from "./withholding";

const RULE = "it.ordinario.withholding";

describe("it.ordinario.withholding: the base (docs 7.6)", () => {
  test.each([
    {
      name: "fees and INPS rivalsa (example b)",
      config: { ...ORDINARIO, socialSecurity: INPS },
      lines: [FEES],
      base: "1040.00",
      amount: "208.00",
    },
    {
      name: "fees and general expenses, not the cassa contribution (example c)",
      config: {
        ...ORDINARIO,
        socialSecurity: { kind: "cassa", preset: "cassa-forense" },
        generalExpenses: { rate: "15" },
      },
      lines: [FEES],
      base: "1150.00",
      amount: "230.00",
    },
    {
      name: "expenses and mileage are fees; disbursements, goods and the stamp duty are not",
      config: ORDINARIO,
      lines: [
        FEES,
        line("e", "100", { kind: "expense" }),
        line("m", "50", { kind: "mileage" }),
        line("r", "100", { kind: "reimbursement" }),
        line("g", "300", { kind: "goods" }),
      ],
      base: "1150.00",
      amount: "230.00",
    },
    {
      name: "exempt and out-of-scope fees are still fees",
      config: ORDINARIO,
      lines: [
        line("a", "100", { treatment: { kind: "exempt" } }),
        line("b", "200", { treatment: { kind: "out-of-scope", reference: "art. 7-quater" } }),
      ],
      base: "300.00",
      amount: "60.00",
    },
    {
      name: "half up on the document: 20 % × 346.66 = 69.332 -> 69.33",
      config: { ...ORDINARIO, socialSecurity: INPS },
      lines: [line("l1", "333.33")],
      base: "346.66",
      amount: "69.33",
    },
  ])("$name", ({ config, lines, base, amount: expected }) => {
    const c = compute(config, { lines });
    const retained = component(c, "it.withholding");
    expect(retained.kind).toBe("withholding");
    expect(retained.effect).toBe("deducted-from-payable");
    expect(amount(retained.base)).toBe(base);
    expect(amount(retained.amount)).toBe(expected);
    expect(amount(c.withholdingTotal)).toBe(expected);
  });
});

describe("it.ordinario.withholding: settings and outcomes", () => {
  test.each([
    {
      name: "commercial agent: 23 % on 50 %",
      withholding: { rate: "23", baseShare: "50" },
      base: "500.00",
      amount: "115.00",
    },
    {
      name: "agent with employees: 23 % on 20 %",
      withholding: { rate: "23", baseShare: "20" },
      base: "200.00",
      amount: "46.00",
    },
    {
      name: "share rounding: 33.3333 % of 1,000.00 = 333.333 -> 333.33",
      withholding: { baseShare: "33.3333" },
      base: "333.33",
      amount: "66.67",
    },
  ])("$name", ({ withholding: settings, base, amount: expected }) => {
    const c = compute({ ...ORDINARIO, withholding: settings });
    const retained = component(c, "it.withholding");
    expect(amount(retained.base)).toBe(base);
    expect(amount(retained.amount)).toBe(expected);
    expect(ruleTrace(c, RULE)).toHaveLength(3);
  });

  test("FatturaPA codes come from the settings", () => {
    const defaults = component(compute(ORDINARIO), "it.withholding");
    expect(defaults.exportCodes).toEqual({
      "fatturapa.TipoRitenuta": "RT01",
      "fatturapa.CausalePagamento": "A",
    });
    const company = component(
      compute({ ...ORDINARIO, withholding: { tipoRitenuta: "RT02", causalePagamento: "M2" } }),
      "it.withholding",
    );
    expect(company.exportCodes).toEqual({
      "fatturapa.TipoRitenuta": "RT02",
      "fatturapa.CausalePagamento": "M2",
    });
  });

  test("the trace shows the base and the amount", () => {
    expect(ruleTrace(compute({ ...ORDINARIO, socialSecurity: INPS }), RULE)).toEqual([
      "Amount subject to withholding: fees, general expenses and INPS rivalsa (the fund contribution, VAT, disbursements, goods and stamp duty are excluded) (€1,000.00 + €0.00 + €40.00 = €1,040.00)",
      "Withholding tax of 20%, retained by the client and paid to the State (20% × €1,040.00 = €208.00)",
    ]);
  });

  test("a client who is not a withholding agent: no withholding, explained", () => {
    const c = compute(ORDINARIO, { client: IT_PRIVATE });
    expect(componentIds(c)).not.toContain("it.withholding");
    expect(ruleTrace(c, RULE)).toEqual([
      "No withholding: the client is not a withholding agent (sostituto d'imposta)",
    ]);
  });

  test("a foreign client flagged as an agent: withholding applies, with a warning", () => {
    const c = compute(ORDINARIO, {
      client: { country: "CH", kind: "individual", isWithholdingAgent: true },
    });
    expect(amount(component(c, "it.withholding").amount)).toBe("200.00");
    expect(warningCodes(c)).toEqual(["it.withholding.foreign-agent"]);
  });

  test("no fees: nothing to withhold", () => {
    const c = compute(ORDINARIO, {
      client: IT_BUSINESS_AGENT,
      lines: [line("g", "100", { kind: "goods" })],
    });
    expect(componentIds(c)).toEqual(["it.vat"]);
    expect(ruleTrace(c, RULE)).toEqual(["No withholding: the invoice has no fees"]);
  });

  test("disabled, or forfettario: the rule does not run", () => {
    expect(ruleTrace(compute({ ...ORDINARIO, withholding: { enabled: false } }), RULE)).toEqual([]);
    expect(ruleTrace(compute(FORFETTARIO), RULE)).toEqual([]);
    const ctx = ruleContext(FORFETTARIO);
    expect(withholdingSettings(ctx.config, ctx.params)).toBeUndefined();
    expect(withholding.apply(EMPTY_STATE, ctx)).toEqual({});
  });

  test("without fees the fact withholdingApplied keeps its initial value", () => {
    const output = withholding.apply(EMPTY_STATE, ruleContext(ORDINARIO));
    expect(output.facts).toBeUndefined();
    expect(output.trace?.length).toBe(1);
  });
});
