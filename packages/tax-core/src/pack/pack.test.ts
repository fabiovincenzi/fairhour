import { money } from "@fairhour/money";
import { describe, expect, it } from "vitest";
import * as z from "zod";
import { computationToJson } from "../computation/json";
import { computeInvoice } from "../engine/compute";
import { InvalidConfigError } from "../errors";
import { parseInvoiceInput } from "../input/json";
import { message } from "../messages/params";
import { isoDate } from "../primitives";
import { miniPack } from "../testing/mini-pack";
import { testPack } from "../testing/test-pack";
import { configJsonSchema, toPackHandle } from "./handle";
import { roundingPolicyProblems } from "./rounding";

const input = parseInvoiceInput({
  issueDate: "2025-03-15",
  currency: "EUR",
  client: { country: "IT", kind: "business", isWithholdingAgent: true },
  lines: [
    {
      id: "l1",
      kind: "service",
      description: "Design",
      quantity: "10",
      unit: "hour",
      unitPrice: "100",
    },
  ],
});

describe("toPackHandle", () => {
  const handle = toPackHandle(testPack);

  it("exposes metadata, merged messages and the configuration JSON Schema", () => {
    expect(handle.meta).toBe(testPack.meta);
    expect(handle.messages.en["core.total"]).toBeDefined();
    expect(handle.messages.it?.["xx.tax.label"]).toBe("Imposta");
    expect(handle.configJsonSchema).toMatchObject({
      type: "object",
      properties: { taxScope: { enum: ["per-group", "per-line"], default: "per-group" } },
    });
    expect(handle.configJsonSchema.required).toBeUndefined(); // input side: defaults are optional
    expect(Object.isFrozen(handle)).toBe(true);
  });

  it("parses configurations to JSON or reports issues", () => {
    expect(handle.parseConfig({ taxScope: "per-line" })).toEqual({
      ok: true,
      config: {
        taxScope: "per-line",
        fixedCharge: "client",
        contribution: true,
        rounding: "halfUp",
      },
    });
    const rejected = handle.parseConfig({ taxScope: 1 });
    expect(rejected.ok).toBe(false);
    expect(rejected.ok ? [] : rejected.issues.map((issue) => issue.path)).toEqual([["taxScope"]]);
  });

  it("computes, lists parameters and gives the rounding policy", () => {
    expect(computationToJson(handle.compute({}, input))).toEqual(
      computationToJson(computeInvoice(testPack, {}, input)),
    );
    expect(handle.listParameters().map((entry) => entry.id)).toEqual([
      "xx-2020-01-01",
      "xx-2024-01-01",
    ]);
    expect(handle.roundingPolicy({ taxScope: "per-line" }).taxes).toEqual({
      mode: "halfUp",
      scope: "per-line",
    });
    expect(() => handle.roundingPolicy({ taxScope: "never" })).toThrow(InvalidConfigError);
  });

  it("wraps the annual thresholds capability with configuration parsing", () => {
    const thresholds = handle.annualThresholds;
    expect(thresholds).toBeDefined();
    const computation = handle.compute({}, input);
    expect(thresholds?.countableRevenue({}, computation)).toEqual(computation.taxableBase);
    const status = thresholds?.evaluate(
      {},
      { year: 2025, currency: "EUR", receipts: [], asOf: isoDate("2025-12-31") },
    );
    expect(status?.status).toBe("ok");
    expect(() =>
      thresholds?.evaluate(
        { taxScope: 3 },
        { year: 2025, currency: "EUR", receipts: [], asOf: isoDate("2025-12-31") },
      ),
    ).toThrow(InvalidConfigError);
    expect(() => thresholds?.countableRevenue(null, computation)).toThrow(InvalidConfigError);
  });

  it("has no thresholds entry for packs without the capability", () => {
    expect("annualThresholds" in toPackHandle(miniPack([]))).toBe(false);
  });

  it("refuses configuration schemas that JSON Schema cannot represent", () => {
    expect(() => configJsonSchema(z.bigint())).toThrow();
    expect(() => configJsonSchema(z.date())).toThrow();
    // The input side of a transform is representable; config.json-schema checks both sides.
    expect(() => configJsonSchema(z.string().transform((value) => value.length))).not.toThrow();
  });
});

describe("roundingPolicyProblems", () => {
  const valid = {
    step: "minor-unit",
    lines: { mode: "halfUp" },
    contributions: { mode: "halfUp", scope: "per-group" },
    taxes: { mode: "halfEven", scope: "per-line" },
    withholdings: { mode: "down", scope: "per-document" },
    description: message("x"),
  };

  it.each([
    ["a valid policy", valid, []],
    ["not an object", null, ["the rounding policy is not an object"]],
    ["cash rounding", { ...valid, step: "0.05" }, ['step must be "minor-unit"']],
    ["missing lines", { ...valid, lines: undefined }, ["lines is missing"]],
    ["a bad mode", { ...valid, lines: { mode: "bankers" } }, ["lines.mode is not a RoundingMode"]],
    [
      "a bad contributions scope",
      { ...valid, contributions: { mode: "halfUp", scope: "per-line" } },
      ["contributions.scope must be one of per-group"],
    ],
    [
      "a bad taxes scope",
      { ...valid, taxes: { mode: "halfUp", scope: "per-document" } },
      ["taxes.scope must be one of per-group, per-line"],
    ],
    [
      "a bad withholdings scope",
      { ...valid, withholdings: { mode: "halfUp" } },
      ["withholdings.scope must be one of per-document"],
    ],
    ["a bad description", { ...valid, description: { key: "" } }, ["description: key is empty"]],
  ])("%s", (_label, policy, problems) => {
    expect(roundingPolicyProblems(policy)).toEqual(problems);
  });
});

describe("test pack revenue tracker", () => {
  const evaluate = testPack.capabilities.annualThresholds!.evaluate;
  const config = testPack.configSchema.parse({});
  const receipt = (date: string, cents: bigint) => ({
    date: isoDate(date),
    amount: money(cents, "EUR"),
  });

  it.each([
    ["no receipts", [], "ok", undefined],
    ["below 80 %", [receipt("2025-02-01", 700000n)], "ok", undefined],
    ["at 80 %", [receipt("2025-02-01", 800000n)], "approaching", undefined],
    ["exactly the ceiling", [receipt("2025-02-01", 1000000n)], "approaching", undefined],
    [
      "above the ceiling",
      [receipt("2025-03-01", 600000n), receipt("2025-02-01", 400001n)],
      "exceeded",
      "2025-03-01",
    ],
  ])("%s -> %s", (_label, receipts, status, crossedOn) => {
    const result = evaluate(config, {
      year: 2025,
      currency: "EUR",
      receipts,
      asOf: isoDate("2025-12-31"),
    });
    expect(result.status).toBe(status);
    expect(result.thresholds[0]?.crossedOn).toBe(crossedOn);
    expect(result.explanation[0]?.ruleId).toBe("xx.revenue");
  });

  it("ignores receipts of other years and after asOf", () => {
    const result = evaluate(config, {
      year: 2025,
      currency: "EUR",
      receipts: [
        receipt("2024-12-31", 5000000n),
        receipt("2025-06-01", 100n),
        receipt("2025-07-01", 5000000n),
      ],
      asOf: isoDate("2025-06-30"),
    });
    expect(result.total).toEqual(money(100n, "EUR"));
    expect(result.thresholds[0]?.ratio).toEqual({ coefficient: 1n, scale: 4 });
  });
});
