/**
 * Table-driven tests of `xx.classify-lines`. TEMPLATE: one row per cell of your classification
 * table (docs/tax-packs/<cc>.md), then the behaviour in the pipeline: canonical group order,
 * warnings and the trace.
 */
import { decimal, decimalToString } from "@fairhour/money";
import type { LineTaxTreatment } from "@fairhour/tax-core";
import { describe, expect, it } from "vitest";
import { compute, format, line, traceKeys, type TreatmentJson } from "../../test/helpers";
import { configSchema, type XxConfigInput } from "../config";
import { fixedGroup, vatGroup, vatGroupId, type FixedGroupId } from "../groups";
import { XX_PARAMETERS } from "../parameters";
import { CLASSIFY_LINES_RULE_ID, placeLine } from "./classify-lines";

const PARAMS_2026 = XX_PARAMETERS[1]?.params;
const REGISTERED: XxConfigInput = {};
const REDUCED: XxConfigInput = { defaultVatRate: "reduced" };
const SMALL_BUSINESS: XxConfigInput = { vatRegistered: false };

const standard: LineTaxTreatment = { kind: "standard" };
const rate = (value: string): LineTaxTreatment => ({ kind: "rate", rate: decimal(value) });
const exempt: LineTaxTreatment = { kind: "exempt" };
const outOfScope: LineTaxTreatment = { kind: "out-of-scope", reference: "art. 7" };
const excluded: LineTaxTreatment = { kind: "excluded" };

describe("placeLine: the classification table", () => {
  it.each<[string, XxConfigInput, LineTaxTreatment, string]>([
    ["registered, standard", REGISTERED, standard, "vat-21"],
    ["registered at the reduced rate, standard", REDUCED, standard, "vat-10"],
    ["registered, explicit 10%", REGISTERED, rate("10"), "vat-10"],
    ["registered, explicit 21.00% (normalized)", REGISTERED, rate("21.00"), "vat-21"],
    ["registered, exempt", REGISTERED, exempt, "exempt"],
    ["registered, out of scope", REGISTERED, outOfScope, "out-of-scope"],
    ["registered, excluded", REGISTERED, excluded, "excluded"],
    ["small business, standard", SMALL_BUSINESS, standard, "small-business"],
    // Refused earlier by validateInput; the table is still total.
    ["small business, explicit rate", SMALL_BUSINESS, rate("10"), "small-business"],
    ["small business, exempt", SMALL_BUSINESS, exempt, "exempt"],
    ["small business, out of scope", SMALL_BUSINESS, outOfScope, "out-of-scope"],
    ["small business, excluded", SMALL_BUSINESS, excluded, "excluded"],
  ])("%s -> %s", (_name, config, treatment, expected) => {
    if (PARAMS_2026 === undefined) throw new Error("missing parameter version");
    const placement = placeLine(treatment, configSchema.parse(config), PARAMS_2026);
    expect(placement.group === "vat" ? vatGroupId(placement.rate) : placement.group).toBe(expected);
  });
});

describe("tax groups", () => {
  it.each([
    ["21", "vat-21", "21", "VAT 21%"],
    ["21.00", "vat-21", "21", "VAT 21%"],
    ["5.5", "vat-5-5", "5.5", "VAT 5.5%"],
    ["0", "vat-0", "0", "VAT 0%"],
  ])("rate %s: group %s, rate %s, label %s", (value, id, rate, label) => {
    expect(vatGroupId(decimal(value))).toBe(id);
    const group = vatGroup(decimal(value));
    expect(group.id).toBe(id);
    expect(group.treatment).toBe("taxable");
    // Normalized, so that 21 and 21.00 are one group with one rate.
    expect(group.rate && decimalToString(group.rate)).toBe(rate);
    expect(format(group.label)).toBe(label);
  });

  it.each<[FixedGroupId, string, string, string | undefined]>([
    ["small-business", "out-of-scope", "No VAT (small business)", "art. 30 de la AVI-leĝo"],
    ["exempt", "exempt", "Exempt", "art. 12 de la AVI-leĝo"],
    ["out-of-scope", "out-of-scope", "Outside the scope of VAT", undefined],
    ["excluded", "excluded", "Disbursements (outside the taxable amount)", undefined],
  ])("%s: %s, labelled and referenced", (id, treatment, label, reference) => {
    const group = fixedGroup(id);
    expect(group.id).toBe(id);
    expect(group.treatment).toBe(treatment);
    expect(group.rate).toBeUndefined();
    expect(format(group.label)).toBe(label);
    expect(group.reference && format(group.reference, "eo")).toBe(reference);
  });
});

