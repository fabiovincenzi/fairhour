import { computeInvoice, UnsupportedInputError } from "@fairhour/tax-core";
import { describe, expect, it } from "vitest";
import { format, invoice, line, NO_TAX, VAT20, type TreatmentJson } from "../test/helpers";
import { configSchema, type GenericConfigInput } from "./config";
import { genericPack } from "./index";
import { validateInput } from "./validate-input";

const ALLOWED: GenericConfigInput = {
  taxLabel: "VAT",
  tax: { kind: "rate", rate: "20", allowedLineRates: ["5", "0"] },
};

function issues(config: GenericConfigInput, treatments: readonly (TreatmentJson | undefined)[]) {
  const input = invoice(treatments.map((treatment) => line("10", treatment)));
  return validateInput(input, configSchema.parse(config));
}

const rate = (value: string): TreatmentJson => ({ kind: "rate", rate: value });

describe("validateInput: input checks (section 1)", () => {
  it.each<[string, GenericConfigInput, (TreatmentJson | undefined)[], readonly string[]]>([
    ["standard lines never", NO_TAX, [undefined, { kind: "standard" }], []],
    [
      "exempt, out-of-scope and excluded lines never",
      ALLOWED,
      [{ kind: "exempt" }, { kind: "out-of-scope" }, { kind: "excluded" }],
      [],
    ],
    ["a rate without tax", NO_TAX, [rate("20")], ["generic.rate-without-tax"]],
    ["any rate when no rates are listed", VAT20, [rate("7.7"), rate("0"), rate("100")], []],
    ["the standard rate even when not listed", ALLOWED, [rate("20"), rate("20.00")], []],
    ["a listed rate, in any notation", ALLOWED, [rate("5"), rate("5.0"), rate("0.0000")], []],
    ["a rate that is not listed", ALLOWED, [rate("10")], ["generic.rate-not-allowed"]],
    [
      "each refused line",
      ALLOWED,
      [rate("10"), undefined, rate("5.5")],
      ["generic.rate-not-allowed", "generic.rate-not-allowed"],
    ],
  ])("%s", (_name, config, treatments, codes) => {
    expect(issues(config, treatments).map((issue) => issue.code)).toEqual(codes);
  });

  it("points at the refused line's rate", () => {
    expect(issues(ALLOWED, [undefined, rate("10")]).map((issue) => issue.path)).toEqual([
      ["lines", 1, "treatment", "rate"],
    ]);
  });

  it.each([
    [ALLOWED, "en", "Line “Catering”: the rate 10% is not one of the rates configured for VAT"],
    [ALLOWED, "it", "Riga “Catering”: l’aliquota 10% non è tra quelle configurate per VAT"],
    [
      NO_TAX,
      "en",
      "Line “Catering”: a rate (10%) cannot be used because the tax settings say that no tax applies",
    ],
  ] as const)("explains the refusal (%#)", (config, locale, text) => {
    const input = invoice([line("10", rate("10"), { description: "Catering" })]);
    const [issue] = validateInput(input, configSchema.parse(config));
    expect(issue && format(issue.message, locale)).toBe(text);
  });

  it("makes the engine throw UnsupportedInputError with every issue", () => {
    const input = invoice([line("10", rate("10")), line("10", rate("15"))]);
    expect(() => computeInvoice(genericPack, ALLOWED, input)).toThrow(UnsupportedInputError);
    try {
      computeInvoice(genericPack, ALLOWED, input);
    } catch (error) {
      expect((error as UnsupportedInputError).issues).toHaveLength(2);
    }
  });
});
