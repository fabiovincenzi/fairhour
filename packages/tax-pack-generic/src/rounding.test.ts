import { ROUNDING_MODES } from "@fairhour/money";
import { roundingPolicyProblems } from "@fairhour/tax-core";
import { describe, expect, it } from "vitest";
import { format } from "../test/helpers";
import { configSchema, TAX_SCOPES } from "./config";
import { roundingPolicy } from "./rounding";

describe("roundingPolicy (section 3)", () => {
  const combinations = ROUNDING_MODES.flatMap((mode) =>
    TAX_SCOPES.map((taxScope) => [mode, taxScope] as const),
  );

  it.each(combinations)("%s, %s: one mode everywhere, minor unit", (mode, taxScope) => {
    const policy = roundingPolicy(
      configSchema.parse({ tax: { kind: "rate", rate: "20" }, rounding: { mode, taxScope } }),
    );
    expect(roundingPolicyProblems(policy)).toEqual([]);
    expect(policy.step).toBe("minor-unit");
    expect(policy.lines).toEqual({ mode });
    expect(policy.contributions).toEqual({ mode, scope: "per-group" });
    expect(policy.taxes).toEqual({
      mode,
      scope: taxScope === "per-line" ? "per-line" : "per-group",
    });
    expect(policy.withholdings).toEqual({ mode, scope: "per-document" });
    for (const locale of ["en", "it"]) expect(format(policy.description, locale)).not.toBe("");
  });

  it("describes the configuration in words", () => {
    const words = (config: unknown, locale = "en"): string =>
      format(roundingPolicy(configSchema.parse(config)).description, locale);
    expect(words({ taxLabel: "GST", tax: { kind: "rate", rate: "10" } })).toBe(
      "Line totals, GST and withholdings are rounded to the currency's minor unit, half up (ties away from zero); GST is rounded once per rate on the whole document.",
    );
    expect(
      words(
        { tax: { kind: "rate", rate: "20" }, rounding: { mode: "halfEven", taxScope: "per-line" } },
        "it",
      ),
    ).toBe(
      "Totali di riga, imposta (VAT) e ritenute sono arrotondati all’unità minima della valuta, metà al pari (i casi a metà vanno alla cifra pari); l’imposta (VAT) è arrotondata su ogni riga, poi sommata.",
    );
    expect(words({ tax: { kind: "none" }, rounding: { mode: "floor" } })).toBe(
      "Line totals and withholdings are rounded to the currency's minor unit, toward negative infinity.",
    );
  });
});
