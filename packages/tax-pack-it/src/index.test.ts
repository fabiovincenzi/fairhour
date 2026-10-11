import { parseMoney } from "@fairhour/money";
import {
  computeInvoice,
  isoDate,
  listParameters,
  parseInvoiceInput,
  toPackHandle,
} from "@fairhour/tax-core";
import { describe, expect, it } from "vitest";
import packageJson from "../package.json" with { type: "json" };
import { invoice } from "../test/helpers";
import * as entry from "./index";
import { itPack } from "./index";

const ORDINARIO_INPS = {
  regime: "ordinario",
  socialSecurity: { kind: "inps-gestione-separata", rivalsa: true },
} as const;

describe("itPack", () => {
  it("declares its identity", () => {
    expect(itPack.meta).toMatchObject({
      id: "it",
      name: "Italy",
      version: packageJson.version,
      countries: ["IT"],
      locales: ["en", "it"],
      documentLocale: "it",
      docsUrl: "https://fabiovincenzi.github.io/fairhour/tax-packs/it/",
      disclaimer: { key: "meta.disclaimer" },
    });
    expect(entry.IT_PACK_VERSION).toBe(packageJson.version);
    expect(packageJson.license).toBe("MIT");
    expect(itPack.initialFacts).toEqual({ withholdingApplied: false });
  });

  it("runs its rules in the order of section 6", () => {
    expect(itPack.rules.map((rule) => rule.id)).toEqual([
      "it.common.classify-lines",
      "it.common.general-expenses",
      "it.common.cassa",
      "it.common.inps-rivalsa",
      "it.ordinario.vat",
      "it.ordinario.withholding",
      "it.forfettario.no-vat",
      "it.forfettario.no-withholding",
      "it.common.stamp-duty",
      "it.ordinario.split-payment",
    ]);
    for (const rule of itPack.rules) {
      expect(rule.sources.length, rule.id).toBeGreaterThan(0);
      expect(itPack.messages.en[rule.title.key], rule.id).toBeDefined();
    }
  });

  it("has the four parameter versions of section 11", () => {
    expect(
      listParameters(itPack).map((version) => [
        version.id,
        version.effectiveFrom,
        version.effectiveUntil,
      ]),
    ).toEqual([
      ["it-2019-01-01", "2019-01-01", "2020-12-31"],
      ["it-2021-01-01", "2021-01-01", "2022-12-31"],
      ["it-2023-01-01", "2023-01-01", "2026-06-30"],
      ["it-2026-07-01", "2026-07-01", undefined],
    ]);
  });

  it("freezes its data", () => {
    expect(Object.isFrozen(itPack)).toBe(true);
    expect(Object.isFrozen(itPack.meta.maintainers[0])).toBe(true);
    expect(Object.isFrozen(itPack.rules)).toBe(true);
    expect(Object.isFrozen(itPack.rules[0])).toBe(true);
    expect(Object.isFrozen(itPack.rules[0]?.sources[0])).toBe(true);
    expect(Object.isFrozen(itPack.messages.en)).toBe(true);
    expect(Object.isFrozen(itPack.messages.it)).toBe(true);
    expect(Object.isFrozen(itPack.parameters[0]?.params.cassa["cassa-forense"])).toBe(true);
    expect(Object.isFrozen(itPack.initialFacts)).toBe(true);
  });

  it("works through the type-erased registry handle", () => {
    const handle = toPackHandle(itPack);
    const input = parseInvoiceInput(invoice());
    const viaHandle = handle.compute(ORDINARIO_INPS, input);
    const direct = computeInvoice(itPack, ORDINARIO_INPS, input);
    expect(viaHandle.total).toEqual(direct.total);
    expect(viaHandle.netPayable).toEqual(parseMoney("1060.80", "EUR"));
    expect(handle.roundingPolicy(ORDINARIO_INPS).taxes).toEqual({
      mode: "halfUp",
      scope: "per-group",
    });
    expect(handle.listParameters()).toHaveLength(4);
    expect(handle.parseConfig({ regime: "forfettario" }).ok).toBe(false);

    const forfettario = { regime: "forfettario", socialSecurity: { kind: "none" } };
    const thresholds = handle.annualThresholds;
    expect(thresholds).toBeDefined();
    const computation = handle.compute(forfettario, input);
    expect(thresholds?.countableRevenue(forfettario, computation)).toEqual(
      parseMoney("1002.00", "EUR"),
    );
    const status = thresholds?.evaluate(forfettario, {
      year: 2026,
      currency: "EUR",
      receipts: [{ date: isoDate("2026-03-20"), amount: parseMoney("1002.00", "EUR") }],
      asOf: isoDate("2026-10-10"),
    });
    expect(status?.status).toBe("ok");
  });

  it("exports the public API", () => {
    expect(Object.keys(entry).sort()).toEqual(
      [
        "CASSA_PRESET_IDS",
        "IT_PACK_VERSION",
        "PERCENT_PATTERN",
        "TIPO_CASSA_PATTERN",
        "cassaRateSources",
        "configSchema",
        "countableRevenue",
        "evaluateRevenue",
        "itMessages",
        "itPack",
        "itRules",
        "optionsSchema",
        "parameters",
        "sources",
      ].sort(),
    );
  });
});
