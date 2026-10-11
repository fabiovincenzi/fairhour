/**
 * The parameter timeline. TEMPLATE: one row per version on its first day and on the day before,
 * and the value of every named rate in every version. The conformance suite also snapshots the
 * whole timeline (src/__snapshots__/conformance.test.ts.snap): adding a version updates the
 * snapshot, editing a released one must not happen.
 */
import { decimalToString } from "@fairhour/money";
import { isoDate, resolveParameters } from "@fairhour/tax-core";
import { describe, expect, it } from "vitest";
import { VAT_RATE_NAMES, WITHHOLDING_RATE_NAMES } from "./config";
import {
  findParameters,
  vatRate,
  vatRates,
  withholdingRate,
  XX_PARAMETERS,
  type XxParams,
} from "./parameters";

describe("XX_PARAMETERS", () => {
  it.each([
    ["2023-12-31", undefined],
    ["2024-01-01", "xx-2024-01-01"],
    ["2025-12-31", "xx-2024-01-01"],
    ["2026-01-01", "xx-2026-01-01"],
    ["2099-12-31", "xx-2026-01-01"],
  ])("on %s the version in force is %s", (date, expected) => {
    expect(findParameters(isoDate(date))?.id).toBe(expected);
    if (expected !== undefined) {
      expect(resolveParameters(XX_PARAMETERS, "xx", isoDate(date)).id).toBe(expected);
    }
  });

  const rates = (params: XxParams): Record<string, string> => ({
    ...Object.fromEntries(
      VAT_RATE_NAMES.map((name) => [`vat.${name}`, decimalToString(vatRate(params, name))]),
    ),
    ...Object.fromEntries(
      WITHHOLDING_RATE_NAMES.map((name) => [
        `withholding.${name}`,
        decimalToString(withholdingRate(params, name)),
      ]),
    ),
  });

  it.each([
    [
      "xx-2024-01-01",
      {
        "vat.standard": "20",
        "vat.reduced": "10",
        "withholding.standard": "15",
        "withholding.new-business": "7",
      },
      ["20", "10"],
    ],
    [
      "xx-2026-01-01",
      {
        "vat.standard": "21",
        "vat.reduced": "10",
        "withholding.standard": "15",
        "withholding.new-business": "7",
      },
      ["21", "10"],
    ],
  ])("%s has the rates of its source", (id, expected, lineRates) => {
    const version = XX_PARAMETERS.find((item) => item.id === id);
    expect(version && rates(version.params)).toEqual(expected);
    expect(version && vatRates(version.params).map((value) => decimalToString(value))).toEqual(
      lineRates,
    );
    expect(version?.sources.length).toBeGreaterThan(0);
    expect(version?.changes.length).toBeGreaterThan(0);
  });

  it("is deeply frozen", () => {
    expect(Object.isFrozen(XX_PARAMETERS)).toBe(true);
    expect(Object.isFrozen(XX_PARAMETERS[0]?.params.vat)).toBe(true);
    expect(Object.isFrozen(XX_PARAMETERS[0]?.sources[0])).toBe(true);
  });
});
