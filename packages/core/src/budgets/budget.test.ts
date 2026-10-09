import fc from "fast-check";
import {
  CurrencyMismatchError,
  type Decimal,
  compareDecimal,
  decimal,
  decimalEquals,
  decimalToString,
  money,
  parseMoney,
  toDecimalString,
} from "@fairhour/money";
import { describe, expect, it } from "vitest";
import { InvalidBudgetError, InvalidDurationError } from "../errors";
import {
  DEFAULT_BUDGET_THRESHOLDS,
  type BudgetStatus,
  RATIO_SCALE,
  budgetStatus,
  estimateVsActual,
} from "./budget";

const h = (hours: number, minutes = 0, seconds = 0): bigint =>
  BigInt(hours * 3600 + minutes * 60 + seconds);
const ds = (values: readonly Decimal[]): string[] => values.map(decimalToString);
const eur = (text: string) => parseMoney(text, "EUR");

describe("budgetStatus: hours", () => {
  const budget = { kind: "hours", seconds: h(100) } as const;

  it.each<[string, bigint, string, string[], bigint]>([
    ["nothing used", 0n, "0.0000", [], h(100)],
    ["half used", h(50), "0.5000", [], h(50)],
    ["one second before 80%", h(79, 59, 59), "0.7999", [], h(20, 0, 1)],
    ["exactly 80%", h(80), "0.8000", ["0.8"], h(20)],
    ["99%", h(99), "0.9900", ["0.8"], h(1)],
    ["one second before 100%", h(99, 59, 59), "0.9999", ["0.8"], 1n],
    ["exactly 100%", h(100), "1.0000", ["0.8", "1"], 0n],
    ["over budget", h(110), "1.1000", ["0.8", "1"], -h(10)],
    ["far over budget", h(250), "2.5000", ["0.8", "1"], -h(150)],
  ])("%s", (_name, consumed, ratio, crossed, remaining) => {
    const status = budgetStatus({ budget, consumed });
    expect(status.kind).toBe("hours");
    expect(status.budget).toBe(h(100));
    expect(status.consumed).toBe(consumed);
    expect(status.remaining).toBe(remaining);
    expect(decimalToString(status.ratio)).toBe(ratio);
    expect(ds(status.crossed)).toEqual(crossed);
  });
});

describe("budgetStatus: amount", () => {
  const budget = { kind: "amount", amount: eur("5000.00") } as const;

  it.each<[string, string, string, string[], string]>([
    ["nothing", "0.00", "0.0000", [], "5000.00"],
    ["80%", "4000.00", "0.8000", ["0.8"], "1000.00"],
    ["a cent below 80%", "3999.99", "0.7999", [], "1000.01"],
    ["a cent below 100%", "4999.99", "0.9999", ["0.8"], "0.01"],
    ["exactly 100%", "5000.00", "1.0000", ["0.8", "1"], "0.00"],
    [
      "a cent over: ratio is truncated, the alert is exact",
      "5000.01",
      "1.0000",
      ["0.8", "1"],
      "-0.01",
    ],
    ["double", "10000.00", "2.0000", ["0.8", "1"], "-5000.00"],
  ])("%s", (_name, consumed, ratio, crossed, remaining) => {
    const status = budgetStatus({ budget, consumed: eur(consumed) });
    expect(status.kind).toBe("amount");
    expect(toDecimalString(status.consumed)).toBe(consumed);
    expect(toDecimalString(status.remaining)).toBe(remaining);
    expect(toDecimalString(status.budget)).toBe("5000.00");
    expect(decimalToString(status.ratio)).toBe(ratio);
    expect(ds(status.crossed)).toEqual(crossed);
  });

  it("works in currencies without decimals", () => {
    const status = budgetStatus({
      budget: { kind: "amount", amount: money(100_000n, "JPY") },
      consumed: money(80_000n, "JPY"),
    });
    expect(ds(status.crossed)).toEqual(["0.8"]);
    expect(status.remaining).toEqual(money(20_000n, "JPY"));
  });

  it("refuses to compare two currencies", () => {
    expect(() => budgetStatus({ budget, consumed: parseMoney("10.00", "USD") })).toThrow(
      CurrencyMismatchError,
    );
  });
});

describe("thresholds", () => {
  const budget = { kind: "hours", seconds: h(100) } as const;
  const crossedAt = (consumed: bigint, thresholds: string[]): string[] =>
    ds(budgetStatus({ budget, consumed, thresholds: thresholds.map(decimal) }).crossed);

  it("default to 80% and 100%", () => {
    expect(ds(DEFAULT_BUDGET_THRESHOLDS)).toEqual(["0.8", "1"]);
    expect(RATIO_SCALE).toBe(4);
  });

  it.each<[string, bigint, string[], string[]]>([
    ["custom list", h(60), ["0.5", "0.9"], ["0.5"]],
    ["unsorted input comes back ascending", h(130), ["1.2", "0.5", "1"], ["0.5", "1", "1.2"]],
    ["duplicates by value are listed once", h(100), ["1", "1.0", "1.00"], ["1"]],
    ["no thresholds, no alerts", h(500), [], []],
    ["thresholds above 100% alert on overrun", h(119), ["1.2"], []],
    ["a threshold written with many decimals", h(80, 0, 36), ["0.80010"], ["0.80010"]],
    ["an exact tie crosses", h(12, 30), ["0.125"], ["0.125"]],
  ])("%s", (_name, consumed, thresholds, expected) => {
    expect(crossedAt(consumed, thresholds)).toEqual(expected);
  });

  it.each([["0"], ["-0.5"], ["0.0"]])("rejects the non-positive threshold %s", (value) => {
    expect(() => crossedAt(0n, ["0.5", value])).toThrow(
      new InvalidBudgetError("invalid-threshold"),
    );
  });

  it("does not mutate the thresholds it is given", () => {
    const given = [decimal("1"), decimal("0.5")];
    budgetStatus({ budget, consumed: 1n, thresholds: given });
    expect(ds(given)).toEqual(["1", "0.5"]);
  });
});

