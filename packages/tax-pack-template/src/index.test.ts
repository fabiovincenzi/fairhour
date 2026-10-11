/**
 * The pack object: identity, pipeline order, frozen data and the registry handle. TEMPLATE:
 * update the expected identity and rule order to your pack's (the order of the pipeline table in
 * docs/tax-packs/<cc>.md).
 */
import { computeInvoice, toPackHandle } from "@fairhour/tax-core";
import { describe, expect, it } from "vitest";
import packageJson from "../package.json" with { type: "json" };
import { invoice, line } from "../test/helpers";
import { xxPack } from "./index";

describe("xxPack", () => {
  it("declares its identity", () => {
    expect(xxPack.meta).toMatchObject({
      id: "xx",
      name: "Exampleland (template)",
      version: packageJson.version,
      countries: "any",
      locales: ["en", "eo"],
      documentLocale: "eo",
      docsUrl: "https://fabiovincenzi.github.io/fairhour/contributing/tax-packs/",
      disclaimer: { key: "meta.disclaimer" },
    });
    expect(xxPack.meta.maintainers.length).toBeGreaterThan(0);
    // The license boundary (ADR-0002): every tax pack is MIT; `pnpm license:check` enforces it.
    expect(packageJson.license).toBe("MIT");
    expect(xxPack.initialFacts).toEqual({});
  });

  it("runs its rules in pipeline order, each with sources and a title", () => {
    expect(xxPack.rules.map((rule) => rule.id)).toEqual([
      "xx.classify-lines",
      "xx.vat",
      "xx.small-business",
      "xx.withholding",
    ]);
    for (const rule of xxPack.rules) {
      expect(rule.sources.length, rule.id).toBeGreaterThan(0);
      expect(xxPack.messages.en[rule.title.key], rule.id).toBeDefined();
    }
  });

  it("freezes its data", () => {
    expect(Object.isFrozen(xxPack)).toBe(true);
    expect(Object.isFrozen(xxPack.meta.maintainers[0])).toBe(true);
    expect(Object.isFrozen(xxPack.rules[0])).toBe(true);
    expect(Object.isFrozen(xxPack.messages.en)).toBe(true);
    expect(Object.isFrozen(xxPack.parameters[1]?.params)).toBe(true);
  });

  it("works through the type-erased registry handle", () => {
    const handle = toPackHandle(xxPack);
    const input = invoice([line("100.00")]);
    expect(handle.compute({}, input).total).toEqual(computeInvoice(xxPack, {}, input).total);
    expect(handle.parseConfig({ vatRegistered: "no" }).ok).toBe(false);
    expect(handle.roundingPolicy({}).taxes).toEqual({ mode: "halfUp", scope: "per-group" });
    expect(handle.listParameters().map((version) => version.id)).toEqual([
      "xx-2024-01-01",
      "xx-2026-01-01",
    ]);
  });
});
