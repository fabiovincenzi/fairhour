import { parseMoney, toDecimalString, type Money } from "@fairhour/money";
import {
  coreMessages,
  formatMessage,
  isoDate,
  mergeCatalogs,
  ParameterNotFoundError,
  UnsupportedInputError,
  type RevenueReceipt,
  type RevenueTrackerInput,
} from "@fairhour/tax-core";
import { describe, expect, test } from "vitest";
import {
  compute,
  FORFETTARIO,
  INPS,
  IT_PRIVATE,
  line,
  ORDINARIO,
  plainSpaces,
} from "../test/helpers";
import { configSchema } from "./config";
import { itMessages } from "./messages/index";
import { countableRevenue, evaluateRevenue } from "./revenue-tracker";

const forfettario = configSchema.parse(FORFETTARIO);
const receipt = (date: string, amount: string): RevenueReceipt => ({
  date: isoDate(date),
  amount: parseMoney(amount, "EUR"),
});
const eur = (value: Money): string => toDecimalString(value);

function evaluate(
  year: number,
  receipts: readonly RevenueReceipt[],
  extra: Partial<RevenueTrackerInput> = {},
  config: unknown = FORFETTARIO,
) {
  return evaluateRevenue(configSchema.parse(config), {
    year,
    currency: "EUR",
    receipts,
    asOf: isoDate(`${year}-12-31`),
    ...extra,
  });
}

describe("evaluate: statuses at, below and above the limits (docs section 10)", () => {
  test.each([
    { year: 2024, amount: undefined, status: "ok", ceiling: "85000.00" },
    { year: 2024, amount: "67999.99", status: "ok", ceiling: "85000.00" },
    { year: 2024, amount: "68000.00", status: "approaching", ceiling: "85000.00" },
    { year: 2024, amount: "85000.00", status: "approaching", ceiling: "85000.00" },
    { year: 2024, amount: "85000.01", status: "exceeded", ceiling: "85000.00" },
    { year: 2024, amount: "100000.00", status: "exceeded", ceiling: "85000.00" },
    { year: 2024, amount: "100000.01", status: "immediate-exit", ceiling: "85000.00" },
    { year: 2019, amount: "65000.00", status: "approaching", ceiling: "65000.00" },
    { year: 2021, amount: "65000.01", status: "exceeded", ceiling: "65000.00" },
    // No in-year exit before 2023, however large the revenue.
    { year: 2021, amount: "150000.00", status: "exceeded", ceiling: "65000.00" },
    // Revenue of 2022 decides access to 2023 under the 2023 law: €85,000, no immediate exit yet.
    { year: 2022, amount: "80000.00", status: "approaching", ceiling: "85000.00" },
    { year: 2022, amount: "120000.00", status: "exceeded", ceiling: "85000.00" },
    { year: 2023, amount: "100000.01", status: "immediate-exit", ceiling: "85000.00" },
  ] as const)("$year, $amount -> $status", ({ year, amount, status, ceiling }) => {
    const result = evaluate(year, amount === undefined ? [] : [receipt(`${year}-05-10`, amount)]);
    expect(result.status).toBe(status);
    expect(result.year).toBe(year);
    expect(eur(result.total)).toBe(amount ?? "0.00");
    const [first, second] = result.thresholds;
    expect(first?.id).toBe("it.forfettario.ceiling");
    expect(eur(first?.limit ?? result.total)).toBe(ceiling);
    expect(second === undefined ? null : eur(second.limit)).toBe(year >= 2023 ? "100000.00" : null);
  });

  test("the parameter version is the one deciding the ceiling (1 January of the next year)", () => {
    expect(evaluate(2022, []).parameters.id).toBe("it-2023-01-01");
    expect(evaluate(2021, []).parameters.id).toBe("it-2021-01-01");
    expect(evaluate(2026, []).parameters.id).toBe("it-2026-07-01");
    expect(evaluate(9999, []).parameters.id).toBe("it-2026-07-01");
  });

  test("crossing dates and ratios", () => {
    const result = evaluate(2024, [
      receipt("2024-09-01", "20000.00"),
      receipt("2024-03-01", "50000.00"),
      receipt("2024-06-01", "40000.00"),
    ]);
    expect(result.status).toBe("immediate-exit");
    expect(eur(result.total)).toBe("110000.00");
    expect(
      result.thresholds.map((item) => [item.id, item.crossedOn, item.ratio.coefficient]),
    ).toEqual([
      ["it.forfettario.ceiling", "2024-06-01", 12941n],
      ["it.forfettario.immediate-exit", "2024-09-01", 11000n],
    ]);
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      "it.forfettario.immediate-exit",
    ]);
  });

  test.each([
    { amount: "70000.00", status: "approaching", warnings: ["it.forfettario.ceiling-approaching"] },
    { amount: "85000.01", status: "exceeded", warnings: ["it.forfettario.ceiling-exceeded"] },
    { amount: "1000.00", status: "ok", warnings: [] },
  ])("warnings: $status", ({ amount, status, warnings }) => {
    const result = evaluate(2025, [receipt("2025-02-01", amount)]);
    expect(result.status).toBe(status);
    expect(result.warnings.map((warning) => warning.code)).toEqual(warnings);
  });

  test("a custom warning ratio", () => {
    const config = { ...FORFETTARIO, revenueTracker: { warningRatio: "90" } };
    expect(evaluate(2025, [receipt("2025-02-01", "76499.99")], {}, config).status).toBe("ok");
    expect(evaluate(2025, [receipt("2025-02-01", "76500.00")], {}, config).status).toBe(
      "approaching",
    );
  });

  test("only receipts of the year, up to asOf, count (cash basis)", () => {
    const result = evaluate(
      2025,
      [
        receipt("2024-12-31", "50000.00"),
        receipt("2025-01-01", "1000.00"),
        receipt("2025-06-30", "2000.00"),
        receipt("2025-07-01", "90000.00"),
        receipt("2026-01-01", "50000.00"),
      ],
      { asOf: isoDate("2025-06-30") },
    );
    expect(eur(result.total)).toBe("3000.00");
    expect(result.status).toBe("ok");
  });

  test("a refund brings the total back down: no crossing date is reported", () => {
    const result = evaluate(2025, [
      receipt("2025-03-01", "90000.00"),
      receipt("2025-04-01", "-10000.00"),
    ]);
    expect(result.status).toBe("approaching");
    expect(result.thresholds[0]?.crossedOn).toBeUndefined();
  });
});

