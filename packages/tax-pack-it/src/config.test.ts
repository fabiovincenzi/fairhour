import { decimal } from "@fairhour/money";
import { describe, expect, test } from "vitest";
import * as z from "zod";
import { configSchema, percent, PERCENT_PATTERN, TIPO_CASSA_PATTERN } from "./config";
import { invalidConfigs, validConfigs } from "./conformance.data";
import { optionsSchema } from "./options";

describe("configSchema: defaults (docs section 4)", () => {
  test("forfettario", () => {
    expect(
      configSchema.parse({
        regime: "forfettario",
        socialSecurity: { kind: "inps-gestione-separata" },
      }),
    ).toEqual({
      regime: "forfettario",
      socialSecurity: { kind: "inps-gestione-separata", rivalsa: true, rate: "4" },
      stampDuty: { charge: "client" },
      noWithholdingNote: "when-withholding-agent",
      revenueTracker: { warningRatio: "80" },
    });
  });

  test("ordinario", () => {
    expect(configSchema.parse({ regime: "ordinario", socialSecurity: { kind: "none" } })).toEqual({
      regime: "ordinario",
      socialSecurity: { kind: "none" },
      withholding: { enabled: true, baseShare: "100", tipoRitenuta: "RT01", causalePagamento: "A" },
      stampDuty: { charge: "client" },
      splitPayment: "auto",
    });
  });

  test("nested defaults apply inside partial objects (prefault)", () => {
    const parsed = configSchema.parse({
      regime: "ordinario",
      socialSecurity: { kind: "none" },
      withholding: { rate: "23" },
      stampDuty: {},
    });
    expect(parsed.regime === "ordinario" && parsed.withholding).toEqual({
      enabled: true,
      rate: "23",
      baseShare: "100",
      tipoRitenuta: "RT01",
      causalePagamento: "A",
    });
  });

  test.each(validConfigs.map((config, index) => ({ index, config })))(
    "validConfigs[$index] parses idempotently",
    ({ config }) => {
      const once = configSchema.parse(config);
      expect(configSchema.parse(once)).toEqual(once);
      expect(configSchema.parse(JSON.parse(JSON.stringify(once)))).toEqual(once);
    },
  );
});

describe("configSchema: refusals", () => {
  test.each(invalidConfigs)("$reason", ({ config }) => {
    expect(configSchema.safeParse(config).success).toBe(false);
  });

  test.each([
    {
      config: {
        regime: "ordinario",
        socialSecurity: { kind: "inps-gestione-separata", rate: "4.0001" },
      },
      path: "socialSecurity.rate",
    },
    {
      config: {
        regime: "ordinario",
        socialSecurity: { kind: "cassa", preset: "custom", rate: "4", name: "X" },
      },
      path: "socialSecurity.preset",
    },
    {
      config: {
        regime: "ordinario",
        socialSecurity: { kind: "none" },
        withholding: { baseShare: "0.0000" },
      },
      path: "withholding.baseShare",
    },
    {
      config: {
        regime: "forfettario",
        socialSecurity: { kind: "none" },
        wording: { noWithholding: "          " },
      },
      path: "wording.noWithholding",
    },
  ])("issue path $path", ({ config, path }) => {
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toContain(path);
  });
});

describe("patterns and helpers", () => {
  test.each([
    ["0", true],
    ["4", true],
    ["22", true],
    ["99.9999", true],
    ["100", true],
    ["100.0000", true],
    ["100.0001", false],
    ["101", false],
    ["04", false],
    ["4.", false],
    ["4.12345", false],
    ["-1", false],
    ["1e2", false],
  ])("percent %s -> %s", (value, ok) => {
    expect(PERCENT_PATTERN.test(value)).toBe(ok);
  });

  test.each([
    ["TC01", true],
    ["TC09", true],
    ["TC21", true],
    ["TC00", false],
    ["TC22", false],
    ["tc01", false],
  ])("TipoCassa %s -> %s", (value, ok) => {
    expect(TIPO_CASSA_PATTERN.test(value)).toBe(ok);
  });

  test("percent() reads a decimal string", () => {
    expect(percent("3.5")).toEqual(decimal("3.5"));
  });

  test("both schemas convert to JSON Schema (the settings form)", () => {
    for (const schema of [configSchema, optionsSchema]) {
      for (const io of ["input", "output"] as const)
        expect(() => z.toJSONSchema(schema, { io })).not.toThrow();
    }
  });
});

describe("optionsSchema (docs section 5)", () => {
  test("defaults", () => {
    expect(optionsSchema.parse({})).toEqual({ stampDuty: "auto", splitPayment: "auto" });
  });

  test.each([{ stampDuty: "maybe" }, { splitPayment: "always" }, { other: true }])(
    "rejects %o",
    (options) => {
      expect(optionsSchema.safeParse(options).success).toBe(false);
    },
  );
});
