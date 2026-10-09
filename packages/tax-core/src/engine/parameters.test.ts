import { decimal, money, price } from "@fairhour/money";
import { describe, expect, it } from "vitest";
import { ParameterNotFoundError } from "../errors";
import type { ParameterVersion } from "../pack/types";
import { isoDate } from "../primitives";
import { miniSource } from "../testing/mini-pack";
import { testPack, xxParameters } from "../testing/test-pack";
import { deepFreeze, isDeeplyFrozen } from "./freeze";
import { listParameters, parametersToJson, resolveParameters, toJsonValue } from "./parameters";

const version = (id: string, from: string): ParameterVersion<{ readonly id: string }> => ({
  id,
  effectiveFrom: isoDate(from),
  params: { id },
  sources: [miniSource],
  changes: [id],
});

const timeline = [
  version("v1", "2020-01-01"),
  version("v2", "2023-01-01"),
  version("v3", "2024-07-01"),
];

describe("resolveParameters", () => {
  it.each([
    ["2020-01-01", "v1"], // first day
    ["2022-12-31", "v1"], // day before a boundary
    ["2023-01-01", "v2"], // boundary
    ["2024-06-30", "v2"],
    ["2024-07-01", "v3"],
    ["9999-12-31", "v3"], // far future
  ])("%s -> %s", (date, id) => {
    expect(resolveParameters(timeline, "t", isoDate(date)).id).toBe(id);
  });

  it("does not depend on the order of the versions", () => {
    expect(resolveParameters([...timeline].reverse(), "t", isoDate("2023-06-01")).id).toBe("v2");
  });

  it("throws ParameterNotFoundError before the first version, with its start date", () => {
    try {
      resolveParameters([...timeline].reverse(), "t", isoDate("2019-12-31"));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ParameterNotFoundError);
      expect((error as ParameterNotFoundError).firstEffectiveFrom).toBe("2020-01-01");
      expect((error as ParameterNotFoundError).packId).toBe("t");
      expect((error as ParameterNotFoundError).date).toBe("2019-12-31");
    }
    expect(() => resolveParameters([], "t", isoDate("2020-01-01"))).toThrow(
      /no parameter versions/,
    );
  });
});

describe("listParameters and parametersToJson", () => {
  it("adds the inclusive last day of every version but the current one", () => {
    const list = listParameters({ ...testPack, parameters: [...xxParameters].reverse() });
    expect(list.map((entry) => [entry.id, entry.effectiveFrom, entry.effectiveUntil])).toEqual([
      ["xx-2020-01-01", "2020-01-01", "2023-12-31"],
      ["xx-2024-01-01", "2024-01-01", undefined],
    ]);
    expect("effectiveUntil" in (list[1] ?? {})).toBe(false);
  });

  it("converts parameters to JSON with decimal strings and keeps key order", () => {
    const json = parametersToJson(listParameters(testPack));
    expect(json[0]).toMatchObject({
      id: "xx-2020-01-01",
      effectiveUntil: "2023-12-31",
      params: { standardRate: "20", fixedCharge: "1.50", fixedChargeThreshold: "50.00" },
      changes: ["Initial version."],
    });
    expect(Object.keys(json[0] ?? {})).toEqual([
      "id",
      "effectiveFrom",
      "effectiveUntil",
      "params",
      "sources",
      "changes",
    ]);
    expect(Object.keys(json[1] ?? {})).toEqual([
      "id",
      "effectiveFrom",
      "params",
      "sources",
      "changes",
    ]);
    expect(JSON.parse(JSON.stringify(json))).toEqual(json);
  });
});

describe("toJsonValue", () => {
  it.each([
    ["a string", "x", "x"],
    ["a number", 1.5, 1.5],
    ["a boolean", true, true],
    ["null", null, null],
    ["a bigint", 12n, "12"],
    ["a Decimal", decimal("1.50"), "1.50"],
    ["a Price", price("0.4253", "EUR"), "0.4253"],
    ["a Money", money(-1050n, "EUR"), { amount: "-10.50", currency: "EUR" }],
    ["an array with holes", [1, undefined, decimal("2")], [1, null, "2"]],
    [
      "an object",
      { b: 1, a: undefined, c: { d: money(5n, "JPY") } },
      { b: 1, c: { d: { amount: "5", currency: "JPY" } } },
    ],
    [
      "a null-prototype object",
      Object.assign(Object.create(null) as object, { k: "v" }),
      { k: "v" },
    ],
  ])("converts %s", (_label, value, expected) => {
    expect(toJsonValue(value)).toEqual(expected);
  });

  it("keeps key order", () => {
    expect(Object.keys(toJsonValue({ z: 1, a: 2, m: 3 }) as object)).toEqual(["z", "a", "m"]);
  });

  it.each([
    ["undefined", undefined],
    ["a function", () => 1],
    ["a symbol", Symbol("s")],
    ["NaN", Number.NaN],
    ["a Date", new Date(0)],
    ["a Map", new Map()],
  ])("rejects %s", (_label, value) => {
    expect(() => toJsonValue(value)).toThrow(TypeError);
  });
});

describe("deepFreeze", () => {
  it("freezes nested values once, including shared and cyclic references", () => {
    const shared = { x: [1, { y: 2 }] };
    const cyclic: { self?: unknown; shared: typeof shared } = { shared };
    cyclic.self = cyclic;
    expect(deepFreeze(cyclic)).toBe(cyclic);
    expect(isDeeplyFrozen(cyclic)).toBe(true);
    expect(isDeeplyFrozen({ a: Object.freeze({}) })).toBe(false);
    expect(isDeeplyFrozen(Object.freeze({ a: {} }))).toBe(false);
    expect(isDeeplyFrozen(5)).toBe(true);
    expect(deepFreeze("text")).toBe("text");
  });
});
