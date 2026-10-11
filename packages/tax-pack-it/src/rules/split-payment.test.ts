import { describe, expect, test } from "vitest";
import {
  amount,
  compute,
  component,
  componentIds,
  documentNotes,
  FORFETTARIO,
  IT_BUSINESS_AGENT,
  IT_PA,
  IT_PRIVATE,
  line,
  ORDINARIO,
  ruleContext,
  ruleTrace,
  warningCodes,
} from "../../test/helpers";
import { splitPaymentApplies } from "./split-payment";

const RULE = "it.ordinario.split-payment";
const NO_WITHHOLDING = { ...ORDINARIO, withholding: { enabled: false } };

describe("it.ordinario.split-payment: when it runs (docs 7.9)", () => {
  test.each([
    { config: ORDINARIO, option: undefined, client: IT_PA, runs: true },
    { config: ORDINARIO, option: "auto", client: { ...IT_PA, country: "FR" }, runs: false },
    { config: ORDINARIO, option: undefined, client: IT_BUSINESS_AGENT, runs: false },
    {
      config: { ...ORDINARIO, splitPayment: "never" },
      option: undefined,
      client: IT_PA,
      runs: false,
    },
    {
      config: { ...ORDINARIO, splitPayment: "never" },
      option: "apply",
      client: IT_PRIVATE,
      runs: true,
    },
    { config: ORDINARIO, option: "skip", client: IT_PA, runs: false },
    { config: FORFETTARIO, option: "apply", client: IT_PA, runs: false },
  ] as const)(
    "$config.regime, splitPayment $config.splitPayment, option $option, $client.kind in $client.country -> $runs",
    ({ config, option, client, runs }) => {
      const overrides = {
        client,
        ...(option === undefined ? {} : { options: { splitPayment: option } }),
      };
      expect(splitPaymentApplies(ruleContext(config, overrides))).toBe(runs);
    },
  );
});

describe("it.ordinario.split-payment: outcomes", () => {
  test("a PA client, no withholding: the VAT is deducted from the amount payable", () => {
    const c = compute(NO_WITHHOLDING, { client: IT_PA });
    const split = component(c, "it.split-payment");
    expect(split.kind).toBe("other");
    expect(split.effect).toBe("deducted-from-payable");
    expect(amount(split.amount)).toBe("220.00");
    expect(split.exportCodes).toEqual({ "fatturapa.EsigibilitaIVA": "S" });
    expect(amount(c.total)).toBe("1220.00");
    expect(amount(c.netPayable)).toBe("1000.00");
    expect(documentNotes(c)).toEqual([
      "Scissione dei pagamenti ai sensi dell'articolo 17-ter del DPR n. 633/1972.",
    ]);
    expect(ruleTrace(c, RULE)).toEqual([
      "Split payment: the client pays the VAT of €220.00 directly to the State",
    ]);
  });

  test("withholding applied: excluded by art. 17-ter, c. 1-sexies", () => {
    const c = compute(ORDINARIO, { client: IT_PA });
    expect(componentIds(c)).not.toContain("it.split-payment");
    expect(ruleTrace(c, RULE)).toEqual([
      "No split payment: fees subject to withholding are excluded (art. 17-ter, para. 1-sexies, Presidential Decree no. 633/1972)",
    ]);
  });

  test("a PA that is not flagged as a withholding agent: no withholding, so split payment", () => {
    const c = compute(ORDINARIO, { client: { ...IT_PA, isWithholdingAgent: false } });
    expect(amount(component(c, "it.split-payment").amount)).toBe("220.00");
  });

  test("the option apply on a private client", () => {
    const c = compute(ORDINARIO, { client: IT_PRIVATE, options: { splitPayment: "apply" } });
    expect(amount(c.netPayable)).toBe("1000.00");
  });

  test.each([
    { date: "2026-06-30", parameters: "it-2023-01-01", applied: true },
    { date: "2026-07-01", parameters: "it-2026-07-01", applied: true },
    { date: "2029-06-30", parameters: "it-2026-07-01", applied: true },
    { date: "2029-07-01", parameters: "it-2026-07-01", applied: false },
  ])("on $date ($parameters): applied $applied", ({ date, parameters, applied }) => {
    const c = compute(NO_WITHHOLDING, { issueDate: date, client: IT_PA });
    expect(c.parameters.id).toBe(parameters);
    expect(componentIds(c).includes("it.split-payment")).toBe(applied);
    expect(warningCodes(c)).toEqual(applied ? [] : ["it.split-payment.authorisation-expired"]);
    if (!applied) {
      expect(ruleTrace(c, RULE)).toEqual([
        "No split payment: the EU authorisation ended on June 30, 2029",
      ]);
    }
  });

  test.each([
    { name: "exempt lines only", lines: [line("a", "50", { treatment: { kind: "exempt" } })] },
    { name: "VAT rounded to zero", lines: [line("a", "0.02")] },
  ])("no VAT ($name): nothing to split", ({ lines }) => {
    const c = compute(NO_WITHHOLDING, { client: IT_PA, lines });
    expect(componentIds(c)).not.toContain("it.split-payment");
    expect(ruleTrace(c, RULE)).toEqual(["No split payment: the invoice has no VAT"]);
  });
});
