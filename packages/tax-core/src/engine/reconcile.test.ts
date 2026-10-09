import { money, price, type Money } from "@fairhour/money";
import { describe, expect, it } from "vitest";
import type { InvoiceComputation } from "../computation/types";
import { ReconciliationError } from "../errors";
import { parseInvoiceInput } from "../input/json";
import { message, p } from "../messages/params";
import { testPack } from "../testing/test-pack";
import { computeInvoice } from "./compute";
import { assertReconciled, reconciliationFailures } from "./reconcile";

const eur = (cents: bigint): Money => money(cents, "EUR");

/** Mixed treatments, a contribution, a tax, a withholding and the fixed charge. */
const valid: InvoiceComputation = computeInvoice(
  testPack,
  {},
  parseInvoiceInput({
    issueDate: "2023-06-01",
    currency: "EUR",
    client: { country: "IT", kind: "business", isWithholdingAgent: true },
    lines: [
      {
        id: "l1",
        kind: "service",
        description: "Design",
        quantity: "2",
        unit: "hour",
        unitPrice: "50",
      },
      {
        id: "l2",
        kind: "service",
        description: "Training",
        quantity: "1",
        unit: "item",
        unitPrice: "60",
        treatment: { kind: "exempt" },
      },
      {
        id: "l3",
        kind: "reimbursement",
        description: "Fee",
        quantity: "1",
        unit: "item",
        unitPrice: "16",
      },
    ],
  }),
);

const checks = (c: InvoiceComputation): string[] => [
  ...new Set(reconciliationFailures(c).map((failure) => failure.check)),
];

const replaceComponent = (
  id: string,
  change: (component: InvoiceComputation["components"][number]) => object,
) =>
  valid.components.map((component) =>
    component.id === id ? { ...component, ...change(component) } : component,
  );

