import { decimal, money, price } from "@fairhour/money";
import { describe, expect, it } from "vitest";
import { isoDate } from "../primitives";
import { message, p } from "./params";
import { messageRefProblem } from "./validate";

describe("message builders", () => {
  it("builds typed parameters and omits absent params", () => {
    expect(message("k")).toEqual({ key: "k" });
    expect(Object.keys(message("k"))).toEqual(["key"]);
    expect(message("k", { a: p.text("x") })).toEqual({
      key: "k",
      params: { a: { type: "text", value: "x" } },
    });
    expect(p.money(money(1n, "EUR")).type).toBe("money");
    expect(p.price(price("1", "EUR")).type).toBe("price");
    expect(p.decimal(decimal("1")).type).toBe("decimal");
    expect(p.percent(decimal("1")).type).toBe("percent");
    expect(p.date(isoDate("2026-01-01")).type).toBe("date");
    expect(p.message(message("x")).type).toBe("message");
    expect(Object.isFrozen(p)).toBe(true);
  });
});

describe("messageRefProblem", () => {
  const nest = (depth: number): unknown =>
    depth === 0
      ? message("leaf")
      : { key: "n", params: { next: { type: "message", value: nest(depth - 1) } } };

  it.each([
    ["a plain reference", message("k"), undefined],
    [
      "every parameter type",
      message("k", {
        a: p.money(money(1n, "EUR")),
        b: p.price(price("1.5", "EUR")),
        c: p.decimal(decimal("-1")),
        d: p.percent(decimal("22")),
        e: p.date(isoDate("2026-01-01")),
        f: p.text("t"),
        g: p.message(message("inner")),
      }),
      undefined,
    ],
    ["four levels of nesting", nest(4), undefined],
    ["five levels of nesting", nest(5), /nested deeper than 4/],
    ["not an object", "k", /not a MessageRef/],
    ["an empty key", { key: "" }, /key is empty/],
    ["params that are not an object", { key: "k", params: [] }, /params is not an object/],
    [
      "a parameter that is not an object",
      { key: "k", params: { a: 1 } },
      /parameter "a" is not a MessageParam/,
    ],
    ["a bad money", { key: "k", params: { a: { type: "money", value: 1 } } }, /is not a Money/],
    ["a bad price", { key: "k", params: { a: { type: "price", value: "1" } } }, /is not a Price/],
    [
      "a bad decimal",
      { key: "k", params: { a: { type: "percent", value: 22 } } },
      /is not a Decimal/,
    ],
    [
      "a bad date",
      { key: "k", params: { a: { type: "date", value: "2026-02-30" } } },
      /is not an ISO date/,
    ],
    ["a bad text", { key: "k", params: { a: { type: "text", value: 1 } } }, /is not a string/],
    [
      "a bad nested message",
      { key: "k", params: { a: { type: "message", value: { key: "" } } } },
      /invalid message: key is empty/,
    ],
    ["an unknown type", { key: "k", params: { a: { type: "html", value: "x" } } }, /unknown type/],
  ])("%s", (_label, value, problem) => {
    const result = messageRefProblem(value);
    if (problem === undefined) expect(result).toBeUndefined();
    else expect(result).toMatch(problem);
  });

  it("checks currency and sign when a currency is given", () => {
    const usd = message("k", { a: p.money(money(1n, "USD")) });
    expect(messageRefProblem(usd)).toBeUndefined();
    expect(messageRefProblem(usd, "EUR")).toMatch(/not in EUR/);
    expect(messageRefProblem(message("k", { a: p.money(money(-1n, "EUR")) }), "EUR")).toMatch(
      /negative/,
    );
    expect(messageRefProblem(message("k", { a: p.price(price("1", "USD")) }), "EUR")).toMatch(
      /not in EUR/,
    );
    expect(
      messageRefProblem(message("k", { a: p.money(money(0n, "EUR")) }), "EUR"),
    ).toBeUndefined();
  });
});
