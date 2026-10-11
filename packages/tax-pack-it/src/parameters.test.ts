import { decimal, decimalToString, toDecimalString } from "@fairhour/money";
import { isoDate, ParameterNotFoundError, resolveParameters } from "@fairhour/tax-core";
import { describe, expect, test } from "vitest";
import { CASSA_PRESET_IDS } from "./config";
import { findParameters, parameters } from "./parameters";

const at = (date: string) => resolveParameters(parameters, "it", isoDate(date));

describe("parameter timeline (docs section 11)", () => {
  test("four versions, in order", () => {
    expect(parameters.map((version) => [version.id, version.effectiveFrom])).toEqual([
      ["it-2019-01-01", "2019-01-01"],
      ["it-2021-01-01", "2021-01-01"],
      ["it-2023-01-01", "2023-01-01"],
      ["it-2026-07-01", "2026-07-01"],
    ]);
  });

  test.each([
    { date: "2019-01-01", id: "it-2019-01-01" },
    { date: "2020-12-31", id: "it-2019-01-01" },
    { date: "2021-01-01", id: "it-2021-01-01" },
    { date: "2022-12-31", id: "it-2021-01-01" },
    { date: "2023-01-01", id: "it-2023-01-01" },
    { date: "2026-06-30", id: "it-2023-01-01" },
    { date: "2026-07-01", id: "it-2026-07-01" },
    { date: "2099-12-31", id: "it-2026-07-01" },
  ])("$date -> $id", ({ date, id }) => {
    expect(at(date).id).toBe(id);
    expect(findParameters(isoDate(date))?.id).toBe(id);
  });

  test("invoices before 2019 are refused", () => {
    expect(() => at("2018-12-31")).toThrow(ParameterNotFoundError);
    expect(findParameters(isoDate("2018-12-31"))).toBeUndefined();
  });

  test.each([
    { id: "it-2019-01-01", ceiling: "65000.00", exit: null, gb: true, until: "2026-06-30" },
    { id: "it-2021-01-01", ceiling: "65000.00", exit: null, gb: false, until: "2026-06-30" },
    { id: "it-2023-01-01", ceiling: "85000.00", exit: "100000.00", gb: false, until: "2026-06-30" },
    { id: "it-2026-07-01", ceiling: "85000.00", exit: "100000.00", gb: false, until: "2029-06-30" },
  ])("$id: what changed", ({ id, ceiling, exit, gb, until }) => {
    const version = parameters.find((item) => item.id === id);
    if (version === undefined) throw new Error(`missing ${id}`);
    const { params } = version;
    expect(toDecimalString(params.forfettario.ceiling)).toBe(ceiling);
    expect(
      params.forfettario.immediateExit === null
        ? null
        : toDecimalString(params.forfettario.immediateExit),
    ).toBe(exit);
    expect(params.euCountries.includes("GB" as never)).toBe(gb);
    expect(params.euCountries).toHaveLength(gb ? 28 : 27);
    expect(params.splitPayment.authorisedUntil).toBe(until);
    expect(version.sources.length).toBeGreaterThan(0);
    expect(version.changes.length).toBeGreaterThan(0);
  });

  test("constants that did not change since 2019", () => {
    for (const { params } of parameters) {
      expect(decimalToString(params.vat.standardRate)).toBe("22");
      expect(params.vat.allowedRates.map(decimalToString)).toEqual(["22", "10", "5", "4"]);
      expect(decimalToString(params.withholding.professionalRate)).toBe("20");
      expect(decimalToString(params.inpsRivalsa.maxRate)).toBe("4");
      expect(toDecimalString(params.stampDuty.amount)).toBe("2.00");
      expect(toDecimalString(params.stampDuty.threshold)).toBe("77.47");
      expect(params.stampDuty.amount.currency).toBe("EUR");
      expect(decimalToString(params.generalExpenses.rate)).toBe("15");
      expect(Object.keys(params.cassa).sort()).toEqual(
        CASSA_PRESET_IDS.filter((id) => id !== "custom").sort(),
      );
    }
  });

  test("released versions cannot be edited at run time", () => {
    const [first] = parameters;
    expect(Object.isFrozen(first?.params.cassa["cassa-forense"])).toBe(true);
    expect(() => {
      (first?.params.vat.allowedRates as unknown as unknown[]).push(decimal("7"));
    }).toThrow(TypeError);
  });
});
