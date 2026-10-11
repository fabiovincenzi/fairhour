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
  warningCodes,
} from "../../test/helpers";
import type { CassaPreset } from "../config";
import { cassa, resolveCassa } from "./cassa";

const RULE = "it.common.cassa";
const cassaConfig = (
  socialSecurity: Record<string, unknown>,
  extra: Record<string, unknown> = {},
) => ({
  ...ORDINARIO,
  socialSecurity: { kind: "cassa", ...socialSecurity },
  ...extra,
});

describe("it.common.cassa: presets (docs table 7.3)", () => {
  const presets: readonly {
    readonly preset: CassaPreset;
    readonly name: string;
    readonly rate: string;
    readonly amount: string;
    readonly tipoCassa: string;
    readonly toBeVerified: boolean;
  }[] = [
    {
      preset: "cassa-forense",
      name: "Cassa Forense",
      rate: "4",
      amount: "40.00",
      tipoCassa: "TC01",
      toBeVerified: false,
    },
    {
      preset: "cnpadc",
      name: "CNPADC",
      rate: "4",
      amount: "40.00",
      tipoCassa: "TC02",
      toBeVerified: false,
    },
    {
      preset: "cipag",
      name: "CIPAG",
      rate: "5",
      amount: "50.00",
      tipoCassa: "TC03",
      toBeVerified: false,
    },
    {
      preset: "inarcassa",
      name: "Inarcassa",
      rate: "4",
      amount: "40.00",
      tipoCassa: "TC04",
      toBeVerified: false,
    },
    {
      preset: "cnpr",
      name: "CNPR",
      rate: "4",
      amount: "40.00",
      tipoCassa: "TC06",
      toBeVerified: false,
    },
    {
      preset: "enpacl",
      name: "ENPACL",
      rate: "4",
      amount: "40.00",
      tipoCassa: "TC08",
      toBeVerified: false,
    },
    {
      preset: "eppi",
      name: "EPPI",
      rate: "5",
      amount: "50.00",
      tipoCassa: "TC17",
      toBeVerified: true,
    },
    {
      preset: "epap",
      name: "EPAP",
      rate: "4",
      amount: "40.00",
      tipoCassa: "TC18",
      toBeVerified: true,
    },
    {
      preset: "enpab",
      name: "ENPAB",
      rate: "4",
      amount: "40.00",
      tipoCassa: "TC19",
      toBeVerified: true,
    },
    {
      preset: "enpapi",
      name: "ENPAPI",
      rate: "4",
      amount: "40.00",
      tipoCassa: "TC20",
      toBeVerified: false,
    },
    {
      preset: "enpap",
      name: "ENPAP",
      rate: "2",
      amount: "20.00",
      tipoCassa: "TC21",
      toBeVerified: false,
    },
  ];

  test.each(presets)(
    "$preset: $rate % of €1,000.00 = $amount, $tipoCassa",
    ({ preset, name, rate, amount: expected, tipoCassa, toBeVerified }) => {
      const c = compute(cassaConfig({ preset }));
      const contribution = component(c, "it.cassa");
      expect(contribution.kind).toBe("contribution");
      expect(amount(contribution.amount)).toBe(expected);
      expect(contribution.rate?.coefficient).toBe(BigInt(rate));
      expect(contribution.exportCodes).toEqual({
        "fatturapa.TipoCassa": tipoCassa,
        "fatturapa.Ritenuta": "NO",
      });
      expect(ruleTrace(c, RULE)[0]).toContain(name);
      expect(warningCodes(c).includes("it.cassa.rate-to-be-verified")).toBe(toBeVerified);
      // The rate's source carries the mark of the specification.
      const cited = contribution.sources.find((source) => source.id === `it.cassa.${preset}.rate`);
      expect(cited?.verification.status).toBe(toBeVerified ? "to-be-verified" : "verified");
    },
  );
});

