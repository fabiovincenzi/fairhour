import { message } from "@fairhour/tax-core";
import { describe, expect, test } from "vitest";
import {
  compute,
  documentNotes,
  FORFETTARIO,
  IT_PRIVATE,
  noteIds,
  ORDINARIO,
  ruleContext,
  ruleTrace,
} from "../../test/helpers";
import { forfettarioNote } from "./no-vat";

const RULE = "it.forfettario.no-vat";
const NOTE =
  "Operazione effettuata in regime forfettario ai sensi dell'articolo 1, commi da 54 a 89, della Legge n. 190/2014 e successive modificazioni.";

describe("it.forfettario.no-vat (docs 7.7)", () => {
  test.each([
    { name: "standard wording", wording: undefined, text: NOTE },
    {
      name: "custom wording, verbatim (braces included)",
      wording: { vat: "Operazione senza IVA, regime forfettario {art. 1, c. 58}." },
      text: "Operazione senza IVA, regime forfettario {art. 1, c. 58}.",
    },
    {
      name: "custom wording for the other note only",
      wording: { noWithholding: "Compenso non soggetto a ritenuta." },
      text: NOTE,
    },
  ])("$name", ({ wording, text }) => {
    const config = wording === undefined ? FORFETTARIO : { ...FORFETTARIO, wording };
    const c = compute(config, { client: IT_PRIVATE });
    expect(noteIds(c)[0]).toBe("it.note.forfettario");
    expect(documentNotes(c)[0]).toBe(text);
    expect(ruleTrace(c, RULE)).toEqual([
      "No VAT: the flat-rate scheme does not charge VAT (Law no. 190/2014, art. 1, para. 58)",
    ]);
  });

  test("ordinario: the rule does not run", () => {
    expect(ruleTrace(compute(ORDINARIO), RULE)).toEqual([]);
    expect(forfettarioNote(ruleContext(ORDINARIO).config)).toEqual(message("it.note.forfettario"));
  });
});
