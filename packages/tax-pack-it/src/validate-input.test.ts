import {
  computeInvoice,
  ParameterNotFoundError,
  parseInvoiceInput,
  UnsupportedInputError,
  type InvoiceInputJson,
} from "@fairhour/tax-core";
import { describe, expect, test } from "vitest";
import {
  FEES,
  FORFETTARIO,
  invoice,
  IT_BUSINESS_AGENT,
  IT_PA,
  IT_PRIVATE,
  line,
  ORDINARIO,
  ruleContext,
} from "../test/helpers";
import { configSchema } from "./config";
import { itPack } from "./index";
import { optionsSchema } from "./options";
import { validateInput, withholdingWouldApply } from "./validate-input";

function issues(config: unknown, overrides: Partial<InvoiceInputJson>): readonly string[] {
  const ctx = ruleContext(config, overrides);
  return validateInput(ctx.input, ctx.config, ctx.options).map(
    (issue) => `${issue.code} @ ${issue.path.join(".")}`,
  );
}

const usdLine = { ...FEES };

describe("validateInput (docs section 5)", () => {
  test.each([
    { name: "a plain EUR invoice", config: ORDINARIO, overrides: {}, expected: [] },
    {
      name: "a non-EUR invoice",
      config: FORFETTARIO,
      overrides: { currency: "USD", lines: [usdLine] },
      expected: ["it.currency-not-eur @ currency"],
    },
    {
      name: "forfettario and a rate treatment",
      config: FORFETTARIO,
      overrides: { lines: [FEES, line("l2", "10", { treatment: { kind: "rate", rate: "22" } })] },
      expected: ["it.forfettario.rate-not-allowed @ lines.1.treatment"],
    },
    {
      name: "ordinario and an allowed rate",
      config: ORDINARIO,
      overrides: { lines: [line("l1", "10", { treatment: { kind: "rate", rate: "4.00" } })] },
      expected: [],
    },
    {
      name: "ordinario and a rate that is not Italian",
      config: ORDINARIO,
      overrides: { lines: [line("l1", "10", { treatment: { kind: "rate", rate: "21" } })] },
      expected: ["it.ordinario.unknown-vat-rate @ lines.0.treatment.rate"],
    },
    {
      name: "split payment forced on fees subject to withholding",
      config: ORDINARIO,
      overrides: { client: IT_PA, options: { splitPayment: "apply" } },
      expected: ["it.split-payment.withholding-conflict @ options.splitPayment"],
    },
    {
      name: "every issue is collected",
      config: FORFETTARIO,
      overrides: {
        currency: "CHF",
        lines: [
          line("a", "1", { treatment: { kind: "rate", rate: "10" } }),
          line("b", "1", { treatment: { kind: "rate", rate: "7" } }),
        ],
      },
      expected: [
        "it.currency-not-eur @ currency",
        "it.forfettario.rate-not-allowed @ lines.0.treatment",
        "it.forfettario.rate-not-allowed @ lines.1.treatment",
      ],
    },
  ])("$name", ({ config, overrides, expected }) => {
    expect(issues(config, overrides)).toEqual(expected);
  });

  test.each([
    {
      name: "agent with fees",
      config: ORDINARIO,
      client: IT_BUSINESS_AGENT,
      lines: [FEES],
      applies: true,
    },
    { name: "not an agent", config: ORDINARIO, client: IT_PRIVATE, lines: [FEES], applies: false },
    {
      name: "withholding disabled",
      config: { ...ORDINARIO, withholding: { enabled: false } },
      client: IT_PA,
      lines: [FEES],
      applies: false,
    },
    { name: "forfettario", config: FORFETTARIO, client: IT_PA, lines: [FEES], applies: false },
    {
      name: "no fee lines",
      config: ORDINARIO,
      client: IT_PA,
      lines: [line("g", "10", { kind: "goods" })],
      applies: false,
    },
    {
      name: "excluded fee lines",
      config: ORDINARIO,
      client: IT_PA,
      lines: [line("x", "10", { treatment: { kind: "excluded" } })],
      applies: false,
    },
    {
      name: "fees that round to zero",
      config: ORDINARIO,
      client: IT_PA,
      lines: [line("z", "0.001", { quantity: "0.001" })],
      applies: false,
    },
  ])("withholdingWouldApply: $name -> $applies", ({ config, client, lines, applies }) => {
    const ctx = ruleContext(config, { client, lines });
    expect(withholdingWouldApply(ctx.config, ctx.input)).toBe(applies);
  });

  test("the rate check is skipped before the first parameter version", () => {
    const input = parseInvoiceInput(
      invoice({
        issueDate: "2018-06-01",
        lines: [line("l1", "10", { treatment: { kind: "rate", rate: "7" } })],
      }),
    );
    expect(validateInput(input, configSchema.parse(ORDINARIO), optionsSchema.parse({}))).toEqual(
      [],
    );
    // The engine then refuses the date itself.
    expect(() => computeInvoice(itPack, ORDINARIO, input)).toThrow(ParameterNotFoundError);
  });

  test("the engine throws UnsupportedInputError with localizable issues", () => {
    let caught: unknown;
    try {
      computeInvoice(itPack, ORDINARIO, parseInvoiceInput(invoice({ currency: "GBP" })));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(UnsupportedInputError);
    expect((caught as UnsupportedInputError).issues[0]?.message).toEqual({
      key: "it.issue.currency-not-eur",
      params: { currency: { type: "text", value: "GBP" } },
    });
  });
});
