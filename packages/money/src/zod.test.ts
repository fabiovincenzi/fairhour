import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import * as z from "zod";

import { currencyArb, decimalArb, moneyArb } from "../test/arbitraries";
import type { CurrencyCode } from "./currency";
import { MAX_DECIMAL_DIGITS, decimal, decimalToString, multiplyDecimal } from "./decimal";
import { InvalidAmountError, InvalidCurrencyError } from "./errors";
import { moneyToJson, priceToJson } from "./json";
import { money } from "./money";
import { price, priceFromMoney } from "./price";
import {
  currencyCodeSchema,
  decimalSchema,
  decimalStringSchema,
  moneyJsonSchema,
  moneyStringSchema,
  priceJsonSchema,
} from "./zod";

function issues(result: { success: boolean; error?: z.ZodError }) {
  return (result.error?.issues ?? []).map((issue) => ({
    path: issue.path,
    message: issue.message,
  }));
}

describe("currencyCodeSchema", () => {
  it("accepts exact codes and rejects anything else", () => {
    expect(currencyCodeSchema.parse("EUR")).toBe("EUR");
    for (const value of ["eur", " EUR", "XXX", "", 978, null]) {
      const result = currencyCodeSchema.safeParse(value);
      expect(result.success).toBe(false);
    }
    expect(issues(currencyCodeSchema.safeParse("eur"))[0]?.message).toContain("ISO 4217");
  });
});

describe("decimalStringSchema and decimalSchema", () => {
  it("validates decimal strings and keeps them as strings", () => {
    expect(decimalStringSchema.parse("1.50")).toBe("1.50");
    for (const value of ["1,5", "1e3", "", " 1", 1.5, "1".repeat(81)]) {
      expect(decimalStringSchema.safeParse(value).success).toBe(false);
    }
  });

  it("decodes to a Decimal and encodes back", () => {
    const value = decimalSchema.parse("-1.50");
    expect([value.coefficient, value.scale]).toEqual([-150n, 2]);
    expect(z.encode(decimalSchema, decimal("0.4253"))).toBe("0.4253");
    expect(decimalSchema.safeParse("1.5.0").success).toBe(false);
  });

  it("round-trips", () => {
    fc.assert(
      fc.property(decimalArb, (value) => {
        const text = z.encode(decimalSchema, value);
        expect(text).toBe(decimalToString(value));
        expect(decimalSchema.parse(text)).toEqual(value);
      }),
    );
  });
});

describe("moneyJsonSchema", () => {
  it("decodes { amount, currency } to Money", () => {
    expect(moneyJsonSchema.parse({ amount: "1234.56", currency: "EUR" })).toEqual(
      money(123456n, "EUR"),
    );
    expect(moneyJsonSchema.parse({ amount: "1.230", currency: "EUR" })).toEqual(money(123n, "EUR"));
  });

  it("reports invalid amounts and currencies at their path", () => {
    expect(issues(moneyJsonSchema.safeParse({ amount: "1.235", currency: "EUR" }))).toEqual([
      {
        path: ["amount"],
        message: "Amount has more decimals than the currency's minor unit allows",
      },
    ]);
    expect(issues(moneyJsonSchema.safeParse({ amount: "1,23", currency: "EUR" }))[0]?.path).toEqual(
      ["amount"],
    );
    expect(issues(moneyJsonSchema.safeParse({ amount: "1.23", currency: "eur" }))[0]?.path).toEqual(
      ["currency"],
    );
    expect(moneyJsonSchema.safeParse({ amount: 1.23, currency: "EUR" }).success).toBe(false);
    expect(moneyJsonSchema.safeParse(null).success).toBe(false);
  });

  it("encodes Money back to JSON and round-trips", () => {
    expect(z.encode(moneyJsonSchema, money(-50n, "EUR"))).toEqual({
      amount: "-0.50",
      currency: "EUR",
    });
    fc.assert(
      fc.property(moneyArb, (value) => {
        expect(moneyJsonSchema.parse(z.encode(moneyJsonSchema, value))).toEqual(value);
      }),
    );
  });

  it("composes inside other schemas", () => {
    const line = z.object({ total: moneyJsonSchema });
    expect(line.parse({ total: { amount: "1", currency: "JPY" } })).toEqual({
      total: money(1n, "JPY"),
    });
  });
});

describe("moneyStringSchema", () => {
  it("parses an amount in a fixed currency", () => {
    const schema = moneyStringSchema("KWD");
    expect(schema.parse("1.234")).toEqual(money(1234n, "KWD"));
    expect(schema.safeParse("1.2345").success).toBe(false);
    expect(schema.safeParse("abc").success).toBe(false);
    expect(z.encode(schema, money(1n, "KWD"))).toBe("0.001");
  });

  it("refuses to encode another currency and to build for an unknown one", () => {
    const schema = moneyStringSchema("EUR");
    expect(() => z.encode(schema, money(1n, "USD"))).toThrow(z.ZodError);
    expect(() => moneyStringSchema("eur" as CurrencyCode)).toThrow(InvalidCurrencyError);
  });

  it("round-trips", () => {
    fc.assert(
      fc.property(
        currencyArb.chain((currency) => moneyArb.map((m) => money(m.amount, currency))),
        (value) => {
          const schema = moneyStringSchema(value.currency);
          expect(schema.parse(z.encode(schema, value))).toEqual(value);
        },
      ),
    );
  });
});