describe("evaluate: first year of activity", () => {
  test.each([
    // Circolare 32/E/2023 example: 1 March 2023 -> 306 days -> 85,000 × 306 / 365 = 71,260.27.
    { start: "2023-03-01", year: 2023, ceiling: "71260.27", leap: false },
    // Leap year: 184 days from 1 July 2024; 85,000 × 184 / 365 = 42,849.315 -> 42,849.32.
    { start: "2024-07-01", year: 2024, ceiling: "42849.32", leap: true },
    // 366 days would exceed the full ceiling: capped at 85,000.00.
    { start: "2024-01-01", year: 2024, ceiling: "85000.00", leap: true },
    // A start date in another year does not pro-rate.
    { start: "2022-05-01", year: 2023, ceiling: "85000.00", leap: false },
    // Gregorian century rule: 2100 is not a leap year, 2400 is (184 days from 1 July either way).
    { start: "2100-07-01", year: 2100, ceiling: "42849.32", leap: false },
    { start: "2400-07-01", year: 2400, ceiling: "42849.32", leap: true },
  ])("activity from $start, year $year -> ceiling $ceiling", ({ start, year, ceiling, leap }) => {
    const result = evaluate(year, [], { activityStartDate: isoDate(start) });
    expect(eur(result.thresholds[0]?.limit ?? result.total)).toBe(ceiling);
    expect(result.warnings.map((warning) => warning.code)).toEqual(
      leap ? ["it.forfettario.prorating-leap-year"] : [],
    );
  });

  test("the €100,000 limit is not pro-rated", () => {
    const result = evaluate(2023, [receipt("2023-11-01", "71260.28")], {
      activityStartDate: isoDate("2023-03-01"),
    });
    expect(result.status).toBe("exceeded");
    expect(eur(result.thresholds[1]?.limit ?? result.total)).toBe("100000.00");
  });
});

