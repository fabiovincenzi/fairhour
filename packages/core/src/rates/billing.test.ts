import fc from "fast-check";
import {
  type Decimal,
  type RoundingMode,
  decimal,
  decimalEquals,
  decimalToString,
  extend,
  moneyToJson,
  parseMoney,
  price,
  toDecimalString,
} from "@fairhour/money";
import { describe, expect, it } from "vitest";
import { InvalidBillingModeError, InvalidDurationError } from "../errors";
import {
  type BillingMode,
  type DayRateMode,
  type HourlyOptions,
  billableAmount,
  dayRateAmount,
  dayRateDays,
  fixedAmount,
  hourlyAmount,
  hoursFromSeconds,
  mileageAmount,
} from "./billing";
import { billingModeSchema } from "./schemas";

const h = (hours: number, minutes = 0, seconds = 0): bigint =>
  BigInt(hours * 3600 + minutes * 60 + seconds);
const options: HourlyOptions = { hoursScale: 2, hoursRounding: "halfUp", amountRounding: "halfUp" };
const dayRate: DayRateMode = {
  kind: "day-rate",
  hoursPerDay: decimal("8"),
  halfDayMaxHours: decimal("4"),
};

describe("hoursFromSeconds", () => {
  it.each<[bigint, number, RoundingMode, string]>([
    [0n, 2, "halfUp", "0.00"],
    [5400n, 2, "halfUp", "1.50"],
    [900n, 2, "halfUp", "0.25"],
    [360n, 2, "halfUp", "0.10"],
    [1000n, 2, "halfUp", "0.28"], // 0.2777...
    [1000n, 2, "down", "0.27"],
    [1000n, 2, "up", "0.28"],
    [1000n, 4, "halfUp", "0.2778"],
    [1000n, 3, "halfEven", "0.278"],
    [18n, 2, "halfUp", "0.01"], // 0.005 exactly: the tie goes up
    [18n, 2, "halfEven", "0.00"],
    [h(100), 2, "halfUp", "100.00"],
  ])("%d seconds, scale %d, %s -> %s", (seconds, scale, rounding, expected) => {
    expect(decimalToString(hoursFromSeconds(seconds, scale, rounding))).toBe(expected);
  });

  it("rejects negative seconds", () => {
    expect(() => hoursFromSeconds(-1n, 2, "halfUp")).toThrow(InvalidDurationError);
  });
});

describe("hourlyAmount", () => {
  const rate = price("80", "EUR");

  it.each<[string, bigint, string, string, HourlyOptions?]>([
    ["an hour and a half", h(1, 30), "1.50", "120.00"],
    ["twenty minutes at 80/h: 0.33 h, not 1/3", h(0, 20), "0.33", "26.40"],
    [
      "twenty minutes, hours rounded up",
      h(0, 20),
      "0.34",
      "27.20",
      { ...options, hoursRounding: "up" },
    ],
    ["twenty minutes, three decimals", h(0, 20), "0.333", "26.64", { ...options, hoursScale: 3 }],
    ["nothing tracked", 0n, "0.00", "0.00"],
    ["a full week", h(40), "40.00", "3200.00"],
  ])("%s", (_name, seconds, quantity, amount, custom = options) => {
    const line = hourlyAmount(seconds, rate, custom);
    expect(line.unit).toBe("hour");
    expect(decimalToString(line.quantity)).toBe(quantity);
    expect(toDecimalString(line.amount)).toBe(amount);
    expect(line.unitPrice).toBe(rate);
  });

  it("rounds the line total with its own mode", () => {
    const sub = price("33.333", "EUR");
    const down = hourlyAmount(h(1), sub, { ...options, amountRounding: "down" });
    const up = hourlyAmount(h(1), sub, { ...options, amountRounding: "up" });
    expect([toDecimalString(down.amount), toDecimalString(up.amount)]).toEqual(["33.33", "33.34"]);
  });

  it("the total is exactly quantity x rate, what the invoice shows (property)", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 10_000_000n }),
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 0, max: 99 }),
        fc.constantFrom(2 as const, 3 as const, 4 as const),
        (seconds, whole, cents, hoursScale) => {
          const unit = price(`${whole}.${String(cents).padStart(2, "0")}`, "EUR");
          const line = hourlyAmount(seconds, unit, { ...options, hoursScale });
          expect(line.amount).toEqual(extend(unit, line.quantity, "halfUp"));
          // the quantity is within half a unit of its last decimal of the exact hours
          const diff = line.quantity.coefficient * 3600n - seconds * 10n ** BigInt(hoursScale);
          expect(2n * (diff < 0n ? -diff : diff) <= 3600n).toBe(true);
        },
      ),
    );
  });
});

