import {
  computeInvoice,
  listParameters,
  resolveParameters,
  toPackHandle,
  isoDate,
} from "@fairhour/tax-core";
import { describe, expect, it } from "vitest";
import packageJson from "../package.json" with { type: "json" };
import { invoice, line } from "../test/helpers";
import * as entry from "./index";
import { genericPack } from "./index";

describe("genericPack", () => {
  it("declares its identity", () => {
    expect(genericPack.meta).toMatchObject({
      id: "generic",
      name: "Generic",
      version: packageJson.version,
      countries: "any",
      locales: ["en", "it"],
      docsUrl: "https://fabiovincenzi.github.io/fairhour/tax-packs/generic/",
    });
    expect(genericPack.meta.documentLocale).toBeUndefined();
    expect(entry.PACK_VERSION).toBe(packageJson.version);
  });

  it("runs its rules in the order of section 2", () => {
    expect(genericPack.rules.map((rule) => rule.id)).toEqual([
      "generic.classify-lines",
      "generic.tax",
      "generic.withholding",
      "generic.notes",
    ]);
  });

  it("cites the user's configuration in every rule and parameter version", () => {
    for (const rule of genericPack.rules) {
      expect(rule.sources.map((source) => source.id)).toContain("generic.user-configuration");
    }
    for (const version of genericPack.parameters) {
      expect(version.sources.map((source) => source.kind)).toEqual(["user-configuration"]);
    }
    expect(entry.reverseChargeSources.map((source) => source.citation)).toEqual([
      "Values supplied in the workspace's tax settings",
      "art. 196",
      "art. 226, point (11a)",
    ]);
    expect(entry.userConfiguration.verification.status).toBe("to-be-verified");
  });

  it("has one parameter version with no legal values, resolvable on any date", () => {
    expect(listParameters(genericPack).map((version) => [version.id, version.params])).toEqual([
      ["generic-v1", {}],
    ]);
    for (const date of ["1900-01-01", "2026-03-15", "9999-12-31"]) {
      expect(resolveParameters(genericPack.parameters, "generic", isoDate(date)).id).toBe(
        "generic-v1",
      );
    }
  });

  it("freezes its data", () => {
    expect(Object.isFrozen(genericPack)).toBe(true);
    expect(Object.isFrozen(genericPack.meta.maintainers[0])).toBe(true);
    expect(Object.isFrozen(genericPack.rules[0])).toBe(true);
    expect(Object.isFrozen(genericPack.messages.en)).toBe(true);
    expect(Object.isFrozen(genericPack.parameters[0]?.params)).toBe(true);
  });

  it("works through the type-erased registry handle", () => {
    const handle = toPackHandle(genericPack);
    const input = invoice([line("100.00")]);
    const viaHandle = handle.compute({ tax: { kind: "rate", rate: "20" } }, input);
    const direct = computeInvoice(genericPack, { tax: { kind: "rate", rate: "20" } }, input);
    expect(viaHandle.total).toEqual(direct.total);
    expect(handle.roundingPolicy({ tax: { kind: "none" } }).taxes.scope).toBe("per-group");
    expect(handle.listParameters()).toHaveLength(1);
  });

  it("exports the public API", () => {
    expect(Object.keys(entry).sort()).toEqual(
      [
        "FIXED_GROUP_IDS",
        "GENERIC_PACK_META",
        "GENERIC_PARAMETERS",
        "MAX_ALLOWED_LINE_RATES",
        "PACK_VERSION",
        "PERCENT_PATTERN",
        "REVERSE_CHARGE_MODES",
        "REVERSE_CHARGE_OPTIONS",
        "TAX_SCOPES",
        "WITHHOLDING_APPLIES_TO",
        "configSchema",
        "configurationSources",
        "genericMessages",
        "genericPack",
        "invoiceOptionsSchema",
        "isRateAllowed",
        "reverseChargeSources",
        "taxGroupId",
        "userConfiguration",
        "vatDirectiveArt196",
        "vatDirectiveArt226",
      ].sort(),
    );
  });
});
