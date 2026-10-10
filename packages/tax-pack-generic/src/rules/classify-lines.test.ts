import { decimal, decimalToString } from "@fairhour/money";
import { countryCode, type ClientInput, type LineTaxTreatment } from "@fairhour/tax-core";
import { describe, expect, it } from "vitest";
import {
  CLIENTS,
  compute,
  format,
  line,
  NO_TAX,
  traceKeys,
  VAT20,
  type ClientJson,
  type TreatmentJson,
} from "../../test/helpers";
import { configSchema, type GenericConfig, type GenericConfigInput } from "../config";
import { taxGroupId } from "../groups";
import type { ReverseChargeOption } from "../options";
import { configurationSources, reverseChargeSources } from "../sources";
import {
  CLASSIFY_LINES_RULE_ID,
  classifyLine,
  reverseChargeDecision,
  type Placement,
} from "./classify-lines";

const RATE_TAX = configSchema.parse(VAT20).tax;
const NONE_TAX = configSchema.parse(NO_TAX).tax;

const RC: GenericConfigInput = {
  taxLabel: "VAT",
  tax: { kind: "rate", rate: "19" },
  reverseCharge: {
    mode: "foreign-business-clients",
    supplierCountry: "DE",
    note: "Reverse charge",
  },
};

function client(json: ClientJson): ClientInput {
  return json as ClientInput;
}

describe("taxGroupId", () => {
  it.each([
    ["20", "tax-20"],
    ["20.00", "tax-20"],
    ["7.7", "tax-7-7"],
    ["7.70", "tax-7-7"],
    ["8.875", "tax-8-875"],
    ["0", "tax-0"],
    ["0.0000", "tax-0"],
    ["100", "tax-100"],
    ["99.9999", "tax-99-9999"],
  ])("%s -> %s", (rate, id) => {
    expect(taxGroupId(decimal(rate))).toBe(id);
  });
});

describe("classifyLine: every row of the classification table (section 2.1)", () => {
  const show = (placement: Placement): string =>
    placement.group === "taxable" ? `taxable ${decimalToString(placement.rate)}` : placement.group;
  const rate = (value: string): LineTaxTreatment => ({ kind: "rate", rate: decimal(value) });

  it.each<[string, LineTaxTreatment, GenericConfig["tax"], boolean, string]>([
    ["excluded", { kind: "excluded" }, RATE_TAX, false, "excluded"],
    ["excluded, reverse charge", { kind: "excluded" }, RATE_TAX, true, "excluded"],
    ["excluded, no tax", { kind: "excluded" }, NONE_TAX, false, "excluded"],
    ["exempt", { kind: "exempt" }, RATE_TAX, false, "exempt"],
    ["exempt with a reference", { kind: "exempt", reference: "art. 10" }, RATE_TAX, true, "exempt"],
    ["exempt, no tax", { kind: "exempt" }, NONE_TAX, false, "exempt"],
    ["out of scope", { kind: "out-of-scope" }, RATE_TAX, false, "out-of-scope"],
    ["out of scope, reverse charge", { kind: "out-of-scope" }, RATE_TAX, true, "out-of-scope"],
    ["standard, no tax", { kind: "standard" }, NONE_TAX, false, "no-tax"],
    ["standard, no tax, reverse charge", { kind: "standard" }, NONE_TAX, true, "no-tax"],
    ["rate, no tax", rate("10"), NONE_TAX, false, "no-tax"],
    ["standard, reverse charge", { kind: "standard" }, RATE_TAX, true, "reverse-charge"],
    ["rate, reverse charge", rate("5"), RATE_TAX, true, "reverse-charge"],
    ["standard", { kind: "standard" }, RATE_TAX, false, "taxable 20"],
    ["rate", rate("5.50"), RATE_TAX, false, "taxable 5.5"],
    ["rate 0", rate("0.00"), RATE_TAX, false, "taxable 0"],
  ])("%s", (_name, treatment, tax, reverseCharge, expected) => {
    expect(show(classifyLine(treatment, tax, reverseCharge))).toBe(expected);
  });
});