describe("dayRateDays", () => {
  const days = (value: Decimal): string => decimalToString(value);

  it.each<[string, bigint[], string]>([
    ["no days", [], "0.0"],
    ["a day without time counts nothing", [0n], "0.0"],
    ["a single second is a half day", [1n], "0.5"],
    ["exactly the half-day limit is a half day", [h(4)], "0.5"],
    ["a second over the limit is a whole day", [h(4, 0, 1)], "1.0"],
    ["a full day", [h(8)], "1.0"],
    ["more than a full day still counts one", [h(14)], "1.0"],
    ["a week", [h(8), h(8), h(2), h(5), h(4), 0n, 0n], "4.0"],
    ["many short days", [h(1), h(1), h(1), h(1)], "2.0"],
  ])("%s", (_name, seconds, expected) => {
    expect(days(dayRateDays(seconds, dayRate))).toBe(expected);
  });

  it("compares the half-day limit exactly, with fractional hours", () => {
    const mode: DayRateMode = { ...dayRate, halfDayMaxHours: decimal("3.5") };
    expect(days(dayRateDays([h(3, 30)], mode))).toBe("0.5");
    expect(days(dayRateDays([h(3, 30, 1)], mode))).toBe("1.0");
  });

  it("is a multiple of one half and between 0.5 and 1 per non-empty day (property)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.bigInt({ min: 0n, max: 20n * 3600n }), { maxLength: 40 }),
        (seconds) => {
          const result = dayRateDays(seconds, dayRate);
          const nonEmpty = BigInt(seconds.filter((s) => s > 0n).length);
          expect(result.scale).toBe(1);
          expect(result.coefficient % 5n).toBe(0n);
          expect(result.coefficient >= 5n * nonEmpty && result.coefficient <= 10n * nonEmpty).toBe(
            true,
          );
        },
      ),
    );
  });

  it.each<[string, DayRateMode, string]>([
    ["no hours in a day", { ...dayRate, hoursPerDay: decimal("0") }, "non-positive-hours-per-day"],
    ["negative day", { ...dayRate, hoursPerDay: decimal("-8") }, "non-positive-hours-per-day"],
    ["no half day", { ...dayRate, halfDayMaxHours: decimal("0") }, "non-positive-half-day"],
    [
      "half day longer than a day",
      { ...dayRate, halfDayMaxHours: decimal("9") },
      "half-day-exceeds-day",
    ],
  ])("rejects a day-rate mode with %s", (_name, mode, reason) => {
    expect.assertions(2);
    try {
      dayRateDays([h(1)], mode);
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidBillingModeError);
      expect((error as InvalidBillingModeError).reason).toBe(reason);
    }
  });

  it("rejects negative seconds", () => {
    expect(() => dayRateDays([-1n], dayRate)).toThrow(InvalidDurationError);
  });
});

describe("dayRateAmount", () => {
  it("bills days times the day rate", () => {
    const line = dayRateAmount([h(8), h(3), h(6)], price("400", "EUR"), dayRate, "halfUp");
    expect(line.unit).toBe("day");
    expect(decimalToString(line.quantity)).toBe("2.5");
    expect(toDecimalString(line.amount)).toBe("1000.00");
    expect(
      toDecimalString(dayRateAmount([h(1)], price("333.33", "EUR"), dayRate, "halfUp").amount),
    ).toBe("166.67");
  });
});

