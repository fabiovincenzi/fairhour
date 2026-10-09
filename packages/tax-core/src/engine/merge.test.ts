import { decimal, money, zero, type Money } from "@fairhour/money";
import { describe, expect, it } from "vitest";
import { RuleContractError, type RuleContractReason } from "../errors";
import { parseInvoiceInput } from "../input/json";
import { message, p } from "../messages/params";
import type { InvoiceInput } from "../input/types";
import { isoDate } from "../primitives";
import type { ComponentDraft, RuleOutput } from "../pack/rule";
import {
  miniPack,
  miniRule,
  miniSource,
  type MiniFacts,
  type MiniRule,
} from "../testing/mini-pack";
import { computeInvoice } from "./compute";

const eur = (cents: bigint): Money => money(cents, "EUR");

const input: InvoiceInput = parseInvoiceInput({
  issueDate: "2025-01-10",
  currency: "EUR",
  client: { country: "IT", kind: "business", isWithholdingAgent: false },
  lines: [
    { id: "l1", kind: "service", description: "A", quantity: "1", unit: "item", unitPrice: "100" },
    { id: "l2", kind: "service", description: "B", quantity: "1", unit: "item", unitPrice: "50" },
  ],
});

const label = message("mini.label");

/** A valid informational component and its trace step. */
/** Overrides are loosely typed: these tests build invalid drafts on purpose. */
type Overrides = Readonly<Record<string, unknown>>;

const info = (overrides: Overrides = {}): RuleOutput<MiniFacts> => ({
  components: [
    {
      id: "c",
      kind: "other",
      label,
      effect: "informational",
      base: eur(0n),
      amount: eur(0n),
      ...overrides,
    },
  ],
  trace: [
    {
      message: message("mini.trace"),
      componentId: typeof overrides.id === "string" ? overrides.id : "c",
    },
  ],
});

/** A valid adds-to-total component on group "std" (base 150.00, amount 15.00). */
const added = (overrides: Overrides = {}): RuleOutput<MiniFacts> => ({
  components: [
    {
      id: "c",
      kind: "contribution",
      label,
      effect: "adds-to-total",
      base: eur(15000n),
      rate: decimal("10"),
      amount: eur(1500n),
      allocations: [{ groupId: "std", base: eur(15000n), amount: eur(1500n) }],
      ...overrides,
    },
  ],
  trace: [{ message: message("mini.trace"), componentId: "c" }],
});

function reasonOf(
  rules: readonly MiniRule[],
  options: { classify?: boolean; input?: InvoiceInput } = {},
): string {
  try {
    computeInvoice(
      miniPack(rules, { classify: options.classify ?? true }),
      {},
      options.input ?? input,
    );
  } catch (error) {
    if (error instanceof RuleContractError) return `${error.ruleId}:${error.reason}`;
    throw error;
  }
  return "no error";
}

const bad = (output: unknown): MiniRule => miniRule(() => output as RuleOutput<MiniFacts>);

