/**
 * The configuration schema. TEMPLATE: test the defaults (the conservative choice, documented in
 * docs/tax-packs/<cc>.md), that nested objects get their defaults through `.prefault({})`, and the
 * JSON Schema the settings form is generated from. The conformance suite checks validity,
 * idempotence and the JSON Schema conversion on `test/conformance-data.ts`.
 */
import { describe, expect, it } from "vitest";
import * as z from "zod";
import { configSchema, type XxConfig } from "./config";
import { invoiceOptionsSchema } from "./options";

const DEFAULTS: XxConfig = {
  vatRegistered: true,
  defaultVatRate: "standard",
  withholding: { enabled: true, rate: "standard" },
};

describe("configSchema", () => {
  it.each<[string, unknown, XxConfig]>([
    ["an empty configuration", {}, DEFAULTS],
    ["an empty nested object", { withholding: {} }, DEFAULTS],
    [
      "a partial nested object",
      { withholding: { rate: "new-business" } },
      { ...DEFAULTS, withholding: { enabled: true, rate: "new-business" } },
    ],
    [
      "the small-business exemption with a note",
      { vatRegistered: false, smallBusinessNote: " Exempt (art. 30) " },
      // No transforms: the text is stored as written.
      { ...DEFAULTS, vatRegistered: false, smallBusinessNote: " Exempt (art. 30) " },
    ],
  ])("fills in the defaults of %s", (_name, input, expected) => {
    const parsed = configSchema.parse(input);
    expect(parsed).toEqual(expected);
    // Idempotent: what is stored parses to itself.
    expect(configSchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  });

  it("generates a settings form where every field is optional", () => {
    const schema = z.toJSONSchema(configSchema, { io: "input" });
    expect(schema).toMatchObject({ type: "object", additionalProperties: false });
    expect(schema.required ?? []).toEqual([]);
    expect(Object.keys(schema.properties ?? {})).toEqual([
      "vatRegistered",
      "defaultVatRate",
      "smallBusinessNote",
      "withholding",
    ]);
  });
});

describe("invoiceOptionsSchema", () => {
  it.each([
    [{}, { withholding: "auto" }],
    [{ withholding: "skip" }, { withholding: "skip" }],
  ])("parses %j", (input, expected) => {
    expect(invoiceOptionsSchema.parse(input)).toEqual(expected);
  });

  it.each([[{ withholding: "never" }], [{ stampDuty: "absorb" }], [null]])(
    "rejects %j",
    (input) => {
      expect(invoiceOptionsSchema.safeParse(input).success).toBe(false);
    },
  );
});
