import { decimal } from "@fairhour/money";
import { toPackHandle } from "@fairhour/tax-core";
import { describe, expect, it } from "vitest";
import * as z from "zod";
import { invalidConfigs, validConfigs } from "../test/conformance-data";
import {
  configSchema,
  isRateAllowed,
  PERCENT_PATTERN,
  percent,
  type GenericRateTaxConfig,
} from "./config";
import { genericPack } from "./index";

describe("configSchema defaults (section 1)", () => {
  it("fills in every default for a minimal rate configuration", () => {
    expect(configSchema.parse({ tax: { kind: "rate", rate: "20" } })).toEqual({
      taxLabel: "VAT",
      tax: { kind: "rate", rate: "20", allowedLineRates: [] },
      reverseCharge: { mode: "off", note: "Reverse charge" },
      rounding: { mode: "halfUp", taxScope: "per-document" },
    });
  });

  it("fills in every default for a minimal no-tax configuration", () => {
    expect(configSchema.parse({ tax: { kind: "none" } })).toEqual({
      taxLabel: "VAT",
      tax: { kind: "none" },
      reverseCharge: { mode: "off", note: "Reverse charge" },
      rounding: { mode: "halfUp", taxScope: "per-document" },
    });
  });

  it("applies the inner defaults of nested objects (prefault)", () => {
    const parsed = configSchema.parse({
      tax: { kind: "rate", rate: "19" },
      reverseCharge: { mode: "foreign-business-clients", supplierCountry: "DE" },
      withholding: { rate: "15" },
      rounding: { taxScope: "per-line" },
    });
    expect(parsed.reverseCharge).toEqual({
      mode: "foreign-business-clients",
      supplierCountry: "DE",
      note: "Reverse charge",
    });
    expect(parsed.withholding).toEqual({
      label: "Withholding tax",
      rate: "15",
      appliesTo: "withholding-agents",
    });
    expect(parsed.rounding).toEqual({ mode: "halfUp", taxScope: "per-line" });
  });

  it.each(validConfigs.map((config, index) => [index, config] as const))(
    "validConfigs[%i] parses idempotently and survives JSON",
    (_index, config) => {
      const parsed = configSchema.parse(config);
      expect(configSchema.parse(parsed)).toEqual(parsed);
      expect(configSchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
    },
  );
});

describe("configSchema refusals", () => {
  it.each(invalidConfigs.map((entry) => [entry.reason, entry.config] as const))(
    "rejects %s",
    (_reason, config) => {
      expect(configSchema.safeParse(config).success).toBe(false);
    },
  );

  it("reports a missing supplier country on its own path", () => {
    const result = configSchema.safeParse({
      tax: { kind: "rate", rate: "20" },
      reverseCharge: { mode: "foreign-business-clients" },
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([
      ["reverseCharge", "supplierCountry"],
    ]);
  });

  it("accepts a supplier country while the reverse charge is off (it is ignored)", () => {
    expect(
      configSchema.safeParse({
        tax: { kind: "rate", rate: "20" },
        reverseCharge: { mode: "off", supplierCountry: "GB" },
      }).success,
    ).toBe(true);
  });
});

describe("PERCENT_PATTERN", () => {
  it.each(["0", "0.5", "5", "7.7", "8.875", "20", "99.9999", "100", "100.0", "100.0000", "0.0001"])(
    "accepts %s",
    (value) => {
      expect(PERCENT_PATTERN.test(value)).toBe(true);
    },
  );

  it.each([
    "",
    "-1",
    "100.01",
    "100.00001",
    "101",
    "020",
    "00",
    "5.",
    ".5",
    "8.87501",
    "1e2",
    " 20",
    "20 ",
    "20%",
    "1,5",
  ])("rejects %j", (value) => {
    expect(PERCENT_PATTERN.test(value)).toBe(false);
  });
});

describe("isRateAllowed", () => {
  const tax = (allowedLineRates: string[]): GenericRateTaxConfig => ({
    kind: "rate",
    rate: "20",
    allowedLineRates,
  });

  it.each([
    [[], "20", true],
    [[], "7.7", true],
    [[], "0", true],
    [["5", "0"], "20", true],
    [["5", "0"], "20.00", true],
    [["5", "0"], "5", true],
    [["5", "0"], "5.000", true],
    [["5", "0"], "0.00", true],
    [["5", "0"], "10", false],
    [["5", "0"], "5.5", false],
  ] as const)("allowed %j, line rate %s -> %s", (allowed, rate, expected) => {
    expect(isRateAllowed(tax([...allowed]), decimal(rate))).toBe(expected);
  });

  it("reads configured percents as decimals", () => {
    expect(percent("8.875")).toEqual(decimal("8.875"));
  });
});

describe("settings form (JSON Schema)", () => {
  it("makes every field with a default optional in the input schema", () => {
    const schema = z.toJSONSchema(configSchema, { io: "input" });
    expect(schema.required).toEqual(["tax"]);
  });

  it("is exposed through the type-erased pack handle", () => {
    const handle = toPackHandle(genericPack);
    expect(handle.configJsonSchema).toHaveProperty("properties.taxLabel");
    expect(handle.parseConfig({ tax: { kind: "none" } }).ok).toBe(true);
    expect(handle.parseConfig({}).ok).toBe(false);
  });
});