describe("reconciliation identities R1 to R8", () => {
  it("hold for an engine computation", () => {
    expect(reconciliationFailures(valid)).toEqual([]);
    expect(() => {
      assertReconciled(valid);
    }).not.toThrow();
    expect(valid.components.map((component) => component.id)).toEqual([
      "xx.contribution",
      "xx.tax",
      "xx.withholding",
      "xx.fixed-charge",
    ]);
  });

  it.each<[string, () => InvoiceComputation, string[]]>([
    ["R1: subtotal", () => ({ ...valid, subtotal: eur(1n) }), ["R1", "R4"]],
    [
      "R2: a summary base",
      () => ({
        ...valid,
        vatSummary: valid.vatSummary.map((entry, index) =>
          index === 0 ? { ...entry, base: eur(1n) } : entry,
        ),
      }),
      ["R2", "R3", "R4"],
    ],
    [
      "R2: tax on a non-taxable row",
      () => ({
        ...valid,
        vatSummary: valid.vatSummary.map((entry) =>
          entry.groupId === "exempt" ? { ...entry, tax: eur(1n) } : entry,
        ),
      }),
      ["R2", "R4", "R8"],
    ],
    [
      "R2: a missing summary row",
      () => ({
        ...valid,
        vatSummary: valid.vatSummary.filter((entry) => entry.groupId !== "excluded"),
      }),
      // Without its row, the excluded line also counts as taxable base.
      ["R6", "R2", "R4", "R8"],
    ],
    [
      "R2: an empty summary row",
      () => ({
        ...valid,
        vatSummary: [
          ...valid.vatSummary,
          {
            groupId: "ghost",
            treatment: "exempt",
            label: message("x"),
            base: eur(0n),
            tax: eur(0n),
          },
        ],
      }),
      ["R2"],
    ],
    [
      "R3: a tax on a stale base",
      () => ({
        ...valid,
        components: replaceComponent("xx.tax", (component) => ({
          allocations: component.allocations.map((allocation) => ({
            ...allocation,
            base: eur(10000n),
          })),
        })),
      }),
      ["R3"],
    ],
    ["R4: total", () => ({ ...valid, total: eur(1n) }), ["R4", "R5"]],
    ["R5: net payable", () => ({ ...valid, netPayable: eur(1n) }), ["R5"]],
    ["R5: withholding total", () => ({ ...valid, withholdingTotal: eur(1n) }), ["R5"]],
    [
      "R5: withholding above the total",
      () => ({
        ...valid,
        withholdingTotal: eur(99999999n),
        components: replaceComponent("xx.withholding", () => ({ amount: eur(99999999n) })),
      }),
      ["R5"],
    ],
    [
      "R6: a line in a group without a summary row",
      () => ({
        ...valid,
        lines: valid.lines.map((line, index) =>
          index === 0 ? { ...line, groupId: "nowhere" } : line,
        ),
      }),
      ["R6", "R2"],
    ],
    [
      "R6: a duplicate summary row",
      () => ({ ...valid, vatSummary: [...valid.vatSummary, valid.vatSummary[0]!] }),
      ["R6", "R4", "R8"],
    ],
    ["R7: an amount in another currency", () => ({ ...valid, taxTotal: money(0n, "USD") }), ["R7"]],
    ["R7: a negative amount", () => ({ ...valid, taxableBase: eur(-1n) }), ["R7"]],
    ["R7: not a Money", () => ({ ...valid, total: 5 as unknown as Money }), ["R7"]],
    [
      "R7: a unit price in another currency",
      () => ({
        ...valid,
        lines: valid.lines.map((line) => ({ ...line, unitPrice: price("1", "USD") })),
      }),
      ["R7"],
    ],
    [
      "R7: a money parameter in another currency",
      () => ({
        ...valid,
        trace: [
          ...valid.trace,
          { ...valid.trace[0]!, message: message("x", { a: p.money(money(1n, "USD")) }) },
        ],
      }),
      ["R7"],
    ],
    [
      "R7: a nested negative parameter",
      () => ({
        ...valid,
        legalNotes: [
          ...valid.legalNotes,
          {
            id: "n",
            ruleId: "xx.tax",
            sources: [],
            message: message("x", { m: p.message(message("y", { a: p.money(eur(-1n)) })) }),
          },
        ],
      }),
      ["R7"],
    ],
    [
      "R7: a price parameter in another currency",
      () => ({
        ...valid,
        warnings: [
          {
            code: "w",
            severity: "info",
            ruleId: "core",
            message: message("x", { a: p.price(price("1", "USD")), b: p.text("t") }),
          },
        ],
      }),
      ["R7"],
    ],
    [
      "R7: a negative trace amount",
      () => ({
        ...valid,
        trace: valid.trace.map((step, index) =>
          index === 0 ? { ...step, amount: eur(-5n) } : step,
        ),
      }),
      ["R7"],
    ],
    ["R8: tax total", () => ({ ...valid, taxTotal: eur(1n) }), ["R8"]],
    ["R8: taxable base", () => ({ ...valid, taxableBase: eur(1n) }), ["R8"]],
  ])("detect %s", (_label, tamper, expected) => {
    expect(checks(tamper())).toEqual(expected);
  });

  it("ignores allocations of components that do not add to the total", () => {
    const c: InvoiceComputation = {
      ...valid,
      components: replaceComponent("xx.withholding", () => ({
        allocations: [{ groupId: "vat-20", base: eur(0n), amount: eur(0n) }],
      })),
    };
    expect(reconciliationFailures(c)).toEqual([]);
  });

  it("checks summary labels and references", () => {
    const c: InvoiceComputation = {
      ...valid,
      vatSummary: valid.vatSummary.map((entry) => ({
        ...entry,
        reference: message("r", { a: p.money(eur(-1n)) }),
      })),
    };
    expect(checks(c)).toEqual(["R7"]);
  });

  it("throws the first failure", () => {
    try {
      assertReconciled({ ...valid, subtotal: eur(1n) });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ReconciliationError);
      expect((error as ReconciliationError).check).toBe("R1");
      expect((error as ReconciliationError).actual).toBe("0.01 EUR");
    }
  });
});