describe("xx.classify-lines in the pipeline", () => {
  const lines: readonly [TreatmentJson, string][] = [
    [{ kind: "exempt" }, "exempt"],
    [{ kind: "excluded" }, "excluded"],
    [{ kind: "standard" }, "vat-21"],
    [{ kind: "out-of-scope", reference: "art. 7" }, "out-of-scope"],
    [{ kind: "rate", rate: "10" }, "vat-10"],
  ];

  it.each([
    ["in input order", lines],
    ["reversed", [...lines].reverse()],
  ])("assigns every line and registers the groups in summary order (%s)", (_name, rows) => {
    const c = compute(
      REGISTERED,
      rows.map(([treatment]) => line("100", treatment)),
    );
    expect(c.lines.map((item) => item.groupId)).toEqual(rows.map(([, groupId]) => groupId));
    // Highest VAT rate first, then the fixed groups: whatever the order of the lines.
    expect(c.vatSummary.map((row) => row.groupId)).toEqual([
      "vat-21",
      "vat-10",
      "exempt",
      "out-of-scope",
      "excluded",
    ]);
    expect(c.warnings).toEqual([]);
  });

  it("registers only the groups that receive lines", () => {
    const c = compute(SMALL_BUSINESS, [line("100"), line("20", { kind: "excluded" })]);
    expect(c.vatSummary.map((row) => [row.groupId, row.treatment])).toEqual([
      ["small-business", "out-of-scope"],
      ["excluded", "excluded"],
    ]);
  });

  it.each<[string, TreatmentJson, readonly string[]]>([
    ["without a reference", { kind: "out-of-scope" }, ["xx.out-of-scope-without-reference"]],
    ["with a reference", { kind: "out-of-scope", reference: "art. 7" }, []],
  ])("warns about an out-of-scope line %s", (_name, treatment, codes) => {
    const c = compute(REGISTERED, [line("100", treatment), line("50", { kind: "out-of-scope" })]);
    expect(c.warnings.map((warning) => warning.code)).toEqual([
      "xx.out-of-scope-without-reference",
    ]);
    const single = compute(REGISTERED, [line("100", treatment)]);
    expect(single.warnings.map((warning) => warning.code)).toEqual(codes);
  });

  it("explains the classification in the trace, in every locale", () => {
    const c = compute(REGISTERED, [line("100"), line("50"), line("20", { kind: "exempt" })]);
    expect(traceKeys(c, CLASSIFY_LINES_RULE_ID)).toEqual(["xx.trace.classify"]);
    const step = c.trace.find((item) => item.ruleId === CLASSIFY_LINES_RULE_ID);
    expect(step && format(step.message)).toBe("Lines classified into tax groups: 3");
    expect(step && format(step.message, "eo")).toBe("Linioj klasigitaj en impostgrupojn: 3");
    expect(step?.sources.map((source) => source.id)).toEqual([
      "xx.vat-act.art-5",
      "xx.vat-act.art-12",
      "xx.vat-act.art-30",
    ]);
  });

  it("classifies an empty invoice", () => {
    const c = compute(REGISTERED, []);
    expect(c.vatSummary).toEqual([]);
    const step = c.trace.find((item) => item.ruleId === CLASSIFY_LINES_RULE_ID);
    expect(step && format(step.message)).toBe("Lines classified into tax groups: 0");
  });
});
