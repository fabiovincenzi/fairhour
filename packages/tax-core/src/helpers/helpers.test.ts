import {
  CurrencyMismatchError,
  DivisionByZeroError,
  decimal,
  money,
  price,
  type Money,
} from "@fairhour/money";
import { describe, expect, it } from "vitest";
import type { Component } from "../computation/types";
import { message } from "../messages/params";
import type { ComputationState, NetLine, TaxGroup } from "../pack/rule";
import type { PackFacts } from "../pack/types";
import {
  basesByGroup,
  findComponent,
  groupBase,
  groupOf,
  linesInGroup,
  percentageByGroup,
  proRata,
  sumAllocations,
  sumNet,
  taxAllocations,
} from "./index";

const eur = (cents: bigint): Money => money(cents, "EUR");
const label = message("x");

const netLine = (id: string, cents: bigint, kind: NetLine["kind"] = "service"): NetLine => ({
  id,
  kind,
  description: id,
  quantity: decimal("1"),
  unit: "item",
  unitPrice: price("1", "EUR"),
  treatment: { kind: "standard" },
  net: eur(cents),
});

const groups: readonly TaxGroup[] = [
  { id: "vat-22", treatment: "taxable", rate: decimal("22"), label },
  { id: "vat-10", treatment: "taxable", rate: decimal("10"), label },
  { id: "n2", treatment: "out-of-scope", label },
  { id: "empty", treatment: "taxable", rate: decimal("4"), label },
];

const component = (overrides: Partial<Component>): Component => ({
  id: "c",
  ruleId: "t.rule",
  kind: "contribution",
  label,
  effect: "adds-to-total",
  base: eur(0n),
  amount: eur(0n),
  allocations: [],
  sources: [],
  ...overrides,
});

const state = (components: readonly Component[] = []): ComputationState<PackFacts> => ({
  lines: [
    netLine("a", 1005n),
    netLine("b", 1005n),
    netLine("c", 2000n, "goods"),
    netLine("d", 500n),
    netLine("u", 300n),
  ],
  groups,
  lineGroups: { a: "vat-22", b: "vat-22", c: "vat-10", d: "n2" },
  components,
  legalNotes: [],
  warnings: [],
  trace: [],
  facts: {},
});

const rivalsa = component({
  id: "rivalsa",
  base: eur(2510n),
  amount: eur(100n),
  allocations: [
    { groupId: "vat-22", base: eur(2010n), amount: eur(80n) },
    { groupId: "n2", base: eur(500n), amount: eur(20n) },
  ],
});
const vat = component({
  id: "vat",
  kind: "tax",
  base: eur(2090n),
  amount: eur(460n),
  allocations: [{ groupId: "vat-22", base: eur(2090n), amount: eur(460n) }],
});
const info = component({
  id: "info",
  effect: "informational",
  allocations: [{ groupId: "vat-22", base: eur(1n), amount: eur(1n) }],
});