describe("priceJsonSchema", () => {
  it("decodes, encodes and validates", () => {
    expect(priceJsonSchema.parse({ amount: "0.4253", currency: "EUR" })).toEqual(
      price("0.4253", "EUR"),
    );
    expect(z.encode(priceJsonSchema, price("0.4250", "EUR"))).toEqual({
      amount: "0.4250",
      currency: "EUR",
    });
    expect(priceJsonSchema.safeParse({ amount: "0,42", currency: "EUR" }).success).toBe(false);
    expect(priceJsonSchema.safeParse({ amount: "0.42", currency: "XXX" }).success).toBe(false);
  });
});

describe("encoding limits (symmetric with decoding)", () => {
  const OUT_OF_RANGE = { code: "invalid-amount", reason: "out-of-range" } as const;
  /** The largest coefficient of `MAX_DECIMAL_DIGITS` digits, and the smallest beyond it. */
  const LARGEST = 10n ** BigInt(MAX_DECIMAL_DIGITS) - 1n;
  const TOO_LARGE = LARGEST + 1n;
  /** Every value below has 81 digits; the message names the count, never the value. */
  const OUT_OF_RANGE_MESSAGE =
    "Value out of range for a decimal string (81 digits): at most 80 digits and 40 decimals";

  it("encodes values of 80 digits, which decode back", () => {
    const eur = money(-LARGEST, "EUR");
    expect(moneyJsonSchema.parse(z.encode(moneyJsonSchema, eur))).toEqual(eur);
    const schema = moneyStringSchema("JPY");
    expect(schema.parse(z.encode(schema, money(LARGEST, "JPY")))).toEqual(money(LARGEST, "JPY"));
    const largestPrice = priceFromMoney(money(LARGEST, "CLF"));
    expect(priceJsonSchema.parse(z.encode(priceJsonSchema, largestPrice))).toEqual(largestPrice);
    const largestDecimal = decimal(`${"9".repeat(40)}.${"9".repeat(40)}`);
    expect(decimalSchema.parse(z.encode(decimalSchema, largestDecimal))).toEqual(largestDecimal);
  });

  // Only arithmetic produces such values. The codecs report a zod issue (so safeEncode returns a
  // failure); moneyToJson and priceToJson throw the domain error for the same values.
  const CASES: readonly (readonly [string, z.ZodType, unknown, readonly PropertyKey[]])[] = [
    ["moneyJsonSchema", moneyJsonSchema, money(TOO_LARGE, "EUR"), ["amount"]],
    ["moneyJsonSchema, negative", moneyJsonSchema, money(-TOO_LARGE, "KWD"), ["amount"]],
    ["moneyStringSchema", moneyStringSchema("JPY"), money(TOO_LARGE, "JPY"), []],
    ["priceJsonSchema", priceJsonSchema, priceFromMoney(money(TOO_LARGE, "EUR")), ["amount"]],
    ["decimalSchema", decimalSchema, multiplyDecimal(decimal("9".repeat(80)), decimal("10")), []],
  ];

  it.each(CASES)(
    "%s reports more than 80 digits as an out-of-range issue",
    (_name, schema, value, path) => {
      const result = z.safeEncode(schema, value);
      expect(result.success).toBe(false);
      expect(result.error?.issues).toEqual([
        { code: "custom", path, message: OUT_OF_RANGE_MESSAGE, params: { reason: "out-of-range" } },
      ]);
      expect(() => z.encode(schema, value)).toThrow(z.ZodError);
      expect(() => z.encode(schema, value)).not.toThrow(InvalidAmountError);
    },
  );

  it("never puts the value in the message, and reports it as input only on request", () => {
    const value = money(TOO_LARGE, "EUR");
    const [issue] = z.safeEncode(moneyJsonSchema, value).error?.issues ?? [];
    expect(issue?.message).not.toContain(TOO_LARGE.toString().slice(0, 20));
    expect(issue).not.toHaveProperty("input");
    const reported = z.safeEncode(moneyJsonSchema, value, { reportInput: true });
    expect(reported.error?.issues[0]?.input).toBe(value);
  });

  it("prefixes the issue path inside other schemas", () => {
    const line = z.object({ total: moneyJsonSchema, quantity: decimalSchema });
    const result = z.safeEncode(line, {
      total: money(TOO_LARGE, "EUR"),
      quantity: decimal("1"),
    });
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([["total", "amount"]]);
  });

  it("keeps moneyToJson and priceToJson throwing InvalidAmountError for the same values", () => {
    expect(() => moneyToJson(money(TOO_LARGE, "EUR"))).toThrow(
      expect.objectContaining(OUT_OF_RANGE),
    );
    expect(() => priceToJson(priceFromMoney(money(TOO_LARGE, "EUR")))).toThrow(
      expect.objectContaining(OUT_OF_RANGE),
    );
    expect(() => moneyToJson(money(TOO_LARGE, "EUR"))).toThrow(InvalidAmountError);
  });
});