describe("budgetStatus: invalid input", () => {
  it.each<[string, () => BudgetStatus, string]>([
    [
      "an empty hours budget",
      () => budgetStatus({ budget: { kind: "hours", seconds: 0n }, consumed: 0n }),
      "non-positive-budget",
    ],
    [
      "a negative hours budget",
      () => budgetStatus({ budget: { kind: "hours", seconds: -1n }, consumed: 0n }),
      "non-positive-budget",
    ],
    [
      "an empty amount budget",
      () =>
        budgetStatus({
          budget: { kind: "amount", amount: money(0n, "EUR") },
          consumed: money(0n, "EUR"),
        }),
      "non-positive-budget",
    ],
    [
      "negative hours consumed",
      () => budgetStatus({ budget: { kind: "hours", seconds: 1n }, consumed: -1n }),
      "negative-consumed",
    ],
    [
      "negative amount consumed",
      () =>
        budgetStatus({
          budget: { kind: "amount", amount: money(1n, "EUR") },
          consumed: money(-1n, "EUR"),
        }),
      "negative-consumed",
    ],
  ])("rejects %s", (_name, call, reason) => {
    expect.assertions(2);
    try {
      call();
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidBudgetError);
      expect((error as InvalidBudgetError).reason).toBe(reason);
    }
  });
});

describe("budgetStatus: properties", () => {
  const thresholdArb = fc
    .record({ whole: fc.integer({ min: 0, max: 3 }), fraction: fc.stringMatching(/^[0-9]{1,3}$/) })
    .map(({ whole, fraction }) => decimal(`${whole}.${fraction}`))
    .filter((threshold) => threshold.coefficient > 0n);

  it("reports exactly the thresholds that consumed/budget reaches, ascending, once each", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 10n ** 9n }),
        fc.bigInt({ min: 0n, max: 3n * 10n ** 9n }),
        fc.array(thresholdArb, { maxLength: 6 }),
        (budgetSeconds, consumed, thresholds) => {
          const status = budgetStatus({
            budget: { kind: "hours", seconds: budgetSeconds },
            consumed,
            thresholds,
          });
          const expected = [...thresholds]
            .sort(compareDecimal)
            .filter((t, i, all) => i === 0 || !decimalEquals(all[i - 1] ?? t, t))
            .filter((t) => consumed * 10n ** BigInt(t.scale) >= t.coefficient * budgetSeconds);
          expect(status.crossed.length).toBe(expected.length);
          status.crossed.forEach((t, i) => {
            expect(decimalEquals(t, expected[i] ?? decimal("-1"))).toBe(true);
          });
          expect(status.remaining + status.consumed).toBe(budgetSeconds);
        },
      ),
    );
  });

  it("the ratio is the exact quotient truncated to four places", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 10n ** 9n }),
        fc.bigInt({ min: 0n, max: 3n * 10n ** 9n }),
        (budgetSeconds, consumed) => {
          const { ratio } = budgetStatus({
            budget: { kind: "hours", seconds: budgetSeconds },
            consumed,
          });
          expect(ratio.scale).toBe(4);
          // ratio <= consumed/budget < ratio + 0.0001
          expect(ratio.coefficient * budgetSeconds <= consumed * 10_000n).toBe(true);
          expect((ratio.coefficient + 1n) * budgetSeconds > consumed * 10_000n).toBe(true);
        },
      ),
    );
  });
});

describe("estimateVsActual", () => {
  it.each<[string, bigint, bigint, bigint, string | null, "under" | "on" | "over"]>([
    ["under the estimate", h(10), h(6), -h(4), "0.6000", "under"],
    ["exactly on estimate", h(10), h(10), 0n, "1.0000", "on"],
    ["over the estimate", h(10), h(15), h(5), "1.5000", "over"],
    ["a second over", h(10), h(10, 0, 1), 1n, "1.0000", "over"],
    ["nothing tracked yet", h(10), 0n, -h(10), "0.0000", "under"],
    ["ratio is truncated", 3n, 1n, -2n, "0.3333", "under"],
    ["no estimate but time tracked", 0n, h(1), h(1), null, "over"],
    ["no estimate and no time", 0n, 0n, 0n, null, "on"],
  ])("%s", (_name, estimate, actual, variance, ratio, status) => {
    const result = estimateVsActual(estimate, actual);
    expect(result.estimateSeconds).toBe(estimate);
    expect(result.actualSeconds).toBe(actual);
    expect(result.varianceSeconds).toBe(variance);
    expect(result.ratio === null ? null : decimalToString(result.ratio)).toBe(ratio);
    expect(result.status).toBe(status);
  });

  it("rejects negative inputs", () => {
    expect(() => estimateVsActual(-1n, 0n)).toThrow(InvalidDurationError);
    expect(() => estimateVsActual(0n, -1n)).toThrow(InvalidDurationError);
  });
});