describe("reverseChargeDecision (section 2.1)", () => {
  const settings = (
    mode: "off" | "foreign-business-clients",
    supplierCountry?: string,
  ): GenericConfig["reverseCharge"] => ({
    mode,
    note: "Reverse charge",
    ...(supplierCountry === undefined ? {} : { supplierCountry: countryCode(supplierCountry) }),
  });
  const FOREIGN = settings("foreign-business-clients", "DE");

  it.each<[string, GenericConfig["reverseCharge"], ReverseChargeOption, ClientJson, string]>([
    ["apply forces it, even when off", settings("off"), "apply", CLIENTS.frIndividual, "forced"],
    ["apply forces it on a domestic client", FOREIGN, "apply", CLIENTS.deBusiness, "forced"],
    ["skip suppresses it", FOREIGN, "skip", CLIENTS.frBusiness, "skipped"],
    ["auto with the mode off", settings("off", "DE"), "auto", CLIENTS.frBusiness, "off"],
    [
      "auto without a supplier country (defensive)",
      settings("foreign-business-clients"),
      "auto",
      CLIENTS.frBusiness,
      "off",
    ],
    ["an individual is not a business", FOREIGN, "auto", CLIENTS.frIndividual, "not-business"],
    [
      "a public administration is not a business",
      FOREIGN,
      "auto",
      CLIENTS.frAdministration,
      "not-business",
    ],
    ["a business in the supplier's country", FOREIGN, "auto", CLIENTS.deBusiness, "domestic"],
    ["a business abroad", FOREIGN, "auto", CLIENTS.frBusiness, "foreign-business"],
    [
      "a business abroad without a VAT id",
      FOREIGN,
      "auto",
      CLIENTS.frBusinessNoVatId,
      "foreign-business",
    ],
  ])("%s", (_name, rc, option, clientJson, reason) => {
    expect(reverseChargeDecision(rc, option, client(clientJson)).reason).toBe(reason);
  });

  it("carries the countries it compared", () => {
    expect(reverseChargeDecision(FOREIGN, "auto", client(CLIENTS.frBusiness))).toEqual({
      applies: true,
      reason: "foreign-business",
      clientCountry: "FR",
      supplierCountry: "DE",
    });
    expect(reverseChargeDecision(FOREIGN, "auto", client(CLIENTS.deBusiness))).toEqual({
      applies: false,
      reason: "domestic",
      country: "DE",
    });
  });
});

describe("generic.classify-lines in the pipeline", () => {
  it("orders taxable groups from the highest rate, then the fixed groups", () => {
    const c = compute({ tax: { kind: "rate", rate: "20" } }, [
      line("10", { kind: "excluded" }),
      line("10", { kind: "out-of-scope" }),
      line("10", { kind: "rate", rate: "5" }),
      line("10", { kind: "exempt" }),
      line("10"),
      line("10", { kind: "rate", rate: "0" }),
      line("10", { kind: "rate", rate: "20.0" }),
    ]);
    expect(c.vatSummary.map((row) => row.groupId)).toEqual([
      "tax-20",
      "tax-5",
      "tax-0",
      "exempt",
      "out-of-scope",
      "excluded",
    ]);
    expect(c.vatSummary[0]?.base.amount).toBe(2000n);
  });

  it("puts reverse-charge and no-tax groups before the exempt group", () => {
    const rc = compute(RC, [line("10", { kind: "exempt" }), line("10")], {
      client: CLIENTS.frBusiness,
    });
    expect(rc.vatSummary.map((row) => [row.groupId, row.treatment])).toEqual([
      ["reverse-charge", "out-of-scope"],
      ["exempt", "exempt"],
    ]);
    const none = compute(NO_TAX, [line("10", { kind: "excluded" }), line("10")]);
    expect(none.vatSummary.map((row) => [row.groupId, row.treatment])).toEqual([
      ["no-tax", "out-of-scope"],
      ["excluded", "excluded"],
    ]);
  });

  it("labels groups with the user's tax label, verbatim in every locale", () => {
    const c = compute({ taxLabel: "MwSt", tax: { kind: "rate", rate: "19" } }, [line("10")]);
    const label = c.vatSummary[0]?.label;
    expect(label && format(label, "en")).toBe("MwSt 19%");
    expect(label && format(label, "it")).toBe("MwSt 19%");
    const none = compute({ taxLabel: "GST", tax: { kind: "none" } }, [line("10")]);
    const noTax = none.vatSummary[0]?.label;
    expect(noTax && format(noTax, "en")).toBe("No GST");
    expect(noTax && format(noTax, "it")).toBe("Senza GST");
  });

  it("assigns a line whose id is __proto__", () => {
    const c = compute(VAT20, [line("10", undefined, { id: "__proto__" })]);
    expect(c.lines[0]?.groupId).toBe("tax-20");
  });

  it("counts the lines in its first trace step, with the configuration as source", () => {
    const c = compute(VAT20, [line("10"), line("20")]);
    const [first] = c.trace.filter((step) => step.ruleId === CLASSIFY_LINES_RULE_ID);
    expect(first && format(first.message)).toBe("Lines classified into tax groups: 2");
    expect(first?.sources).toEqual(configurationSources);
  });
});

