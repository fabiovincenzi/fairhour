import fc from "fast-check";
import { InvalidAmountError, decimal, decimalToString, price } from "@fairhour/money";
import { describe, expect, it } from "vitest";
import { RateCurrencyMismatchError } from "./errors";
import { type RateSource, resolveRate } from "./resolve";

const task = price("120", "EUR");
const project = price("100", "EUR");
const client = price("90", "EUR");
const workspace = price("80", "EUR");

describe("resolveRate", () => {
  it.each<[string, Parameters<typeof resolveRate>[0], RateSource, string]>([
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
      { task: price("0", "EUR"), project, workspace },
      "task",
      "0",
    ],
    [
      "a project rate beats a lower-priority client rate even when lower",
      {
        project: price("50", "EUR"),
        client: price("500", "EUR"),
        workspace,
      },
      "project",
      "50",
    ],
  ])("%s", (_name, levels, source, amount) => {
    const resolved = resolveRate(levels);
    expect(resolved.source).toBe(source);
    expect(decimalToString(resolved.rate.amount)).toBe(amount);
    expect(resolved.converted).toBeUndefined();
  });

  it("returns the configured Price object itself", () => {
    expect(resolveRate({ task, workspace }).rate).toBe(task);
  });

  describe("currency", () => {
    it("keeps the rate in its own currency when none is requested", () => {
      const usd = price("100", "USD");
      expect(resolveRate({ project: usd, workspace })).toEqual({ rate: usd, source: "project" });
    });

    it("needs no exchange rate when the currency already matches", () => {
      const resolved = resolveRate({ project, workspace, currency: "EUR" });
      expect(resolved.rate).toBe(project);
      expect(resolved.converted).toBeUndefined();
    });

    it("converts the winning rate with the explicit exchange rate, exactly", () => {
      const usd = price("100", "USD");
      const rate = decimal("0.9215");
      const resolved = resolveRate({
        client: usd,
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
        task,
        project: price("100", "USD"),
        workspace,
        currency: "EUR",
      });
      expect(resolved.source).toBe("task");
    });

    it("throws a typed error when the currencies differ and no exchange rate is given", () => {
      const levels = { client: price("100", "USD"), workspace, currency: "EUR" } as const;
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
        resolveRate({ workspace: price("10", "JPY"), currency: "CHF" });
      } catch (error) {
        expect(error).toBeInstanceOf(RateCurrencyMismatchError);
        expect((error as RateCurrencyMismatchError).from).toBe("JPY");
        expect((error as RateCurrencyMismatchError).to).toBe("CHF");
      }
    });

    it("lets money reject a bad exchange rate", () => {
      expect(() =>
        resolveRate({
          workspace: price("10", "USD"),
          currency: "EUR",
          exchangeRates: [{ from: "USD", rate: decimal("0") }],
        }),
      ).toThrow(InvalidAmountError);
    });
  });

  it("always picks the first level that is set, in priority order (property)", () => {
    const level = fc.option(fc.integer({ min: 0, max: 500 }), { nil: undefined });
    fc.assert(
      fc.property(level, level, level, fc.integer({ min: 0, max: 500 }), (t, p, c, w) => {
        const eur = (value: number) => price(String(value), "EUR");
        const resolved = resolveRate({
          task: t === undefined ? undefined : eur(t),
          project: p === undefined ? undefined : eur(p),
          client: c === undefined ? undefined : eur(c),
          workspace: eur(w),
        });
        const expected: [RateSource, number] =
          t !== undefined
            ? ["task", t]
            : p !== undefined
              ? ["project", p]
              : c !== undefined
                ? ["client", c]
                : ["workspace", w];
        expect(resolved.source).toBe(expected[0]);
        expect(decimalToString(resolved.rate.amount)).toBe(String(expected[1]));
      }),
    );
  });
});
