import { describe, expect, test } from "vitest";
import {
  compute,
  documentNotes,
  EMPTY_STATE,
  FORFETTARIO,
  IT_BUSINESS_AGENT,
  IT_PRIVATE,
  noteIds,
  ORDINARIO,
  ruleContext,
  ruleTrace,
} from "../../test/helpers";
import { noWithholding } from "./no-withholding";

const RULE = "it.forfettario.no-withholding";
const NOTE =
  "Si richiede la non applicazione della ritenuta alla fonte a titolo d'acconto ai sensi dell'articolo 1, comma 67, della Legge n. 190/2014.";
const ASKED = "the invoice asks the client not to withhold";

describe("it.forfettario.no-withholding (docs 7.7)", () => {
  test.each([
    { mode: undefined, agent: true, note: true, trace: ASKED },
    {
      mode: undefined,
      agent: false,
      note: false,
      trace: "no note: the client is not a withholding agent",
    },
    { mode: "when-withholding-agent", agent: true, note: true, trace: ASKED },
    { mode: "always", agent: false, note: true, trace: ASKED },
    { mode: "always", agent: true, note: true, trace: ASKED },
    { mode: "never", agent: true, note: false, trace: "the note is disabled in the settings" },
    { mode: "never", agent: false, note: false, trace: "the note is disabled in the settings" },
  ] as const)(
    "noWithholdingNote $mode, agent $agent -> note $note",
    ({ mode, agent, note, trace }) => {
      const config = mode === undefined ? FORFETTARIO : { ...FORFETTARIO, noWithholdingNote: mode };
      const c = compute(config, { client: agent ? IT_BUSINESS_AGENT : IT_PRIVATE });
      expect(noteIds(c).includes("it.note.forfettario-no-withholding")).toBe(note);
      expect(ruleTrace(c, RULE)).toHaveLength(1);
      expect(ruleTrace(c, RULE)[0]).toContain(trace);
      if (note) expect(documentNotes(c)[1]).toBe(NOTE);
    },
  );

  test("custom wording", () => {
    const text = "Compenso non soggetto a ritenuta d'acconto (L. 190/2014, art. 1, c. 67).";
    const c = compute({ ...FORFETTARIO, wording: { noWithholding: text } });
    expect(documentNotes(c)[1]).toBe(text);
  });

  test("ordinario: the rule does not run (and apply is inert)", () => {
    expect(ruleTrace(compute(ORDINARIO), RULE)).toEqual([]);
    expect(noWithholding.apply(EMPTY_STATE, ruleContext(ORDINARIO))).toEqual({});
  });
});
