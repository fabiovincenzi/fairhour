import { ROUNDING_MODES } from "@fairhour/money";
import type { ClientInput, ComputationState } from "@fairhour/tax-core";
import { describe, expect, it } from "vitest";
import {
  amount,
  CLIENTS,
  compute,
  format,
  line,
  traceKeys,
  VAT20,
  type ClientJson,
} from "../../test/helpers";
import { configSchema, type GenericConfigInput, type WithholdingAppliesTo } from "../config";
import { roundingPolicy } from "../rounding";
import type { GenericFacts, GenericRuleContext } from "../types";
import {
  WITHHOLDING_COMPONENT_ID,
  WITHHOLDING_RULE_ID,
  withholdingExemption,
  withholdingRule,
} from "./withholding";

const withholding = (
  appliesTo: WithholdingAppliesTo,
  rate = "15",
  mode: (typeof ROUNDING_MODES)[number] = "halfUp",
): GenericConfigInput => ({
  ...VAT20,
  withholding: { label: "IRPF", rate, appliesTo },
  rounding: { mode },
});

describe("withholdingExemption: every condition (section 2.3)", () => {
  it.each<[WithholdingAppliesTo, ClientJson, string | undefined]>([
    ["withholding-agents", CLIENTS.agent, undefined],
    ["withholding-agents", CLIENTS.agentIndividual, undefined],
    ["withholding-agents", CLIENTS.gbBusiness, "not-agent"],
    ["withholding-agents", CLIENTS.frIndividual, "not-agent"],
    ["business-clients", CLIENTS.gbBusiness, undefined],
    ["business-clients", CLIENTS.frAdministration, undefined],
    ["business-clients", CLIENTS.frIndividual, "individual"],
    ["business-clients", CLIENTS.agentIndividual, "individual"],
  ])("%s, %j -> %s", (appliesTo, client, expected) => {
    expect(withholdingExemption(appliesTo, client as ClientInput)).toBe(expected);
  });
});