describe("reverse charge in the pipeline", () => {
  it.each<
    [string, GenericConfigInput, ClientJson, Record<string, string> | undefined, readonly string[]]
  >([
    ["off: no step", VAT20, CLIENTS.frBusiness, undefined, ["generic.trace.classify"]],
    [
      "foreign business",
      RC,
      CLIENTS.frBusiness,
      undefined,
      ["generic.trace.classify", "generic.trace.reverse-charge.foreign-business"],
    ],
    [
      "domestic",
      RC,
      CLIENTS.deBusiness,
      undefined,
      ["generic.trace.classify", "generic.trace.reverse-charge.domestic"],
    ],
    [
      "individual",
      RC,
      CLIENTS.frIndividual,
      undefined,
      ["generic.trace.classify", "generic.trace.reverse-charge.not-business"],
    ],
    [
      "forced",
      VAT20,
      CLIENTS.gbBusiness,
      { reverseCharge: "apply" },
      ["generic.trace.classify", "generic.trace.reverse-charge.forced"],
    ],
    [
      "skipped",
      RC,
      CLIENTS.frBusiness,
      { reverseCharge: "skip" },
      ["generic.trace.classify", "generic.trace.reverse-charge.skipped"],
    ],
    [
      "no tax: the option has no effect",
      NO_TAX,
      CLIENTS.frBusiness,
      { reverseCharge: "apply" },
      ["generic.trace.classify", "generic.trace.no-tax"],
    ],
  ])("%s", (_name, config, clientJson, options, keys) => {
    const c = compute(config, [line("100")], {
      client: clientJson,
      ...(options === undefined ? {} : { options }),
    });
    expect(traceKeys(c, CLASSIFY_LINES_RULE_ID)).toEqual(keys);
  });

  it("states the user's responsibility and cites the Directive when it applies", () => {
    const c = compute(RC, [line("100")], { client: CLIENTS.frBusiness });
    const step = c.trace.find(
      (item) => item.message.key === "generic.trace.reverse-charge.foreign-business",
    );
    expect(step && format(step.message)).toContain("FR");
    expect(step && format(step.message)).toContain("is your responsibility");
    expect(step && format(step.message, "it")).toContain("è tua responsabilità");
    expect(step?.sources).toEqual(reverseChargeSources);
    expect(c.vatSummary.map((row) => row.groupId)).toEqual(["reverse-charge"]);
    expect(c.components).toEqual([]);
  });

  it("prints the configured note with the Directive as context, and warns without a VAT id", () => {
    const config: GenericConfigInput = {
      ...RC,
      reverseCharge: {
        mode: "foreign-business-clients",
        supplierCountry: "DE",
        note: "Steuerschuldnerschaft des Leistungsempfängers",
      },
    };
    const c = compute(config, [line("100")], { client: CLIENTS.frBusinessNoVatId });
    expect(c.legalNotes.map((note) => note.id)).toEqual(["generic.note.reverse-charge"]);
    const [note] = c.legalNotes;
    expect(note && format(note.message, "it")).toBe(
      "Steuerschuldnerschaft des Leistungsempfängers",
    );
    expect(note?.sources).toEqual(reverseChargeSources);
    expect(c.warnings.map((warning) => [warning.code, warning.severity])).toEqual([
      ["generic.reverse-charge-without-vat-id", "warning"],
    ]);
  });

  it("does nothing when no line is standard or rate", () => {
    const c = compute(RC, [line("100", { kind: "exempt", reference: "art. 10" })], {
      client: CLIENTS.frBusinessNoVatId,
    });
    expect(traceKeys(c, CLASSIFY_LINES_RULE_ID)).toEqual(["generic.trace.classify"]);
    expect(c.legalNotes.map((note) => note.id)).toEqual(["generic.note.exempt.1"]);
    expect(c.warnings).toEqual([]);
  });

  it("covers rate lines too", () => {
    const c = compute(RC, [line("100", { kind: "rate", rate: "7" })], {
      client: CLIENTS.frBusiness,
    });
    expect(c.lines[0]?.groupId).toBe("reverse-charge");
  });
});

