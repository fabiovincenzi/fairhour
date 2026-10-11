/**
 * Table-driven tests of `xx.vat`. TEMPLATE: one row per rate and parameter version (on its
 * boundary dates), the rounding cases of your rounding policy (a tie, a non-tie, the per-group
 * rounding), a currency without decimals, several rates on one invoice, and every outcome that
 * only shows in the trace.
 */
import { decimalToString } from "@fairhour/money";
import { describe, expect, it } from "vitest";
import { amount, compute, format, line, traceKeys, type LineSpec } from "../../test/helpers";
import type { XxConfigInput } from "../config";
import { VAT_COMPONENT_ID, VAT_RULE_ID } from "./vat";

interface VatCase {
  readonly config: XxConfigInput;
  readonly lines: readonly LineSpec[];
  readonly issueDate?: string;
  readonly currency?: string;
  /** [groupId, base, VAT] per taxable group, in summary order. */
  readonly expected: readonly [string, string, string][];
  readonly total: string;
}

const CASES: Readonly<Record<string, VatCase>> = {
  // Parameters xx-2026-01-01, first day.
  "standard rate 21% from 2026-01-01": {
    config: {},
    issueDate: "2026-01-01",
    lines: [line("1000.00")],
    expected: [["vat-21", "1000.00", "210.00"]],
    total: "1210.00",
  },
  // Parameters xx-2024-01-01, last day.
  "standard rate 20% until 2025-12-31": {
    config: {},
    issueDate: "2025-12-31",
    lines: [line("1000.00")],
    expected: [["vat-20", "1000.00", "200.00"]],
    total: "1200.00",
  },
  "configured reduced rate 10%": {
    config: { defaultVatRate: "reduced" },
    lines: [line("1000.00")],
    expected: [["vat-10", "1000.00", "100.00"]],
    total: "1100.00",
  },
  // 21% × 0.50 = 0.105: a tie, half up gives 0.11.
  "a tie rounds half up": {
    config: {},
    lines: [line("0.50")],
    expected: [["vat-21", "0.50", "0.11"]],
    total: "0.61",
  },
  // 21% × 10.01 = 2.1021: rounds down to 2.10.
  "below the half rounds down": {
    config: {},
    lines: [line("10.01")],
    expected: [["vat-21", "10.01", "2.10"]],
    total: "12.11",
  },
  // 21% × (0.50 + 0.50) = 0.21 once per rate; per line it would be 0.11 + 0.11 = 0.22.
  "once per rate, not per line": {
    config: {},
    lines: [line("0.50"), line("0.50")],
    expected: [["vat-21", "1.00", "0.21"]],
    total: "1.21",
  },
  // 21% × ¥1,234 = ¥259.14: no minor unit, rounds to ¥259.
  "a currency without decimals": {
    config: {},
    currency: "JPY",
    lines: [line("1234")],
    expected: [["vat-21", "1234", "259"]],
    total: "1493",
  },
  "two rates: one allocation per group, highest rate first": {
    config: {},
    lines: [line("50.00", { kind: "rate", rate: "10" }), line("100.00")],
    expected: [
      ["vat-21", "100.00", "21.00"],
      ["vat-10", "50.00", "5.00"],
    ],
    total: "176.00",
  },
  "exempt, out-of-scope and excluded lines are not taxed": {
    config: {},
    lines: [
      line("100.00"),
      line("40.00", { kind: "exempt" }),
      line("30.00", { kind: "out-of-scope", reference: "art. 7" }),
      line("20.00", { kind: "excluded" }, { kind: "reimbursement" }),
    ],
    expected: [["vat-21", "100.00", "21.00"]],
    total: "211.00",
  },
};

describe("xx.vat: rates, versions and rounding", () => {
  it.each(Object.entries(CASES))("%s", (_name, item) => {
    const c = compute(item.config, item.lines, {
      ...(item.issueDate === undefined ? {} : { issueDate: item.issueDate }),
      ...(item.currency === undefined ? {} : { currency: item.currency }),
    });
    const vat = c.components.find((component) => component.id === VAT_COMPONENT_ID);
    expect(vat && [vat.kind, vat.effect]).toEqual(["tax", "adds-to-total"]);
    expect(
      vat?.allocations.map((allocation) => [
        allocation.groupId,
        amount(allocation.base),
        amount(allocation.amount),
      ]),
    ).toEqual(item.expected);
    expect(
      c.vatSummary
        .filter((row) => row.treatment === "taxable")
        .map((row) => [row.groupId, amount(row.base), amount(row.tax)]),
    ).toEqual(item.expected);
    expect(vat && amount(vat.amount)).toBe(amount(c.taxTotal));
    expect(amount(c.total)).toBe(item.total);
  });
});

describe("xx.vat component and trace", () => {
  it("carries the group's rate when there is a single rate", () => {
    const c = compute({}, [line("100.00")]);
    const vat = c.components.find((component) => component.id === VAT_COMPONENT_ID);
    expect(vat?.rate && decimalToString(vat.rate)).toBe("21");
    expect(vat && format(vat.label)).toBe("VAT");
    expect(vat && format(vat.label, "eo")).toBe("AVI");
  });

  it("has no rate of its own over several rates (each allocation has its group's)", () => {
    const c = compute({}, [line("100.00"), line("50.00", { kind: "rate", rate: "10" })]);
    const vat = c.components.find((component) => component.id === VAT_COMPONENT_ID);
    expect(vat?.rate).toBeUndefined();
    expect(vat && [amount(vat.base), amount(vat.amount)]).toEqual(["150.00", "26.00"]);
  });

  it("explains each rate with its formula", () => {
    const c = compute({}, [line("1000.00"), line("50.00", { kind: "rate", rate: "10" })]);
    const steps = c.trace.filter((step) => step.ruleId === VAT_RULE_ID);
    expect(
      steps.map((step) => [format(step.message), step.formula && format(step.formula)]),
    ).toEqual([
      ["VAT at 21% on the taxable amount", "21% × €1,000.00 = €210.00"],
      ["VAT at 10% on the taxable amount", "10% × €50.00 = €5.00"],
    ]);
    expect(steps.every((step) => step.componentId === VAT_COMPONENT_ID)).toBe(true);
    expect(steps[0]?.sources.map((source) => source.id)).toEqual(["xx.vat-act.art-5"]);
  });

  it.each<[string, readonly LineSpec[]]>([
    ["no lines", []],
    [
      "only exempt and excluded lines",
      [line("100", { kind: "exempt" }), line("5", { kind: "excluded" })],
    ],
    ["a taxable line of zero", [line("0")]],
  ])("charges no VAT and says so: %s", (_name, lines) => {
    const c = compute({}, lines);
    expect(c.components.map((component) => component.id)).not.toContain(VAT_COMPONENT_ID);
    expect(amount(c.taxTotal)).toBe("0.00");
    expect(traceKeys(c, VAT_RULE_ID)).toEqual(["xx.trace.vat.none"]);
  });

  it("is skipped silently under the small-business exemption", () => {
    const c = compute({ vatRegistered: false }, [line("100.00")]);
    expect(traceKeys(c, VAT_RULE_ID)).toEqual([]);
    expect(amount(c.taxTotal)).toBe("0.00");
  });

  it("computes a credit note with positive amounts", () => {
    const c = compute({}, [line("100.00")], { documentKind: "credit-note" });
    expect(c.documentKind).toBe("credit-note");
    expect([amount(c.taxTotal), amount(c.total)]).toEqual(["21.00", "121.00"]);
  });
});