describe("generic.withholding in the pipeline", () => {
  it("withholds the rate of the non-excluded lines, before tax", () => {
    const c = compute(
      withholding("business-clients"),
      [
        line("600.00"),
        line("200.00", { kind: "exempt", reference: "art. 10" }),
        line("100.00", { kind: "out-of-scope" }),
        line("100.00", { kind: "rate", rate: "5" }),
        line("75.00", { kind: "excluded" }),
      ],
      { client: CLIENTS.gbBusiness },
    );
    const component = c.components.find((item) => item.id === WITHHOLDING_COMPONENT_ID);
    expect(component && [component.kind, component.effect]).toEqual([
      "withholding",
      "deducted-from-payable",
    ]);
    expect(component && amount(component.base)).toBe("1000.00");
    expect(component && amount(component.amount)).toBe("150.00");
    expect(component?.allocations).toEqual([]);
    expect(amount(c.total)).toBe("1200.00"); // 1075.00 + VAT 120.00 + 5.00
    expect(amount(c.withholdingTotal)).toBe("150.00");
    expect(amount(c.netPayable)).toBe("1050.00");
    expect(component && format(component.label, "it")).toBe("IRPF");
    const [step] = c.trace.filter((item) => item.ruleId === WITHHOLDING_RULE_ID);
    expect(step && format(step.message)).toBe(
      "IRPF: 15% of the amount before tax, disbursements excluded",
    );
    expect(step?.formula && format(step.formula)).toBe("15% × £1,000.00 = £150.00");
  });

  it("includes reverse-charge and no-tax lines in the base", () => {
    const rc = compute(
      {
        ...withholding("business-clients"),
        reverseCharge: { mode: "foreign-business-clients", supplierCountry: "GB" },
      },
      [line("100.00")],
      { client: CLIENTS.frBusiness },
    );
    expect(amount(rc.withholdingTotal)).toBe("15.00");
    const none = compute(
      { tax: { kind: "none" }, withholding: { rate: "15", appliesTo: "business-clients" } },
      [line("100.00")],
    );
    expect(amount(none.withholdingTotal)).toBe("15.00");
    expect(amount(none.netPayable)).toBe("85.00");
  });

  it.each<[string, GenericConfigInput, ClientJson, readonly string[]]>([
    [
      "not a withholding agent",
      withholding("withholding-agents"),
      CLIENTS.gbBusiness,
      ["generic.trace.withholding.not-agent"],
    ],
    [
      "a private individual",
      withholding("business-clients"),
      CLIENTS.frIndividual,
      ["generic.trace.withholding.individual"],
    ],
  ])("withholds nothing from %s and says why", (_name, config, client, keys) => {
    const c = compute(config, [line("100")], { client });
    expect(c.components.map((component) => component.id)).toEqual(["generic.tax"]);
    expect(amount(c.withholdingTotal)).toBe("0.00");
    expect(traceKeys(c, WITHHOLDING_RULE_ID)).toEqual(keys);
  });

  it.each([
    ["no lines", []],
    ["only disbursements", [line("50.00", { kind: "excluded" })]],
    ["lines of zero", [line("0.00")]],
  ])("withholds nothing with %s", (_name, lines) => {
    const c = compute(withholding("withholding-agents"), lines, { client: CLIENTS.agent });
    expect(c.components.some((component) => component.kind === "withholding")).toBe(false);
    expect(traceKeys(c, WITHHOLDING_RULE_ID)).toEqual(["generic.trace.withholding.no-base"]);
  });

  it("does not run without a withholding configuration", () => {
    const c = compute(VAT20, [line("100")], { client: CLIENTS.agent });
    expect(traceKeys(c, WITHHOLDING_RULE_ID)).toEqual([]);
  });

  // 15% × 10.05 = 1.5075 (not a tie); 15% × 10.10 = 1.515 (a tie, the even neighbour is 1.52).
  it.each([
    ["10.05", ["1.51", "1.51", "1.51", "1.51", "1.50", "1.51", "1.50"]],
    ["10.10", ["1.52", "1.52", "1.51", "1.52", "1.51", "1.52", "1.51"]],
    ["10.30", ["1.55", "1.54", "1.54", "1.55", "1.54", "1.55", "1.54"]],
  ])("rounds 15%% of %s with the configured mode", (price, expected) => {
    ROUNDING_MODES.forEach((mode, index) => {
      const c = compute(withholding("withholding-agents", "15", mode), [line(price)], {
        client: CLIENTS.agent,
      });
      expect([mode, amount(c.withholdingTotal)]).toEqual([mode, expected[index]]);
    });
  });

  it.each([
    ["0", "0.00", "120.00"],
    ["100", "100.00", "20.00"],
  ])("handles a %s%% rate", (rate, withheld, net) => {
    const c = compute(withholding("withholding-agents", rate), [line("100.00")], {
      client: CLIENTS.agent,
    });
    expect(amount(c.withholdingTotal)).toBe(withheld);
    expect(amount(c.netPayable)).toBe(net);
  });

  it("computes a credit note like an invoice", () => {
    const c = compute(withholding("withholding-agents"), [line("100.00")], {
      client: CLIENTS.agent,
      documentKind: "credit-note",
    });
    expect(amount(c.withholdingTotal)).toBe("15.00");
  });
});

describe("withholdingRule.apply", () => {
  it("returns nothing when called without a withholding configuration", () => {
    const config = configSchema.parse(VAT20);
    const state: ComputationState<GenericFacts> = {
      lines: [],
      groups: [],
      lineGroups: {},
      components: [],
      legalNotes: [],
      warnings: [],
      trace: [],
      facts: {},
    };
    const ctx = { config, rounding: roundingPolicy(config) } as unknown as GenericRuleContext;
    expect(withholdingRule.appliesTo?.(ctx)).toBe(false);
    expect(withholdingRule.apply(state, ctx)).toEqual({});
  });
});
