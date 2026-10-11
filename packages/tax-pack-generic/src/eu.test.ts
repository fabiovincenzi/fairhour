import { isoDate } from "@fairhour/tax-core";
import { describe, expect, it } from "vitest";
import { DIRECTIVE_CITED_FROM, isEuMemberState, isIntraEuSupply } from "./eu";

const MEMBER_STATES = [
  "AT",
  "BE",
  "BG",
  "CY",
  "CZ",
  "DE",
  "DK",
  "EE",
  "ES",
  "FI",
  "FR",
  "GR",
  "HR",
  "HU",
  "IE",
  "IT",
  "LT",
  "LU",
  "LV",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SE",
  "SI",
  "SK",
] as const;

describe("isEuMemberState (docs/tax-packs/generic.md, section 2.5)", () => {
  it("knows the 27 Member States today", () => {
    const today = isoDate("2026-03-15");
    for (const code of MEMBER_STATES) expect(isEuMemberState(code, today)).toBe(true);
    expect(MEMBER_STATES).toHaveLength(27);
  });

  it.each([
    ["the United Kingdom during the transition period", "GB", "2020-12-31", true],
    ["the United Kingdom after the transition period", "GB", "2021-01-01", false],
    ["the United Kingdom before its withdrawal", "GB", "2019-06-30", true],
    ["Croatia the day before its accession", "HR", "2013-06-30", false],
    ["Croatia on the day of its accession", "HR", "2013-07-01", true],
    ["a Member State before point (11a) applied", "DE", "2012-12-31", false],
    ["a Member State on the first day point (11a) applied", "DE", "2013-01-01", true],
    ["Greece by its ISO code", "GR", "2026-03-15", true],
    ["Greece by its VAT prefix, which is not a country code", "EL", "2026-03-15", false],
    ["a country outside the EU", "US", "2026-03-15", false],
    ["Switzerland", "CH", "2026-03-15", false],
    ["Norway", "NO", "2026-03-15", false],
    ["Åland, outside the EU VAT territory with its own code", "AX", "2026-03-15", false],
    ["Réunion, with its own code", "RE", "2026-03-15", false],
    ["a lower-case code", "de", "2026-03-15", false],
    ["a special property name", "__proto__", "2026-03-15", false],
  ])("%s", (_name, country, on, expected) => {
    expect(isEuMemberState(country, isoDate(on))).toBe(expected);
  });

  it("starts citing the Directive on 2013-01-01", () => {
    expect(DIRECTIVE_CITED_FROM).toBe("2013-01-01");
  });
});

describe("isIntraEuSupply", () => {
  it.each([
    ["Germany to France", "DE", "FR", "2026-03-15", true],
    ["France to Germany", "FR", "DE", "2026-03-15", true],
    ["within one Member State", "DE", "DE", "2026-03-15", false],
    ["Germany to the United States", "DE", "US", "2026-03-15", false],
    ["the United States to Germany", "US", "DE", "2026-03-15", false],
    ["Germany to the United Kingdom in 2020", "DE", "GB", "2020-06-15", true],
    ["Germany to the United Kingdom in 2021", "DE", "GB", "2021-01-01", false],
    ["the United Kingdom to Italy in 2021", "GB", "IT", "2021-01-01", false],
    ["Germany to Croatia before its accession", "DE", "HR", "2013-06-30", false],
    ["Germany to Croatia after its accession", "DE", "HR", "2013-07-01", true],
    ["Germany to France in 2012", "DE", "FR", "2012-12-31", false],
  ])("%s", (_name, supplier, client, on, expected) => {
    expect(isIntraEuSupply(supplier, client, isoDate(on))).toBe(expected);
  });
});