describe("it.common.cassa: overrides, custom fund, bases", () => {
  test("rate, code and name override the preset; an overridden rate is not flagged", () => {
    const c = compute(
      cassaConfig({ preset: "eppi", rate: "4", tipoCassa: "TC05", name: "Notariato" }),
    );
    const contribution = component(c, "it.cassa");
    expect(amount(contribution.amount)).toBe("40.00");
    expect(contribution.exportCodes?.["fatturapa.TipoCassa"]).toBe("TC05");
    expect(warningCodes(c)).toEqual([]);
    expect(ruleTrace(c, RULE)[0]).toBe(
      "Notariato integrative contribution of 4% on the fees and general expenses (4% × €1,000.00 = €40.00)",
    );
    // TC05 is not confirmed by the specification's research: its source is to be verified.
    expect(contribution.sources.map((source) => source.id)).toContain(
      "it.fatturapa.tipo-cassa.unconfirmed",
    );
  });

  test("a custom fund uses its own values and cites the user configuration", () => {
    const c = compute(
      cassaConfig({ preset: "custom", rate: "3.5", tipoCassa: "TC09", name: "ENPAM" }),
    );
    const contribution = component(c, "it.cassa");
    expect(amount(contribution.amount)).toBe("35.00");
    expect(contribution.sources.map((source) => source.id)).toContain("it.cassa.custom");
  });

  test("base: fee lines and general expenses, not disbursements, goods or excluded lines", () => {
    const c = compute(cassaConfig({ preset: "cassa-forense" }, { generalExpenses: {} }), {
      lines: [
        FEES,
        line("e", "100", { kind: "expense" }),
        line("m", "50", { kind: "mileage" }),
        line("r", "30", { kind: "reimbursement" }),
        line("g", "200", { kind: "goods" }),
        line("x", "70", { treatment: { kind: "excluded" } }),
      ],
    });
    // 1,000.00 + 100.00 + 50.00 + general expenses 150.00 (15 % of the service line).
    expect(amount(component(c, "it.cassa").base)).toBe("1300.00");
    expect(amount(component(c, "it.cassa").amount)).toBe("52.00");
  });

  test("in forfettario the contribution is charged without VAT (N2.2)", () => {
    const c = compute({ ...FORFETTARIO, socialSecurity: { kind: "cassa", preset: "inarcassa" } });
    expect(component(c, "it.cassa").allocations.map((item) => item.groupId)).toEqual(["n2.2"]);
    expect(amount(c.taxTotal)).toBe("0.00");
  });

  test("in ordinario it is subject to VAT but not to withholding", () => {
    const c = compute(cassaConfig({ preset: "cassa-forense" }));
    expect(amount(component(c, "it.vat").base)).toBe("1040.00");
    expect(amount(component(c, "it.withholding").base)).toBe("1000.00");
  });

  test("without fees: no contribution, but the to-be-verified warning still shows", () => {
    const c = compute(cassaConfig({ preset: "enpab" }), {
      lines: [line("g", "100", { kind: "goods" })],
    });
    expect(componentIds(c)).not.toContain("it.cassa");
    expect(ruleTrace(c, RULE)).toEqual(["No ENPAB contribution: the invoice has no fees"]);
    expect(warningCodes(c)).toContain("it.cassa.rate-to-be-verified");
  });

  test("resolveCassa: undefined for other schemes and incomplete custom funds", () => {
    const { params } = ruleContext(ORDINARIO);
    expect(resolveCassa({ kind: "none" }, params)).toBeUndefined();
    expect(resolveCassa({ kind: "cassa", preset: "custom", rate: "4" }, params)).toBeUndefined();
    expect(resolveCassa({ kind: "cassa", preset: "cnpadc" }, params)?.rateVerified).toBe(true);
  });

  test("the rule does not run without a cassa (and apply is inert)", () => {
    expect(ruleTrace(compute(ORDINARIO), RULE)).toEqual([]);
    expect(cassa.apply(EMPTY_STATE, ruleContext(ORDINARIO))).toEqual({});
  });
});