describe("exemption and out-of-scope notes", () => {
  const notes = (config: GenericConfigInput, treatments: readonly TreatmentJson[]) => {
    const c = compute(
      config,
      treatments.map((treatment) => line("10", treatment)),
    );
    return {
      ids: c.legalNotes.map((note) => note.id),
      texts: c.legalNotes.map((note) => format(note.message)),
      warnings: c.warnings.map((warning) => warning.code),
      sources: c.legalNotes.map((note) => note.sources),
    };
  };

  it("prints each distinct exempt reference once, in line order", () => {
    const result = notes(VAT20, [
      { kind: "exempt", reference: "B" },
      { kind: "exempt", reference: "A" },
      { kind: "exempt", reference: "B" },
    ]);
    expect(result.ids).toEqual(["generic.note.exempt.1", "generic.note.exempt.2"]);
    expect(result.texts).toEqual(["B", "A"]);
    expect(result.warnings).toEqual([]);
    expect(result.sources).toEqual([configurationSources, configurationSources]);
  });

  it("adds the configured exemption note for exempt lines without a reference", () => {
    const result = notes({ ...VAT20, exemptNote: "Exempt supply" }, [
      { kind: "exempt" },
      { kind: "exempt", reference: "art. 10" },
    ]);
    expect(result.texts).toEqual(["art. 10", "Exempt supply"]);
    expect(result.warnings).toEqual([]);
  });

  it("does not repeat an exemption note equal to a reference", () => {
    const result = notes({ ...VAT20, exemptNote: "art. 10" }, [
      { kind: "exempt", reference: "art. 10" },
      { kind: "exempt" },
    ]);
    expect(result.texts).toEqual(["art. 10"]);
  });

  it("ignores the exemption note when every exempt line has a reference", () => {
    const result = notes({ ...VAT20, exemptNote: "Exempt supply" }, [
      { kind: "exempt", reference: "art. 10" },
    ]);
    expect(result.texts).toEqual(["art. 10"]);
  });

  it("warns when an exempt line has no reference and no note is configured", () => {
    const result = notes(VAT20, [{ kind: "exempt" }, { kind: "exempt", reference: "art. 10" }]);
    expect(result.texts).toEqual(["art. 10"]);
    expect(result.warnings).toEqual(["generic.exempt-without-note"]);
  });

  it("prints out-of-scope references only", () => {
    const result = notes(VAT20, [
      { kind: "out-of-scope" },
      { kind: "out-of-scope", reference: "Place of supply abroad" },
      { kind: "out-of-scope", reference: "Place of supply abroad" },
    ]);
    expect(result.ids).toEqual(["generic.note.out-of-scope.1"]);
    expect(result.texts).toEqual(["Place of supply abroad"]);
    expect(result.warnings).toEqual([]);
  });

  it("formats the warnings in every locale", () => {
    const c = compute(RC, [line("10", { kind: "exempt" }), line("10")], {
      client: CLIENTS.frBusinessNoVatId,
    });
    for (const locale of ["en", "it"]) {
      for (const warning of c.warnings) expect(format(warning.message, locale)).not.toBe("");
    }
    expect(c.warnings.map((warning) => warning.code)).toEqual([
      "generic.exempt-without-note",
      "generic.reverse-charge-without-vat-id",
    ]);
  });
});
