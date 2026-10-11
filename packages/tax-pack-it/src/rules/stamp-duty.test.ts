import type { InvoiceInputJson } from "@fairhour/tax-core";
import { describe, expect, test } from "vitest";
import {
  amount,
  compute,
  componentIds,
  documentNotes,
  FEES,
  FORFETTARIO,
  findComponent,
  IT_PRIVATE,
  line,
  noteIds,
  ORDINARIO,
  ruleTrace,
  summaryRows,
  warningCodes,
} from "../../test/helpers";

const RULE = "it.common.stamp-duty";
type Lines = InvoiceInputJson["lines"];

describe("it.common.stamp-duty: when it is due (docs 7.8)", () => {
  const rows: readonly {
    readonly name: string;
    readonly config: unknown;
    readonly lines: Lines;
    readonly base: string | undefined;
    readonly total: string;
  }[] = [
    {
      name: "forfettario 77.46: below",
      config: FORFETTARIO,
      lines: [line("l1", "77.46")],
      base: undefined,
      total: "77.46",
    },
    {
      name: "forfettario 77.47: equal is not enough",
      config: FORFETTARIO,
      lines: [line("l1", "77.47")],
      base: undefined,
      total: "77.47",
    },
    {
      name: "forfettario 77.48: due",
      config: FORFETTARIO,
      lines: [line("l1", "77.48")],
      base: "77.48",
      total: "79.48",
    },
    {
      name: "ordinario, all taxable: never due",
      config: ORDINARIO,
      lines: [FEES],
      base: undefined,
      total: "1220.00",
    },
    {
      name: "ordinario, art. 15 amount of 77.47 next to taxable fees: not due",
      config: ORDINARIO,
      lines: [FEES, line("r", "77.47", { kind: "reimbursement" })],
      base: undefined,
      total: "1297.47",
    },
    {
      name: "ordinario, art. 15 amount of 77.48: due on the VAT-free part only",
      config: ORDINARIO,
      lines: [FEES, line("r", "77.48", { kind: "reimbursement" })],
      base: "77.48",
      total: "1299.48",
    },
    {
      name: "ordinario, exempt 50.00 + out of scope 30.00: the VAT-free parts add up",
      config: ORDINARIO,
      lines: [
        line("a", "50", { treatment: { kind: "exempt" } }),
        line("b", "30", { treatment: { kind: "out-of-scope", reference: "art. 2" } }),
      ],
      base: "80.00",
      total: "82.00",
    },
    {
      name: "the fund contribution counts: exempt 76.00 + ENPAP 2 % (1.52) = 77.52",
      config: { ...ORDINARIO, socialSecurity: { kind: "cassa", preset: "enpap" } },
      lines: [line("a", "76", { treatment: { kind: "exempt" } })],
      base: "77.52",
      total: "79.52",
    },
  ];

  test.each(rows)("$name", ({ config, lines, base, total }) => {
    const c = compute(config, { client: IT_PRIVATE, lines });
    const duty = findComponent(c, "it.stamp-duty");
    if (base === undefined) {
      expect(duty).toBeUndefined();
      expect(ruleTrace(c, RULE)[0]).toMatch(/^No stamp duty: the amount not subject to VAT/);
    } else {
      expect(duty?.kind).toBe("stamp-duty");
      expect(amount(duty?.base ?? c.subtotal)).toBe(base);
      expect(amount(duty?.amount ?? c.subtotal)).toBe("2.00");
      expect(duty?.exportCodes).toEqual({
        "fatturapa.BolloVirtuale": "SI",
        "fatturapa.ImportoBollo": "2.00",
      });
      expect(noteIds(c)).toContain("it.note.stamp-duty");
    }
    expect(amount(c.total)).toBe(total);
  });
});

