import fc from "fast-check";
import { type RoundingMode, money, parseMoney, toDecimalString } from "@fairhour/money";
import { describe, expect, it } from "vitest";
import { InvalidDurationError } from "../errors";
import { effectiveHourlyRate } from "./effective-rate";

const h = (hours: number, minutes = 0): bigint => BigInt(hours * 3600 + minutes * 60);

describe("effectiveHourlyRate", () => {
  it.each<[string, string, string, bigint, RoundingMode, string | null]>([
    ["round hours", "EUR", "1000.00", h(40), "halfUp", "25.00"],
    ["fractional, half up", "EUR", "1000.00", h(7), "halfUp", "142.86"],
    ["fractional, down", "EUR", "1000.00", h(7), "down", "142.85"],
    ["fractional, up", "EUR", "1000.00", h(7), "up", "142.86"],
    ["a tie, half even", "EUR", "0.05", 7200n, "halfEven", "0.02"],
    ["a tie, half up", "EUR", "0.05", 7200n, "halfUp", "0.03"],
    ["a tie, half down", "EUR", "0.05", 7200n, "halfDown", "0.02"],
    ["less than an hour", "EUR", "50.00", h(0, 20), "halfUp", "150.00"],
    ["one second tracked", "EUR", "1.00", 1n, "halfUp", "3600.00"],
    ["zero revenue", "EUR", "0.00", h(3), "halfUp", "0.00"],
    ["yen has no decimals", "JPY", "100000", h(3), "halfUp", "33333"],
    ["dinars have three decimals", "KWD", "100.000", h(3), "halfUp", "33.333"],
    ["no time tracked gives null, not infinity", "EUR", "1000.00", 0n, "halfUp", null],
    ["no time and no revenue gives null", "EUR", "0.00", 0n, "down", null],
    ["a negative revenue (credit) keeps its sign", "EUR", "-100.00", h(3), "halfUp", "-33.33"],
  ])("%s", (_name, currency, revenue, seconds, rounding, expected) => {
    const result = effectiveHourlyRate(
      parseMoney(revenue, currency as "EUR" | "JPY" | "KWD"),
      seconds,
      rounding,
    );
    expect(result === null ? null : toDecimalString(result)).toBe(expected);
    if (result !== null) expect(result.currency).toBe(currency);
  });

  it("rejects negative durations", () => {
    expect(() => effectiveHourlyRate(money(100n, "EUR"), -1n, "halfUp")).toThrow(
      InvalidDurationError,
    );
  });

  it("stays within half a minor unit of the exact rate (halfUp) and below it (down)", () => {
    const revenue = fc.bigInt({ min: 0n, max: 10n ** 12n });
    const seconds = fc.bigInt({ min: 1n, max: 10n ** 7n });
    fc.assert(
      fc.property(revenue, seconds, (amount, tracked) => {
        const exactNumerator = amount * 3600n; // exact rate = exactNumerator / tracked
        const nearest = effectiveHourlyRate(money(amount, "EUR"), tracked, "halfUp");
        const lower = effectiveHourlyRate(money(amount, "EUR"), tracked, "down");
        const upper = effectiveHourlyRate(money(amount, "EUR"), tracked, "up");
        if (nearest === null || lower === null || upper === null) throw new Error("unreachable");
        const error = nearest.amount * tracked - exactNumerator;
        expect(2n * (error < 0n ? -error : error) <= tracked).toBe(true);
        expect(lower.amount * tracked <= exactNumerator).toBe(true);
        expect(exactNumerator - lower.amount * tracked < tracked).toBe(true);
        expect(upper.amount >= lower.amount && upper.amount - lower.amount <= 1n).toBe(true);
      }),
    );
  });
});
