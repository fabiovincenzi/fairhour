/**
 * Table-driven tests of `xx.withholding`. TEMPLATE: one row per line kind and treatment for the
 * base, one per rate, the rounding cases, and every reason for not withholding (each one must show
 * in the trace).
 */
import type { LineTaxTreatment, NetLine } from "@fairhour/tax-core";
import { describe, expect, it } from "vitest";
import {
  amount,
  CLIENTS,
  compute,
  format,
  line,
  traceKeys,
  type ClientJson,
  type LineSpec,
} from "../../test/helpers";
import type { XxConfigInput } from "../config";
import { isFeeLine, WITHHOLDING_COMPONENT_ID, WITHHOLDING_RULE_ID } from "./withholding";

describe("isFeeLine: what the withholding base includes", () => {
  it.each<[NetLine["kind"], Exclude<LineTaxTreatment["kind"], "rate">, boolean]>([
    ["service", "standard", true],
    ["service", "exempt", true],
    ["service", "out-of-scope", true],
    ["service", "excluded", false],
    ["expense", "standard", true],
    ["mileage", "standard", true],
    ["goods", "standard", false],
    ["reimbursement", "excluded", false],
    ["reimbursement", "standard", false],
  ])("%s, %s -> %s", (kind, treatment, expected) => {
    expect(isFeeLine({ kind, treatment: { kind: treatment } })).toBe(expected);
  });
});

interface WithholdingCase {
  readonly config?: XxConfigInput;
  readonly lines: readonly LineSpec[];
  /** [base, label, amount] */
  readonly expected: readonly [string, string, string];
  readonly total: string;
  readonly netPayable: string;
}

const CASES: Readonly<Record<string, WithholdingCase>> = {
  "standard rate 15%": {
    lines: [line("1000.00")],
    expected: ["1000.00", "Withholding tax 15%", "150.00"],
    total: "1210.00",
    netPayable: "1060.00",
  },
  "new-business rate 7%": {
    config: { withholding: { rate: "new-business" } },
    lines: [line("1000.00")],
    expected: ["1000.00", "Withholding tax 7%", "70.00"],
    total: "1210.00",
    netPayable: "1140.00",
  },
  // 15% × 0.10 = 0.015: a tie, half up gives 0.02 (VAT 21% × 0.10 = 0.021 -> 0.02).
  "a tie rounds half up": {
    lines: [line("0.10")],
    expected: ["0.10", "Withholding tax 15%", "0.02"],
    total: "0.12",
    netPayable: "0.10",
  },
  // 15% × 333.33 = 49.9995 -> 50.00, once on the invoice (VAT 69.9993 -> 70.00).
  "rounded once on the invoice": {
    lines: [line("111.11"), line("111.11"), line("111.11")],
    expected: ["333.33", "Withholding tax 15%", "50.00"],
    total: "403.33",
    netPayable: "353.33",
  },
  // Base 100.00 + 10.00; VAT 21% × 160.00 = 33.60; the disbursement is outside both.
  "fees only: no goods, no disbursements": {
    lines: [
      line("100.00"),
      line("10.00", undefined, { kind: "mileage", unit: "km" }),
      line("50.00", undefined, { kind: "goods" }),
      line("20.00", undefined, { kind: "reimbursement" }),
    ],
    expected: ["110.00", "Withholding tax 15%", "16.50"],
    total: "213.60",
    netPayable: "197.10",
  },
  // Income tax does not depend on the VAT regime.
  "under the small-business exemption too": {
    config: { vatRegistered: false },
    lines: [line("1000.00")],
    expected: ["1000.00", "Withholding tax 15%", "150.00"],
    total: "1000.00",
    netPayable: "850.00",
  },
};

describe("xx.withholding: base, rate and rounding", () => {
  it.each(Object.entries(CASES))("%s", (_name, item) => {
    const c = compute(item.config ?? {}, item.lines, { client: CLIENTS.agent });
    const component = c.components.find((found) => found.id === WITHHOLDING_COMPONENT_ID);
    expect(component && [component.kind, component.effect]).toEqual([
      "withholding",
      "deducted-from-payable",
    ]);
    // Deductions are not allocated to tax groups: they do not change the invoice total.
    expect(component?.allocations).toEqual([]);
    expect(
      component && [amount(component.base), format(component.label), amount(component.amount)],
    ).toEqual(item.expected);
    expect(amount(c.withholdingTotal)).toBe(item.expected[2]);
    expect(amount(c.total)).toBe(item.total);
    expect(amount(c.netPayable)).toBe(item.netPayable);
  });
});

describe("xx.withholding: when nothing is withheld, the trace says why", () => {
  it.each<
    [string, XxConfigInput, ClientJson, readonly LineSpec[], Record<string, string>, string[]]
  >([
    [
      "the client is not a withholding agent",
      {},
      CLIENTS.business,
      [line("100")],
      {},
      ["xx.trace.withholding.not-agent"],
    ],
    [
      "a private individual",
      {},
      CLIENTS.individual,
      [line("100")],
      {},
      ["xx.trace.withholding.not-agent"],
    ],
    [
      "the invoice option skips it",
      {},
      CLIENTS.agent,
      [line("100")],
      { withholding: "skip" },
      ["xx.trace.withholding.skipped"],
    ],
    [
      "the invoice has no fees",
      {},
      CLIENTS.agent,
      [line("50", undefined, { kind: "goods" })],
      {},
      ["xx.trace.withholding.no-base"],
    ],
    ["the invoice has no lines", {}, CLIENTS.agent, [], {}, ["xx.trace.withholding.no-base"]],
    // A structural choice (the configuration): the rule is skipped silently.
    [
      "the configuration disables it",
      { withholding: { enabled: false } },
      CLIENTS.agent,
      [line("100")],
      {},
      [],
    ],
  ])("%s", (_name, config, client, lines, options, keys) => {
    const c = compute(config, lines, { client, options });
    expect(c.components.map((component) => component.id)).not.toContain(WITHHOLDING_COMPONENT_ID);
    expect(c.withholdingTotal.amount).toBe(0n);
    expect(c.netPayable).toEqual(c.total);
    expect(traceKeys(c, WITHHOLDING_RULE_ID)).toEqual(keys);
  });

  it("explains the amount with its formula, in every locale", () => {
    const c = compute({}, [line("1000.00")], { client: CLIENTS.agent });
    const [step] = c.trace.filter((item) => item.ruleId === WITHHOLDING_RULE_ID);
    expect(step && format(step.message)).toBe("Withholding tax: 15% of the fees before VAT");
    expect(step && format(step.message, "eo")).toBe(
      "Detenita imposto: 15% de la honorarioj antaŭ AVI",
    );
    expect(step?.formula && format(step.formula)).toBe("15% × €1,000.00 = €150.00");
    expect(step?.componentId).toBe(WITHHOLDING_COMPONENT_ID);
    expect(step?.sources.map((source) => source.id)).toEqual(["xx.income-tax-act.art-25"]);
  });
});