describe("it.common.stamp-duty: who pays", () => {
  const rows: readonly {
    readonly charge: "client" | "absorbed" | undefined;
    readonly option: "auto" | "charge" | "absorb" | "not-due" | undefined;
    readonly creditNote: boolean;
    readonly effect: "adds-to-total" | "informational" | undefined;
    readonly warnings: readonly string[];
    readonly trace: string;
  }[] = [
    {
      charge: undefined,
      option: undefined,
      creditNote: false,
      effect: "adds-to-total",
      warnings: [],
      trace:
        "Stamp duty of €2.00 charged to the client: the amount not subject to VAT, €1,000.00, exceeds €77.47 (€1,000.00 > €77.47)",
    },
    {
      charge: "client",
      option: "absorb",
      creditNote: false,
      effect: "informational",
      warnings: [],
      trace:
        "Stamp duty of €2.00 paid by the professional, not added to the total: the amount not subject to VAT, €1,000.00, exceeds €77.47 (€1,000.00 > €77.47)",
    },
    {
      charge: "absorbed",
      option: "auto",
      creditNote: false,
      effect: "informational",
      warnings: [],
      trace:
        "Stamp duty of €2.00 paid by the professional, not added to the total: the amount not subject to VAT, €1,000.00, exceeds €77.47 (€1,000.00 > €77.47)",
    },
    {
      charge: "absorbed",
      option: "charge",
      creditNote: false,
      effect: "adds-to-total",
      warnings: [],
      trace:
        "Stamp duty of €2.00 charged to the client: the amount not subject to VAT, €1,000.00, exceeds €77.47 (€1,000.00 > €77.47)",
    },
    {
      charge: "client",
      option: "not-due",
      creditNote: false,
      effect: undefined,
      warnings: ["it.stamp-duty.override"],
      trace: "No stamp duty: marked as not due for this invoice (per-invoice option)",
    },
    {
      charge: "client",
      option: "charge",
      creditNote: true,
      effect: "informational",
      warnings: ["it.stamp-duty.credit-note-absorbed"],
      trace:
        "Stamp duty of €2.00 on a credit note, shown for information and not added to the total: the amount not subject to VAT, €1,000.00, exceeds €77.47 (€1,000.00 > €77.47)",
    },
  ];

  test.each(rows)(
    "config $charge, option $option, credit note $creditNote -> $effect",
    ({ charge, option, creditNote, effect, warnings, trace }) => {
      const config = charge === undefined ? FORFETTARIO : { ...FORFETTARIO, stampDuty: { charge } };
      const c = compute(config, {
        client: IT_PRIVATE,
        ...(creditNote ? { documentKind: "credit-note" as const } : {}),
        ...(option === undefined ? {} : { options: { stampDuty: option } }),
      });
      expect(findComponent(c, "it.stamp-duty")?.effect).toBe(effect);
      expect(amount(c.total)).toBe(effect === "adds-to-total" ? "1002.00" : "1000.00");
      expect(warningCodes(c)).toEqual(warnings);
      expect(ruleTrace(c, RULE)).toEqual([trace]);
    },
  );

  test("the note says the duty is paid virtually", () => {
    const c = compute(FORFETTARIO, { client: IT_PRIVATE });
    expect(documentNotes(c).at(-1)).toBe(
      "Imposta di bollo assolta in modo virtuale ai sensi dell'articolo 6 del DM 17 giugno 2014.",
    );
  });
});

describe("it.common.stamp-duty: the group of a charged duty", () => {
  test("forfettario with disbursements only: N2.2 is registered for the duty", () => {
    const c = compute(FORFETTARIO, {
      client: IT_PRIVATE,
      lines: [line("r", "100", { kind: "reimbursement" })],
    });
    expect(summaryRows(c)).toEqual(["n1 100.00/0.00", "n2.2 2.00/0.00"]);
  });

  test("ordinario reuses N1 when a disbursement is there", () => {
    const c = compute(ORDINARIO, {
      client: IT_PRIVATE,
      lines: [line("r", "100", { kind: "reimbursement" })],
    });
    expect(summaryRows(c)).toEqual(["n1 102.00/0.00"]);
  });

  test("an absorbed duty registers no group", () => {
    const c = compute(
      { ...ORDINARIO, stampDuty: { charge: "absorbed" } },
      { client: IT_PRIVATE, lines: [line("a", "100", { treatment: { kind: "exempt" } })] },
    );
    expect(summaryRows(c)).toEqual(["n4 100.00/0.00"]);
    expect(componentIds(c)).toEqual(["it.stamp-duty"]);
  });

  test("the duty never changes VAT, withholding or contributions", () => {
    const base = { ...ORDINARIO, socialSecurity: { kind: "inps-gestione-separata" } };
    const lines = [FEES, line("r", "100", { kind: "reimbursement" })];
    const charged = compute(base, { lines });
    const absorbed = compute({ ...base, stampDuty: { charge: "absorbed" } }, { lines });
    for (const id of ["it.inps-rivalsa", "it.vat", "it.withholding"]) {
      expect(amount(findComponent(charged, id)?.amount ?? charged.subtotal)).toBe(
        amount(findComponent(absorbed, id)?.amount ?? absorbed.subtotal),
      );
    }
    expect(amount(charged.total)).toBe("1370.80");
    expect(amount(absorbed.total)).toBe("1368.80");
  });
});