describe("fixedAmount", () => {
  it("is the agreed amount, one lump sum", () => {
    const agreed = parseMoney("1500.00", "EUR");
    const line = fixedAmount({ kind: "fixed", amount: agreed });
    expect(line.unit).toBe("lump-sum");
    expect(decimalToString(line.quantity)).toBe("1");
    expect(line.amount).toBe(agreed);
    expect(decimalToString(line.unitPrice.amount)).toBe("1500.00");
    expect(line.unitPrice.currency).toBe("EUR");
  });
});

describe("mileageAmount", () => {
  it.each<[string, string, RoundingMode, string]>([
    ["120.5", "0.4253", "halfUp", "51.25"], // 51.24865
    ["120.5", "0.4253", "down", "51.24"],
    ["120.5", "0.4253", "up", "51.25"],
    ["100", "0.50", "halfUp", "50.00"],
    ["0", "0.4253", "halfUp", "0.00"],
    ["33.3", "0.45", "halfEven", "14.98"], // 14.985 is a tie: the even neighbour
    ["33.3", "0.45", "halfUp", "14.99"],
    ["33.3", "0.45", "halfDown", "14.98"],
  ])("%s km at %s/km, %s -> %s", (km, rate, rounding, expected) => {
    const line = mileageAmount(decimal(km), price(rate, "EUR"), rounding);
    expect(line.unit).toBe("km");
    expect(toDecimalString(line.amount)).toBe(expected);
    expect(decimalToString(line.quantity)).toBe(km);
    expect(decimalToString(line.unitPrice.amount)).toBe(rate);
  });
});

describe("billableAmount", () => {
  const usage = { seconds: h(10), secondsPerDay: [h(8), h(2)] };

  it.each<[string, BillingMode, string, string, string]>([
    ["hourly", { kind: "hourly" }, "hour", "10.00", "800.00"],
    ["day rate", dayRate, "day", "1.5", "120.00"],
    ["fixed", { kind: "fixed", amount: parseMoney("500.00", "EUR") }, "lump-sum", "1", "500.00"],
  ])("dispatches %s", (_name, mode, unit, quantity, amount) => {
    const line = billableAmount(mode, usage, price("80", "EUR"), options);
    expect(line.unit).toBe(unit);
    expect(decimalToString(line.quantity)).toBe(quantity);
    expect(toDecimalString(line.amount)).toBe(amount);
  });

  it("a fixed price ignores the hours entirely (property)", () => {
    const mode: BillingMode = { kind: "fixed", amount: parseMoney("1500.00", "EUR") };
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10n ** 7n }), (seconds) => {
        const line = billableAmount(
          mode,
          { seconds, secondsPerDay: [seconds] },
          price("1", "EUR"),
          options,
        );
        expect(toDecimalString(line.amount)).toBe("1500.00");
      }),
    );
  });
});

describe("billingModeSchema", () => {
  it("decodes the three modes", () => {
    expect(billingModeSchema.parse({ kind: "hourly" })).toEqual({ kind: "hourly" });
    const fixed = billingModeSchema.parse({
      kind: "fixed",
      amount: { amount: "1500.00", currency: "EUR" },
    });
    expect(fixed.kind === "fixed" && moneyToJson(fixed.amount)).toEqual({
      amount: "1500.00",
      currency: "EUR",
    });
    const day = billingModeSchema.parse({
      kind: "day-rate",
      hoursPerDay: "8",
      halfDayMaxHours: "4.5",
    });
    expect(day.kind === "day-rate" && decimalEquals(day.halfDayMaxHours, decimal("4.5"))).toBe(
      true,
    );
  });

  it.each([
    { kind: "hourly", extra: 1 },
    { kind: "monthly" },
    { kind: "fixed" },
    { kind: "fixed", amount: { amount: "1.234", currency: "EUR" } },
    { kind: "day-rate", hoursPerDay: "8" },
    { kind: "day-rate", hoursPerDay: "8", halfDayMaxHours: "9" },
    { kind: "day-rate", hoursPerDay: "0", halfDayMaxHours: "0" },
    { kind: "day-rate", hoursPerDay: "eight", halfDayMaxHours: "4" },
    null,
  ])("rejects %j", (value) => {
    expect(billingModeSchema.safeParse(value).success).toBe(false);
  });
});