describe("helpers for rule authors", () => {
  it("finds a line's group and a group's lines", () => {
    expect(groupOf(state(), "a").id).toBe("vat-22");
    expect(() => groupOf(state(), "u")).toThrow(/not assigned/);
    expect(() => groupOf(state(), "missing")).toThrow(/not assigned/);
    expect(() => groupOf({ ...state(), lineGroups: { a: "ghost" } }, "a")).toThrow(/not assigned/);
    expect(linesInGroup(state(), "vat-22").map((line) => line.id)).toEqual(["a", "b"]);
    expect(linesInGroup(state(), "constructor")).toEqual([]);
  });

  it("sums nets with a predicate that sees unassigned lines", () => {
    expect(sumNet(state(), () => true, "EUR")).toEqual(eur(4810n));
    expect(sumNet(state(), (_line, group) => group === undefined, "EUR")).toEqual(eur(300n));
    expect(sumNet(state(), (_line, group) => group?.treatment === "taxable", "EUR")).toEqual(
      eur(4010n),
    );
    expect(sumNet({ ...state(), lines: [] }, () => true, "JPY")).toEqual(money(0n, "JPY"));
  });

  it("computes bases per group, with listed components and without zero bases", () => {
    const s = state([rivalsa]);
    expect(basesByGroup(s, { lines: (line) => line.kind === "service" })).toEqual([
      { groupId: "vat-22", base: eur(2010n) },
      { groupId: "n2", base: eur(500n) },
    ]);
    expect(
      basesByGroup(s, {
        lines: (line) => line.kind === "service",
        includeComponents: ["rivalsa", "absent"],
      }),
    ).toEqual([
      { groupId: "vat-22", base: eur(2090n) },
      { groupId: "n2", base: eur(520n) },
    ]);
    expect(basesByGroup(s, { lines: () => false, includeComponents: ["rivalsa"] })).toEqual([
      { groupId: "vat-22", base: eur(80n) },
      { groupId: "n2", base: eur(20n) },
    ]);
    const zero = { ...state(), lines: [netLine("a", 0n)], lineGroups: { a: "vat-22" } };
    expect(basesByGroup(zero, { lines: () => true })).toEqual([]);
  });

  it("allocates a percentage per group and sums allocations", () => {
    const allocations = percentageByGroup(
      [
        { groupId: "vat-22", base: eur(1005n) },
        { groupId: "n2", base: eur(25n) },
      ],
      decimal("4"),
      "halfUp",
    );
    expect(allocations).toEqual([
      { groupId: "vat-22", base: eur(1005n), amount: eur(40n) }, // 40.2 -> 40
      { groupId: "n2", base: eur(25n), amount: eur(1n) }, // 1.0 -> 1
    ]);
    expect(sumAllocations(allocations, "EUR")).toEqual({ base: eur(1030n), amount: eur(41n) });
    expect(sumAllocations([], "JPY")).toEqual({ base: money(0n, "JPY"), amount: money(0n, "JPY") });
  });

  it("gives a group's base from lines and non-tax adds-to-total allocations", () => {
    const s = state([rivalsa, vat, info]);
    expect(groupBase(s, "vat-22")).toEqual(eur(2090n));
    expect(groupBase(s, "n2", "EUR")).toEqual(eur(520n));
    expect(groupBase(s, "empty")).toEqual(eur(0n));
    const noLines = { ...state([rivalsa]), lines: [] };
    expect(groupBase(noLines, "n2")).toEqual(eur(20n));
    const nothing = { ...state(), lines: [] };
    expect(groupBase(nothing, "n2", "USD")).toEqual(money(0n, "USD"));
    expect(() => groupBase(nothing, "n2")).toThrow(/pass the currency/);
  });

  it("computes tax allocations per group or per line", () => {
    const s = state([rivalsa]);
    // vat-22: items 10.05, 10.05, 0.80 -> base 20.90; vat-10: 20.00; empty: no base.
    expect(taxAllocations(s, { mode: "halfUp", scope: "per-group" }, "EUR")).toEqual([
      { groupId: "vat-22", base: eur(2090n), amount: eur(460n) }, // 4.598 -> 4.60
      { groupId: "vat-10", base: eur(2000n), amount: eur(200n) },
    ]);
    expect(taxAllocations(s, { mode: "halfUp", scope: "per-line" }, "EUR")).toEqual([
      { groupId: "vat-22", base: eur(2090n), amount: eur(460n) }, // 2.211 -> 2.21 twice + 0.176 -> 0.18
      { groupId: "vat-10", base: eur(2000n), amount: eur(200n) },
    ]);
    expect(taxAllocations(s, { mode: "down", scope: "per-line" }, "EUR")[0]?.amount).toEqual(
      eur(459n),
    );
    expect(taxAllocations(s, { mode: "down", scope: "per-group" }, "EUR")[0]?.amount).toEqual(
      eur(459n),
    );
    const odd = { ...s, groups: [{ id: "vat-22", treatment: "taxable", label } as TaxGroup] };
    expect(taxAllocations(odd, { mode: "halfUp", scope: "per-group" }, "EUR")).toEqual([]);
  });

  it("finds components", () => {
    expect(findComponent(state([rivalsa]), "rivalsa")).toBe(rivalsa);
    expect(findComponent(state([rivalsa]), "other")).toBeUndefined();
  });

  it("computes pro-rata shares", () => {
    expect(proRata(eur(100000n), eur(50000n), eur(122000n))).toEqual(eur(40984n)); // 409.836 -> 409.84
    expect(proRata(eur(100000n), eur(122000n), eur(122000n))).toEqual(eur(100000n));
    expect(proRata(eur(1n), eur(1n), eur(2n))).toEqual(eur(1n)); // 0.5 -> 1 (halfUp)
    expect(() => proRata(eur(1n), money(1n, "USD"), eur(2n))).toThrow(CurrencyMismatchError);
    expect(() => proRata(eur(1n), eur(1n), eur(0n))).toThrow(DivisionByZeroError);
  });
});
