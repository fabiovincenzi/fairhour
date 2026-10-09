import fc from "fast-check";
import { InvalidAmountError, type Price, decimal, decimalToString, price } from "@fairhour/money";
import { describe, expect, it } from "vitest";
import { DuplicateExchangeRateError, MissingRateError, RateCurrencyMismatchError } from "./errors";
import { type RateLevels, type RateSource, resolveRate } from "./resolve";
import type { RateUnit, UnitRate } from "./unit";

const perHour = (amount: Price): UnitRate => ({ unit: "hour", price: amount });
const perDay = (amount: Price): UnitRate => ({ unit: "day", price: amount });

const taskPrice = price("120", "EUR");
const projectPrice = price("100", "EUR");
const clientPrice = price("90", "EUR");
const workspacePrice = price("80", "EUR");
const task = perHour(taskPrice);
const project = perHour(projectPrice);
const client = perHour(clientPrice);
const workspace = perHour(workspacePrice);

describe("resolveRate", () => {
  it.each<[string, Omit<RateLevels, "unit">, RateSource, string]>([
    ["task wins over everything", { task, project, client, workspace }, "task", "120"],
    ["project when there is no task rate", { project, client, workspace }, "project", "100"],
    ["client when there is no task or project rate", { client, workspace }, "client", "90"],
    ["the workspace default as a last resort", { workspace }, "workspace", "80"],
    [
      "null (as stored) means not set",
      { task: null, project: null, client, workspace },
      "client",
      "90",
    ],
    [
      "undefined means not set",
      { task: undefined, project, client: undefined, workspace },
      "project",
      "100",
    ],
    [
      "a zero rate is a rate (pro bono)",
      { task: perHour(price("0", "EUR")), project, workspace },
      "task",
      "0",
    ],
    [
      "a project rate beats a lower-priority client rate even when lower",
      {
        project: perHour(price("50", "EUR")),
        client: perHour(price("500", "EUR")),
        workspace,
      },
      "project",
      "50",
    ],
  ])("%s", (_name, levels, source, amount) => {
    const resolved = resolveRate({ ...levels, unit: "hour" });
    expect(resolved.source).toBe(source);
    expect(resolved.unit).toBe("hour");
    expect(decimalToString(resolved.rate.amount)).toBe(amount);
    expect(resolved.converted).toBeUndefined();
  });

  it("returns the configured Price object itself", () => {
    expect(resolveRate({ unit: "hour", task, workspace }).rate).toBe(taskPrice);
  });

  describe("units: an hourly rate and a day rate are never mixed", () => {
    const dayWorkspace = perDay(price("500", "EUR"));

    it.each<[string, RateUnit, Omit<RateLevels, "unit">, RateSource, string]>([
      [
        "a day rate is skipped when resolving hours",
        "hour",
        { task: perDay(price("900", "EUR")), project, workspace },
        "project",
        "100",
      ],
      [
        "an hourly rate is skipped when resolving days",
        "day",
        { task, project: perDay(price("700", "EUR")), workspace },
        "project",
        "700",
      ],
      [
        "each unit has its own cascade",
        "day",
        { task, client: perDay(price("650", "EUR")), workspace: dayWorkspace },
        "client",
        "650",
      ],
      ["a workspace default per day", "day", { workspace: dayWorkspace }, "workspace", "500"],
      [
        "an hourly workspace default is no day rate default: the day rate of a lower level wins",
        "day",
        { client: perDay(price("650", "EUR")), workspace },
        "client",
        "650",
      ],
    ])("%s", (_name, unit, levels, source, amount) => {
      const resolved = resolveRate({ ...levels, unit });
      expect(resolved).toMatchObject({ unit, source });
      expect(decimalToString(resolved.rate.amount)).toBe(amount);
    });

    it("throws instead of billing days at the hourly rate", () => {
      const levels = { task, project, client, workspace } satisfies Omit<RateLevels, "unit">;
      expect(() => resolveRate({ ...levels, unit: "day" })).toThrow(MissingRateError);
      expect(() => resolveRate({ ...levels, unit: "day" })).toThrow(
        "No rate per day is set (a rate per hour does not apply)",
      );
    });

    it("throws instead of billing hours at the day rate", () => {
      expect.assertions(3);
      try {
        resolveRate({
          unit: "hour",
          project: perDay(price("700", "EUR")),
          workspace: dayWorkspace,
        });
      } catch (error) {
        expect(error).toBeInstanceOf(MissingRateError);
        expect((error as MissingRateError).unit).toBe("hour");
        expect((error as Error).message).toContain("a rate per day does not apply");
      }
    });

    it("never converts a rate to the other unit, even with an exchange rate", () => {
      expect(() =>
        resolveRate({
          unit: "day",
          workspace: perHour(price("80", "USD")),
          currency: "EUR",
          exchangeRates: [{ from: "USD", rate: decimal("0.9") }],
        }),
      ).toThrow(MissingRateError);
    });
  });

  describe("currency", () => {
    it("keeps the rate in its own currency when none is requested", () => {
      const usd = price("100", "USD");
      expect(resolveRate({ unit: "hour", project: perHour(usd), workspace })).toEqual({
        rate: usd,
        unit: "hour",
        source: "project",
      });
    });

    it("needs no exchange rate when the currency already matches", () => {
      const resolved = resolveRate({ unit: "hour", project, workspace, currency: "EUR" });
      expect(resolved.rate).toBe(projectPrice);
      expect(resolved.converted).toBeUndefined();
    });

    it("converts the winning rate with the explicit exchange rate, exactly", () => {
      const usd = price("100", "USD");
      const rate = decimal("0.9215");
      const resolved = resolveRate({
        unit: "hour",
        client: perHour(usd),
        workspace,
        currency: "EUR",
        exchangeRates: [
          { from: "GBP", rate: decimal("1.17") },
          { from: "USD", rate },
        ],
      });
      expect(resolved.source).toBe("client");
      expect(resolved.rate.currency).toBe("EUR");
      expect(decimalToString(resolved.rate.amount)).toBe("92.1500");
      expect(resolved.converted).toEqual({ from: usd, exchangeRate: rate });
    });

    it("only the winning level matters: a foreign rate it shadows is not an error", () => {
      const resolved = resolveRate({
        unit: "hour",
        task,
        project: perHour(price("100", "USD")),
        workspace,
        currency: "EUR",
      });
      expect(resolved.source).toBe("task");
    });

    it("throws a typed error when the currencies differ and no exchange rate is given", () => {
      const levels = {
        unit: "hour",
        client: perHour(price("100", "USD")),
        workspace,
        currency: "EUR",
      } as const;
      expect(() => resolveRate(levels)).toThrow(RateCurrencyMismatchError);
      expect(() => resolveRate({ ...levels, exchangeRates: [] })).toThrow(
        new RateCurrencyMismatchError("USD", "EUR"),
      );
      expect(() =>
        resolveRate({ ...levels, exchangeRates: [{ from: "GBP", rate: decimal("1.17") }] }),
      ).toThrow(RateCurrencyMismatchError);
    });

    it("exposes both currencies on the error", () => {
      expect.assertions(3);
      try {
        resolveRate({ unit: "hour", workspace: perHour(price("10", "JPY")), currency: "CHF" });
      } catch (error) {
        expect(error).toBeInstanceOf(RateCurrencyMismatchError);
        expect((error as RateCurrencyMismatchError).from).toBe("JPY");
        expect((error as RateCurrencyMismatchError).to).toBe("CHF");
      }
    });

    it("lets money reject a bad exchange rate", () => {
      expect(() =>
        resolveRate({
          unit: "hour",
          workspace: perHour(price("10", "USD")),
          currency: "EUR",
          exchangeRates: [{ from: "USD", rate: decimal("0") }],
        }),
      ).toThrow(InvalidAmountError);
    });

    it("converts a rate per day just the same", () => {
      const resolved = resolveRate({
        unit: "day",
        workspace: perDay(price("500", "USD")),
        currency: "EUR",
        exchangeRates: [{ from: "USD", rate: decimal("0.9") }],
      });
      expect(resolved.unit).toBe("day");
      expect(decimalToString(resolved.rate.amount)).toBe("450.0");
    });

    it("rejects two exchange rates for one currency, whichever is used", () => {
      const levels = {
        unit: "hour",
        workspace,
        currency: "EUR",
        exchangeRates: [
          { from: "USD", rate: decimal("0.9") },
          { from: "GBP", rate: decimal("1.17") },
          { from: "USD", rate: decimal("0.95") },
        ],
      } as const;
      expect(() => resolveRate(levels)).toThrow(DuplicateExchangeRateError);
      expect(() => resolveRate(levels)).toThrow("More than one exchange rate from USD");
      expect.assertions(3);
      try {
        resolveRate(levels);
      } catch (error) {
        expect((error as DuplicateExchangeRateError).currency).toBe("USD");
      }
    });

    it("the same rate twice is still two rates", () => {
      const same = { from: "USD", rate: decimal("0.9") } as const;
      expect(() => resolveRate({ unit: "hour", workspace, exchangeRates: [same, same] })).toThrow(
        DuplicateExchangeRateError,
      );
    });
  });

  it("always picks the first level that is set in the asked unit, in priority order (property)", () => {
    const unit = fc.constantFrom<RateUnit>("hour", "day");
    const level = fc.option(fc.record({ unit, amount: fc.integer({ min: 0, max: 500 }) }), {
      nil: undefined,
    });
    const eur = (rate: { unit: RateUnit; amount: number }): UnitRate => ({
      unit: rate.unit,
      price: price(String(rate.amount), "EUR"),
    });
    fc.assert(
      fc.property(
        unit,
        level,
        level,
        level,
        fc.record({ unit, amount: fc.integer({ min: 0, max: 500 }) }),
        (asked, t, p, c, w) => {
          const levels: RateLevels = {
            unit: asked,
            task: t === undefined ? undefined : eur(t),
            project: p === undefined ? undefined : eur(p),
            client: c === undefined ? undefined : eur(c),
            workspace: eur(w),
          };
          const candidates = [
            ["task", t],
            ["project", p],
            ["client", c],
            ["workspace", w],
          ] as const;
          const expected = candidates.find(([, rate]) => rate?.unit === asked);
          if (expected?.[1] === undefined) {
            expect(() => resolveRate(levels)).toThrow(MissingRateError);
          } else {
            const resolved = resolveRate(levels);
            expect(resolved.source).toBe(expected[0]);
            expect(resolved.unit).toBe(asked);
            expect(decimalToString(resolved.rate.amount)).toBe(String(expected[1].amount));
          }
        },
      ),
    );
  });
});