describe("evaluate: explanation, regimes and refusals", () => {
  test("the explanation formats in both locales", () => {
    const catalogs = mergeCatalogs(coreMessages, itMessages);
    const result = evaluate(2023, [receipt("2023-11-01", "90000.00")], {
      activityStartDate: isoDate("2023-03-01"),
    });
    expect(result.explanation.map((step) => step.step)).toEqual([1, 2, 3, 4]);
    const en = result.explanation.map((step) =>
      plainSpaces(formatMessage(step.message, catalogs, "en")),
    );
    expect(en).toEqual([
      "Fees collected in 2023 up to December 31, 2023: €90,000.00 (receipts: 1)",
      "First year of activity, started on March 1, 2023: the ceiling is pro-rated to 306 days",
      "€90,000.00 exceeds the €71,260.27 ceiling (since November 1, 2023, 126.3% of it): the flat-rate scheme ends on 31 December and the ordinary regime applies from 2024",
      "€90,000.00 does not exceed the immediate exit limit of €100,000.00",
    ]);
    for (const step of result.explanation) {
      expect(formatMessage(step.message, catalogs, "it")).not.toBe("");
      if (step.formula !== undefined)
        expect(formatMessage(step.formula, catalogs, "it")).toContain("365");
      expect(step.sources.length).toBeGreaterThan(0);
    }
    expect(Object.isFrozen(result)).toBe(true);
  });

  test("ordinario: not applicable", () => {
    const result = evaluate(2024, [receipt("2024-05-01", "200000.00")], {}, ORDINARIO);
    expect(result.status).toBe("not-applicable");
    expect(eur(result.total)).toBe("0.00");
    expect(result.thresholds).toEqual([]);
    expect(result.explanation).toHaveLength(1);
  });

  test("non-EUR amounts are refused", () => {
    expect(() =>
      evaluateRevenue(forfettario, {
        year: 2024,
        currency: "USD",
        receipts: [],
        asOf: isoDate("2024-12-31"),
      }),
    ).toThrow(UnsupportedInputError);
    expect(() =>
      evaluateRevenue(forfettario, {
        year: 2024,
        currency: "EUR",
        receipts: [{ date: isoDate("2024-01-02"), amount: parseMoney("10", "USD") }],
        asOf: isoDate("2024-12-31"),
      }),
    ).toThrow(UnsupportedInputError);
  });

  test("years before 2019 are not modelled", () => {
    expect(() => evaluate(2018, [])).toThrow(ParameterNotFoundError);
  });
});

describe("countableRevenue", () => {
  test.each([
    {
      name: "example (a): fees, rivalsa and the charged duty",
      config: { ...FORFETTARIO, socialSecurity: INPS },
      overrides: {},
      expected: "1042.00",
    },
    {
      name: "example (g): the cassa contribution is not revenue",
      config: {
        ...FORFETTARIO,
        socialSecurity: { kind: "cassa", preset: "cassa-forense" },
        generalExpenses: {},
      },
      overrides: {},
      expected: "1152.00",
    },
    {
      name: "disbursements are not revenue",
      config: FORFETTARIO,
      overrides: {
        client: IT_PRIVATE,
        lines: [line("a", "500"), line("r", "50", { kind: "reimbursement" })],
      },
      expected: "502.00",
    },
    {
      name: "an absorbed duty is not charged",
      config: { ...FORFETTARIO, stampDuty: { charge: "absorbed" } },
      overrides: {},
      expected: "1000.00",
    },
    {
      name: "a credit note: the magnitude",
      config: { ...FORFETTARIO, socialSecurity: INPS },
      overrides: { documentKind: "credit-note" as const },
      expected: "1040.00",
    },
    {
      name: "ordinario: zero",
      config: { ...ORDINARIO, socialSecurity: INPS },
      overrides: {},
      expected: "0.00",
    },
  ])("$name -> $expected", ({ config, overrides, expected }) => {
    const c = compute(config, overrides);
    expect(eur(countableRevenue(configSchema.parse(config), c))).toBe(expected);
  });
});
