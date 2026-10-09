import { describe, expect, it } from "vitest";
import { GoldenFixtureSchema, type GoldenFixtureJson } from "./schema";

const fixture = (): GoldenFixtureJson => ({
  name: "basic-invoice",
  description: "A basic invoice",
  pack: "xx",
  sources: [{ title: "Act", citation: "art. 1", url: "https://example.com/act" }],
  config: {},
  input: {},
  expected: { total: "10.00" },
});

describe("GoldenFixtureSchema", () => {
  it("accepts a fixture and fills componentsExhaustive", () => {
    const parsed = GoldenFixtureSchema.parse(fixture());
    expect(parsed.expected?.componentsExhaustive).toBe(true);
    expect(
      GoldenFixtureSchema.parse({
        ...fixture(),
        expected: undefined,
        expectedError: { code: "invalid-input", issueCodes: ["x"] },
      }).expectedError,
    ).toEqual({
      code: "invalid-input",
      issueCodes: ["x"],
    });
  });

  it.each<[string, (value: GoldenFixtureJson) => unknown]>([
    ["a name that is not kebab-case", (value) => ({ ...value, name: "Basic_Invoice" })],
    ["no sources", (value) => ({ ...value, sources: [] })],
    [
      "an http source URL",
      (value) => ({
        ...value,
        sources: [{ title: "A", citation: "B", url: "http://example.com" }],
      }),
    ],
    [
      "both expected and expectedError",
      (value) => ({ ...value, expectedError: { code: "invalid-input" } }),
    ],
    ["neither expected nor expectedError", (value) => ({ ...value, expected: undefined })],
    [
      "an amount that is not a decimal string",
      (value) => ({ ...value, expected: { total: "10,00" } }),
    ],
    ["an unknown expected field", (value) => ({ ...value, expected: { totals: "10.00" } })],
    [
      "an unknown error code",
      (value) => ({ ...value, expected: undefined, expectedError: { code: "rule-failed" } }),
    ],
    ["an unknown top-level key", (value) => ({ ...value, notes: "x" })],
  ])("rejects %s", (_label, mutate) => {
    expect(GoldenFixtureSchema.safeParse(mutate(fixture())).success).toBe(false);
  });
});