describe("merge contract (design 4.7)", () => {
  it.each<[string, unknown, RuleContractReason]>([
    ["an output that is not an object", undefined, "invalid-output"],
    ["groups that are not an array", { groups: {} }, "invalid-output"],
    ["lineGroups that are not a plain object", { lineGroups: [] }, "invalid-output"],
    ["facts that are not a plain object", { facts: "x" }, "invalid-output"],
    ["a group that is not an object", { groups: [1] }, "invalid-group"],
    [
      "a malformed group id",
      { groups: [{ id: "Std!", treatment: "exempt", label }] },
      "invalid-group",
    ],
    [
      "a duplicate group id",
      { groups: [{ id: "std", treatment: "exempt", label }] },
      "invalid-group",
    ],
    [
      "an unknown treatment",
      { groups: [{ id: "x", treatment: "zero-rated", label }] },
      "invalid-group",
    ],
    [
      "a taxable group without a rate",
      { groups: [{ id: "x", treatment: "taxable", label }] },
      "invalid-group",
    ],
    [
      "a rate above 100",
      { groups: [{ id: "x", treatment: "taxable", rate: decimal("100.1"), label }] },
      "invalid-group",
    ],
    [
      "a negative rate",
      { groups: [{ id: "x", treatment: "taxable", rate: decimal("-1"), label }] },
      "invalid-group",
    ],
    [
      "a rate on an exempt group",
      { groups: [{ id: "x", treatment: "exempt", rate: decimal("0"), label }] },
      "invalid-group",
    ],
    ["a group without a label", { groups: [{ id: "x", treatment: "exempt" }] }, "invalid-group"],
    [
      "a bad group reference",
      { groups: [{ id: "x", treatment: "exempt", label, reference: { key: "" } }] },
      "invalid-group",
    ],
    [
      "bad export codes",
      { groups: [{ id: "x", treatment: "exempt", label, exportCodes: { a: 1 } }] },
      "invalid-group",
    ],
    ["an unknown line", { lineGroups: { l9: "std" } }, "invalid-line-assignment"],
    ["a line assigned twice", { lineGroups: { l1: "std" } }, "invalid-line-assignment"],
    ["a component that is not an object", { components: ["c"] }, "invalid-component"],
    ["a component without id", info({ id: "" }), "invalid-component"],
    ["an unknown component kind", info({ kind: "fee" }), "invalid-component"],
    ["an unknown effect", info({ effect: "adds" }), "invalid-component"],
    ["a withholding added to the total", added({ kind: "withholding" }), "invalid-component"],
    ["an amount in another currency", info({ amount: money(0n, "USD") }), "invalid-component"],
    ["a negative amount", info({ amount: eur(-1n) }), "invalid-component"],
    ["a base that is not Money", info({ base: 0 as unknown as Money }), "invalid-component"],
    ["a negative rate", info({ rate: decimal("-1") }), "invalid-component"],
    ["a bad label", info({ label: { key: "" } }), "invalid-component"],
    [
      "a negative money label parameter",
      info({ label: message("k", { a: p.money(eur(-5n)) }) }),
      "invalid-component",
    ],
    [
      "bad export codes",
      info({ exportCodes: { a: 1 } as unknown as Record<string, string> }),
      "invalid-component",
    ],
    ["empty sources", info({ sources: [] }), "invalid-component"],
    [
      "a malformed source",
      info({ sources: [{ ...miniSource, url: "http://insecure.example" }] }),
      "invalid-component",
    ],
    [
      "no allocations on an adds-to-total component",
      added({ allocations: [] }),
      "invalid-allocations",
    ],
    ["missing allocations", added({ allocations: undefined }), "invalid-allocations"],
    [
      "an allocation that is not an object",
      added({ allocations: [1] as unknown as ComponentDraft["allocations"] }),
      "invalid-allocations",
    ],
    [
      "an allocation to an unknown group",
      added({ allocations: [{ groupId: "zz", base: eur(15000n), amount: eur(1500n) }] }),
      "invalid-allocations",
    ],
    [
      "two allocations to one group",
      added({
        allocations: [
          { groupId: "std", base: eur(10000n), amount: eur(1000n) },
          { groupId: "std", base: eur(5000n), amount: eur(500n) },
        ],
      }),
      "invalid-allocations",
    ],
    [
      "an allocation in another currency",
      added({ allocations: [{ groupId: "std", base: eur(15000n), amount: money(1500n, "USD") }] }),
      "invalid-allocations",
    ],
    [
      "allocations that do not add up to the amount",
      added({ amount: eur(1501n) }),
      "invalid-allocations",
    ],
    [
      "allocations that do not add up to the base",
      added({ base: eur(14999n) }),
      "invalid-allocations",
    ],
    [
      "allocations on an informational component",
      info({ allocations: [{ groupId: "std", base: eur(0n), amount: eur(0n) }] }),
      "invalid-allocations",
    ],
    [
      "allocations that are not an array",
      info({ allocations: {} as unknown as ComponentDraft["allocations"] }),
      "invalid-allocations",
    ],
    ["a legal note that is not an object", { legalNotes: [null] }, "invalid-legal-note"],
    ["a legal note without id", { legalNotes: [{ id: "", message: label }] }, "invalid-legal-note"],
    ["a legal note without message", { legalNotes: [{ id: "n" }] }, "invalid-legal-note"],
    [
      "a legal note with empty sources",
      { legalNotes: [{ id: "n", message: label, sources: [] }] },
      "invalid-legal-note",
    ],
    [
      "duplicate legal notes",
      {
        legalNotes: [
          { id: "n", message: label },
          { id: "n", message: label },
        ],
      },
      "duplicate-id",
    ],
    ["a warning that is not an object", { warnings: [1] }, "invalid-warning"],
    [
      "a warning without code",
      { warnings: [{ code: "", severity: "info", message: label }] },
      "invalid-warning",
    ],
    [
      "a warning with a bad severity",
      { warnings: [{ code: "w", severity: "error", message: label }] },
      "invalid-warning",
    ],
    [
      "a warning without message",
      { warnings: [{ code: "w", severity: "info" }] },
      "invalid-warning",
    ],
    [
      "duplicate warnings",
      {
        warnings: [
          { code: "w", severity: "info", message: label },
          { code: "w", severity: "warning", message: label },
        ],
      },
      "duplicate-id",
    ],
    ["a trace step that is not an object", { trace: ["step"] }, "invalid-trace"],
    ["a trace step without message", { trace: [{}] }, "invalid-trace"],
    ["a bad trace formula", { trace: [{ message: label, formula: { key: 1 } }] }, "invalid-trace"],
    ["a negative trace amount", { trace: [{ message: label, amount: eur(-1n) }] }, "invalid-trace"],
    [
      "a trace step for an unknown component",
      { trace: [{ message: label, componentId: "nope" }] },
      "invalid-trace",
    ],
    [
      "trace sources that are not an array",
      { trace: [{ message: label, sources: "x" }] },
      "invalid-trace",
    ],
    ["an undeclared fact", { facts: { other: true } }, "unknown-fact"],
    ["a fact of the wrong type", { facts: { flag: { yes: true } } }, "invalid-fact"],
    ["a Money fact in another currency", { facts: { note: money(1n, "USD") } }, "invalid-fact"],
    ["a component without a trace step", { components: info().components }, "missing-trace"],
  ])("rejects %s", (_label, output, reason) => {
    expect(reasonOf([bad(output)])).toBe(`mini.test:${reason}`);
  });

  it("rejects a tax allocated to a non-taxable group", () => {
    const rule = bad({
      groups: [{ id: "free", treatment: "exempt", label }],
      components: [
        {
          id: "t",
          kind: "tax",
          label,
          effect: "adds-to-total",
          base: eur(0n),
          amount: eur(0n),
          allocations: [{ groupId: "free", base: eur(0n), amount: eur(0n) }],
        },
      ],
      trace: [{ message: label, componentId: "t" }],
    });
    expect(reasonOf([rule])).toBe("mini.test:invalid-component");
  });

  it("rejects a component id that an earlier rule used", () => {
    expect(reasonOf([bad(info()), bad(info()), { ...bad(info()), id: "mini.second" }])).toBe(
      "mini.test:invalid-component",
    );
  });

  it("rejects an assignment to an unknown group and an unassigned line", () => {
    expect(reasonOf([bad({ lineGroups: { l1: "zz" } })], { classify: false })).toBe(
      "mini.test:invalid-line-assignment",
    );
    expect(reasonOf([bad({ lineGroups: { l1: 5 } })], { classify: false })).toBe(
      "mini.test:invalid-line-assignment",
    );
    expect(reasonOf([], { classify: false })).toBe("core:unassigned-line");
  });

  it("rejects a rule whose own sources are missing or malformed", () => {
    expect(reasonOf([miniRule(() => ({}), { sources: [] })])).toBe("mini.test:invalid-sources");
    expect(reasonOf([miniRule(() => ({}), { sources: [{ ...miniSource, title: "" }] })])).toBe(
      "mini.test:invalid-sources",
    );
  });

  it("rejects appliesTo results that are not booleans", () => {
    const rule = miniRule(() => ({}), { appliesTo: () => "yes" as unknown as boolean });
    expect(reasonOf([rule])).toBe("mini.test:invalid-output");
  });

  it("rejects a rule reusing the core.no-lines warning code", () => {
    const empty = { ...input, lines: [] };
    const rule = bad({ warnings: [{ code: "core.no-lines", severity: "info", message: label }] });
    expect(reasonOf([rule], { input: empty })).toBe("mini.test:duplicate-id");
  });

  it("accepts the full contract and copies what it keeps", () => {
    const groupLabel = message("mini.label", { rate: p.percent(decimal("20")) });
    const exportCodes = { "fatturapa.Natura": "N2.2" };
    const rule: MiniRule = miniRule(() => ({
      groups: [
        {
          id: "n2.2",
          treatment: "out-of-scope",
          label: groupLabel,
          reference: message("mini.trace"),
          exportCodes,
        },
      ],
      components: [
        {
          id: "a",
          kind: "other",
          label,
          effect: "informational",
          base: eur(0n),
          amount: eur(0n),
          allocations: [],
        },
        {
          id: "b",
          kind: "withholding",
          label,
          effect: "deducted-from-payable",
          base: eur(15000n),
          rate: decimal("20"),
          amount: eur(3000n),
          sources: [{ ...miniSource, id: "other" }],
          exportCodes: { x: "y" },
        },
      ],
      legalNotes: [
        { id: "note", message: message("mini.trace", { when: p.date(isoDate("2025-01-10")) }) },
      ],
      warnings: [{ code: "w", severity: "warning", message: label }],
      trace: [
        { message: label, componentId: "a", amount: eur(0n) },
        { message: label, formula: message("mini.trace"), componentId: "b", sources: [miniSource] },
      ],
      facts: { flag: true, note: "x" },
    }));
    const reader = miniRule(
      (state) => {
        expect(state.facts).toEqual({ flag: true, note: "x" });
        expect(Object.isFrozen(state.facts)).toBe(true);
        return {};
      },
      { id: "mini.reader" },
    );
    const c = computeInvoice(miniPack([rule, reader]), {}, input);
    expect(
      c.components.map((component) => [
        component.id,
        component.ruleId,
        component.allocations.length,
      ]),
    ).toEqual([
      ["a", "mini.test", 0],
      ["b", "mini.test", 0],
    ]);
    expect(c.components[1]?.sources[0]?.id).toBe("other");
    expect(c.components[0]?.sources[0]?.id).toBe("mini.source");
    expect(c.legalNotes[0]?.sources).toEqual([miniSource]);
    expect(c.warnings).toEqual([
      { code: "w", severity: "warning", ruleId: "mini.test", message: label },
    ]);
    expect(Object.isFrozen(exportCodes)).toBe(false);
    expect(c.withholdingTotal).toEqual(eur(3000n));
    expect(c.total).toEqual(eur(15000n)); // the mini pack computes no tax
    expect(c.netPayable).toEqual(eur(12000n));
  });

  it("copies Money and Decimal facts", () => {
    const value = { coefficient: 5n, scale: 0 };
    const rule = miniRule(() => ({ facts: { note: value as never } }));
    let seen: unknown;
    const reader = miniRule(
      (state) => {
        seen = state.facts.note;
        return {};
      },
      { id: "mini.reader" },
    );
    computeInvoice(miniPack([rule, reader]), {}, input);
    expect(seen).toEqual(decimal("5"));
    expect(seen).not.toBe(value);
    const moneyFact = miniRule(() => ({ facts: { note: zero("EUR") as never } }));
    expect(() => computeInvoice(miniPack([moneyFact]), {}, input)).not.toThrow();
  });
});
