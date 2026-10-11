import { sourceProblems, type SourceRef } from "@fairhour/tax-core";
import { describe, expect, test } from "vitest";
import { itPack } from "./index";
import { cassaRateSources, sources, tipoCassaSource } from "./sources";

const all: readonly SourceRef[] = [...Object.values(sources), ...Object.values(cassaRateSources)];

describe("sources", () => {
  test.each(all.map((source) => ({ id: source.id, source })))(
    "$id is well-formed",
    ({ source }) => {
      expect(sourceProblems(source)).toEqual([]);
      expect(source.id.startsWith("it.")).toBe(true);
    },
  );

  test("ids are unique", () => {
    const ids = all.map((source) => source.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("no source claims a reading of the full consolidated text (Normattiva was unreachable)", () => {
    for (const source of all) {
      if (source.verification.status === "verified")
        expect(source.verification.against).not.toBe("primary-text");
    }
  });

  // The marks of docs/tax-packs/it.md: [O] official-summary, [S] secondary, [TBV] to-be-verified.
  test.each([
    [sources.l190NoVat, "official-summary"],
    [sources.l190NoWithholding, "official-summary"],
    [sources.l190Ceiling, "official-summary"],
    [sources.l190ImmediateExit, "official-summary"],
    [sources.circolare32E2023, "official-summary"],
    [sources.fatturaForfettari, "official-summary"],
    [sources.withholding, "official-summary"],
    [sources.withholdingBase, "official-summary"],
    [sources.stampDuty, "official-summary"],
    [sources.stampDutyThreshold, "official-summary"],
    [sources.stampDutyVatExemption, "official-summary"],
    [sources.stampDutyMixedInvoices, "official-summary"],
    [sources.splitPaymentDecision2026, "official-summary"],
    [sources.vatStandardRate, "secondary"],
    [sources.inpsRivalsa, "secondary"],
    [sources.generalExpenses, "secondary"],
    [sources.stampDutyAmount, "secondary"],
    [sources.stampDutyDisbursements, "secondary"],
    [sources.stampDutyForfettarioRecharge, "secondary"],
    [sources.splitPaymentWithholdingExclusion, "secondary"],
    [sources.circolare32E2023FirstYear, "secondary"],
    [sources.vatDisbursements, "to-be-verified"],
    [sources.vatRoundingToCent, "to-be-verified"],
    [sources.l145of2018, "to-be-verified"],
    [sources.l197of2022, "to-be-verified"],
    [sources.splitPaymentDecision2023, "to-be-verified"],
    [sources.brexit, "to-be-verified"],
    [sources.cassaForenseLaw, "to-be-verified"],
    [sources.fatturapaEsigibilita, "to-be-verified"],
    [sources.fatturapaTipoCassaUnconfirmed, "to-be-verified"],
  ] as const)("%o is graded %s", (source, grade) => {
    const actual =
      source.verification.status === "verified" ? source.verification.against : "to-be-verified";
    expect(actual).toBe(grade);
  });

  test("the cassa rates follow table 7.3", () => {
    const toBeVerified = Object.entries(cassaRateSources)
      .filter(([, source]) => source.verification.status === "to-be-verified")
      .map(([preset]) => preset)
      .sort();
    expect(toBeVerified).toEqual(["enpab", "epap", "eppi"]);
  });

  test.each([
    ["TC01", "it.fatturapa.tipo-cassa"],
    ["TC22", "it.fatturapa.tipo-cassa"],
    ["TC21", "it.fatturapa.tipo-cassa"],
    ["TC02", "it.fatturapa.tipo-cassa.unconfirmed"],
    ["TC20", "it.fatturapa.tipo-cassa.unconfirmed"],
  ])("TipoCassa %s is cited with %s", (code, id) => {
    expect(tipoCassaSource(code).id).toBe(id);
  });

  test("every rule cites at least one source, and every source of a rule is listed here", () => {
    const known = new Set(all.map((source) => source.id));
    for (const rule of itPack.rules) {
      expect(rule.sources.length).toBeGreaterThan(0);
      for (const source of rule.sources) expect(known.has(source.id)).toBe(true);
    }
  });
});
