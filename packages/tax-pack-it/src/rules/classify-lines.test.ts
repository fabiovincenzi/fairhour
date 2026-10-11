import { parseMoney } from "@fairhour/money";
import { InvalidInputError } from "@fairhour/tax-core";
import { describe, expect, test } from "vitest";
import {
  compute,
  documentNotes,
  EMPTY_STATE,
  FEES,
  FORFETTARIO,
  groupOfLine,
  IT_BUSINESS_AGENT,
  IT_PRIVATE,
  line,
  noteIds,
  ORDINARIO,
  ruleContext,
  ruleTrace,
  summaryRows,
  warningCodes,
} from "../../test/helpers";
import { classifyLines } from "./classify-lines";

const RULE = "it.common.classify-lines";
const DE_BUSINESS = {
  country: "DE",
  kind: "business",
  isWithholdingAgent: false,
  vatId: "DE1",
} as const;
const US_BUSINESS = { country: "US", kind: "business", isWithholdingAgent: false } as const;
const DE_PRIVATE = { country: "DE", kind: "individual", isWithholdingAgent: false } as const;
const FR_PA = { country: "FR", kind: "public-administration", isWithholdingAgent: false } as const;

type Treatment =
  | { kind: "standard" }
  | { kind: "rate"; rate: string }
  | { kind: "exempt"; reference?: string }
  | { kind: "out-of-scope"; reference?: string }
  | { kind: "excluded" };

describe("it.common.classify-lines: the group of a line (docs table 7.1)", () => {
  const rows: readonly {
    readonly regime: "forfettario" | "ordinario";
    readonly treatment: Treatment;
    readonly client: typeof IT_PRIVATE | typeof DE_BUSINESS | typeof US_BUSINESS;
    readonly group: string;
    readonly notes: readonly string[];
    readonly warnings: readonly string[];
  }[] = [
    {
      regime: "forfettario",
      treatment: { kind: "excluded" },
      client: IT_PRIVATE,
      group: "n1",
      notes: ["it.note.forfettario", "it.note.stamp-duty"],
      warnings: [],
    },
    {
      regime: "forfettario",
      treatment: { kind: "standard" },
      client: IT_PRIVATE,
      group: "n2.2",
      notes: ["it.note.forfettario", "it.note.stamp-duty"],
      warnings: [],
    },
    {
      regime: "forfettario",
      treatment: { kind: "exempt" },
      client: IT_PRIVATE,
      group: "n2.2",
      notes: ["it.note.forfettario", "it.note.stamp-duty"],
      warnings: ["it.forfettario.treatment-ignored"],
    },
    {
      regime: "forfettario",
      treatment: { kind: "out-of-scope", reference: "art. 7" },
      client: IT_PRIVATE,
      group: "n2.2",
      notes: ["it.note.forfettario", "it.note.stamp-duty"],
      warnings: ["it.forfettario.treatment-ignored"],
    },
    {
      regime: "forfettario",
      treatment: { kind: "standard" },
      client: DE_BUSINESS,
      group: "n2.2",
      notes: ["it.note.forfettario", "it.note.stamp-duty"],
      warnings: ["it.forfettario.foreign-business-client"],
    },
    {
      regime: "ordinario",
      treatment: { kind: "excluded" },
      client: IT_PRIVATE,
      group: "n1",
      notes: ["it.note.art15", "it.note.stamp-duty"],
      warnings: [],
    },
    {
      regime: "ordinario",
      treatment: { kind: "exempt" },
      client: IT_PRIVATE,
      group: "n4",
      notes: ["it.note.exempt", "it.note.stamp-duty"],
      warnings: [],
    },
    {
      regime: "ordinario",
      treatment: { kind: "out-of-scope", reference: "art. 7-quater" },
      client: IT_PRIVATE,
      group: "n2.2",
      notes: ["it.note.out-of-scope", "it.note.stamp-duty"],
      warnings: [],
    },
    {
      regime: "ordinario",
      treatment: { kind: "standard" },
      client: DE_BUSINESS,
      group: "n2.1",
      notes: ["it.note.reverse-charge-eu", "it.note.stamp-duty"],
      warnings: [],
    },
    {
      regime: "ordinario",
      treatment: { kind: "rate", rate: "10" },
      client: DE_BUSINESS,
      group: "n2.1",
      notes: ["it.note.reverse-charge-eu", "it.note.stamp-duty"],
      warnings: [],
    },
    {
      regime: "ordinario",
      treatment: { kind: "standard" },
      client: US_BUSINESS,
      group: "n2.1",
      notes: ["it.note.outside-eu", "it.note.stamp-duty"],
      warnings: [],
    },
    {
      regime: "ordinario",
      treatment: { kind: "standard" },
      client: IT_PRIVATE,
      group: "vat-22",
      notes: [],
      warnings: [],
    },
    {
      regime: "ordinario",
      treatment: { kind: "rate", rate: "10" },
      client: IT_PRIVATE,
      group: "vat-10",
      notes: [],
      warnings: [],
    },
    {
      regime: "ordinario",
      treatment: { kind: "rate", rate: "5.00" },
      client: IT_PRIVATE,
      group: "vat-5",
      notes: [],
      warnings: [],
    },
    {
      regime: "ordinario",
      treatment: { kind: "rate", rate: "4" },
      client: IT_PRIVATE,
      group: "vat-4",
      notes: [],
      warnings: [],
    },
  ];

  test.each(rows)(
    "$regime, $treatment.kind, client $client.country $client.kind -> $group",
    ({ regime, treatment, client, group, notes, warnings }) => {
      const config = regime === "forfettario" ? FORFETTARIO : ORDINARIO;
      const c = compute(config, { client, lines: [{ ...FEES, treatment }] });
      expect(groupOfLine(c, "l1")).toBe(group);
      expect(noteIds(c)).toEqual(notes);
      expect(warningCodes(c)).toEqual(warnings);
    },
  );

  test("private and public clients abroad are invoiced with Italian VAT (B2C rule)", () => {
    for (const client of [DE_PRIVATE, FR_PA]) {
      expect(groupOfLine(compute(ORDINARIO, { client }), "l1")).toBe("vat-22");
    }
  });
});

describe("it.common.classify-lines: groups, references and notes", () => {
  test("summary rows follow the canonical order whatever the line order", () => {
    const lines = [
      line("a", "10", { kind: "reimbursement" }),
      line("b", "10", { treatment: { kind: "exempt" } }),
      line("c", "10", { treatment: { kind: "rate", rate: "4" } }),
      line("d", "10", { treatment: { kind: "out-of-scope", reference: "art. 2" } }),
      line("e", "10"),
      line("f", "10", { treatment: { kind: "rate", rate: "10" } }),
    ];
    const c = compute(ORDINARIO, { client: IT_PRIVATE, lines });
    expect(c.vatSummary.map((row) => row.groupId)).toEqual([
      "vat-22",
      "vat-10",
      "vat-4",
      "n2.2",
      "n4",
      "n1",
    ]);
    // 30.00 not subject to VAT: no stamp duty.
    expect(noteIds(c)).toEqual(["it.note.out-of-scope", "it.note.exempt", "it.note.art15"]);
  });

  test("exempt references are distinct, joined in line order; the default is art. 10", () => {
    const withReferences = compute(ORDINARIO, {
      client: IT_PRIVATE,
      lines: [
        line("a", "100", { treatment: { kind: "exempt", reference: "art. 10, n. 18" } }),
        line("b", "100", { treatment: { kind: "exempt" } }),
        line("c", "100", { treatment: { kind: "exempt", reference: "art. 10, n. 20" } }),
        line("d", "100", { treatment: { kind: "exempt", reference: "art. 10, n. 18" } }),
      ],
    });
    expect(documentNotes(withReferences)[0]).toBe(
      "Operazione esente da IVA (art. 10, n. 18; art. 10, n. 20).",
    );
    const withoutReference = compute(ORDINARIO, {
      client: IT_PRIVATE,
      lines: [line("a", "50", { treatment: { kind: "exempt" } })],
    });
    expect(documentNotes(withoutReference)).toEqual([
      "Operazione esente da IVA (art. 10 del DPR n. 633/1972).",
    ]);
  });

  test("out-of-scope lines: joined references, or a generic note and a warning", () => {
    const c = compute(ORDINARIO, {
      client: IT_PRIVATE,
      lines: [
        line("a", "50", { treatment: { kind: "out-of-scope", reference: "art. 7-quater" } }),
        line("b", "50", { treatment: { kind: "out-of-scope", reference: "art. 74" } }),
      ],
    });
    expect(documentNotes(c)).toContain("Operazione non soggetta a IVA (art. 7-quater; art. 74).");
    const bare = compute(ORDINARIO, {
      client: IT_PRIVATE,
      lines: [line("a", "50", { treatment: { kind: "out-of-scope" } })],
    });
    expect(documentNotes(bare)).toEqual(["Operazione non soggetta a IVA."]);
    expect(warningCodes(bare)).toEqual(["it.out-of-scope.missing-reference"]);
  });

  test("reverse charge to an EU business without a VAT number warns", () => {
    const c = compute(ORDINARIO, {
      client: { country: "FR", kind: "business", isWithholdingAgent: false },
    });
    expect(warningCodes(c)).toEqual(["it.client.eu-business-without-vat-id"]);
    expect(documentNotes(c)[0]).toBe(
      "Inversione contabile: operazione non soggetta a IVA in Italia ai sensi dell'articolo 7-ter del DPR n. 633/1972.",
    );
  });

  test.each([
    { date: "2020-12-31", note: "it.note.reverse-charge-eu", parameters: "it-2019-01-01" },
    { date: "2021-01-01", note: "it.note.outside-eu", parameters: "it-2021-01-01" },
  ])("a UK business client on $date: $note ($parameters)", ({ date, note, parameters }) => {
    const c = compute(ORDINARIO, {
      issueDate: date,
      client: { country: "GB", kind: "business", isWithholdingAgent: false, vatId: "GB1" },
    });
    expect(c.parameters.id).toBe(parameters);
    expect(noteIds(c)[0]).toBe(note);
  });

  test("goods lines (not excluded) give an info warning in both regimes", () => {
    const goods = line("g", "10", { kind: "goods", unit: "item" });
    for (const config of [FORFETTARIO, ORDINARIO]) {
      expect(warningCodes(compute(config, { lines: [FEES, goods] }))).toContain("it.goods-lines");
    }
    const excludedGoods = { ...goods, treatment: { kind: "excluded" as const } };
    expect(warningCodes(compute(ORDINARIO, { lines: [excludedGoods] }))).not.toContain(
      "it.goods-lines",
    );
  });

  test("forfettario never prints the ordinario notes", () => {
    const c = compute(FORFETTARIO, {
      client: US_BUSINESS,
      lines: [
        line("a", "100", { treatment: { kind: "exempt" } }),
        line("b", "5", { kind: "reimbursement" }),
      ],
    });
    expect(noteIds(c)).toEqual(["it.note.forfettario", "it.note.stamp-duty"]);
  });

  test("one trace step per group with its total and reason", () => {
    const c = compute(ORDINARIO, {
      client: IT_BUSINESS_AGENT,
      lines: [FEES, line("l2", "16", { kind: "reimbursement", unit: "item" })],
    });
    expect(ruleTrace(c, RULE)).toEqual([
      "VAT 22%: €1,000.00 (subject to VAT at 22%)",
      "N1 – Excluded under art. 15: €16.00 (paid in the client's name and on the client's behalf, outside the VAT base)",
    ]);
    expect(ruleTrace(c, RULE, "it")).toEqual([
      "IVA 22%: 1000,00 € (soggetta a IVA al 22%)",
      "N1 – Esclusa ex art. 15: 16,00 € (spese anticipate in nome e per conto del cliente, fuori dalla base imponibile IVA)",
    ]);
    expect(summaryRows(c)).toEqual(["vat-22 1000.00/220.00", "n1 16.00/0.00"]);
  });

  test("an empty invoice says so", () => {
    const c = compute(FORFETTARIO, { lines: [] });
    expect(ruleTrace(c, RULE)).toEqual(["No lines to classify"]);
    expect(c.vatSummary).toEqual([]);
  });

  test("a reserved line id such as __proto__ is refused, and would stay an ordinary key", () => {
    // tax-core refuses the ids that name special object properties before any rule runs...
    expect(() => compute(ORDINARIO, { lines: [{ ...FEES, id: "__proto__" }] })).toThrow(
      InvalidInputError,
    );
    // ...and the rule never writes `record[line.id]`, so it would keep such an id as a key.
    const ctx = ruleContext(ORDINARIO);
    const [fees] = ctx.input.lines;
    if (fees === undefined) throw new Error("the default invoice has a line");
    const state = {
      ...EMPTY_STATE,
      lines: [{ ...fees, id: "__proto__", net: parseMoney("1000", "EUR") }],
    };
    const lineGroups = classifyLines.apply(state, ctx).lineGroups ?? {};
    expect(Object.getPrototypeOf(lineGroups)).toBe(Object.prototype);
    expect(Object.entries(lineGroups)).toEqual([["__proto__", "vat-22"]]);
  });
});
