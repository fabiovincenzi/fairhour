import { describe, expect, it } from "vitest";
import { compute, format, line, traceKeys } from "../../test/helpers";
import type { GenericConfigInput } from "../config";
import { configurationSources } from "../sources";
import { NOTES_RULE_ID } from "./notes";

describe("generic.notes (section 2.4)", () => {
  it.each<[string, GenericConfigInput, readonly string[]]>([
    [
      "no tax with a note",
      { tax: { kind: "none", note: "VAT not applicable" } },
      ["generic.note.no-tax"],
    ],
    ["no tax without a note", { tax: { kind: "none" } }, []],
    ["a rate (no no-tax note)", { tax: { kind: "rate", rate: "20" } }, []],
    [
      "a document note",
      { tax: { kind: "rate", rate: "20" }, documentNote: "Company no. 01234567" },
      ["generic.note.document"],
    ],
    [
      "both",
      { tax: { kind: "none", note: "VAT not applicable" }, documentNote: "Company no. 01234567" },
      ["generic.note.no-tax", "generic.note.document"],
    ],
  ])("%s", (_name, config, ids) => {
    const c = compute(config, [line("100")]);
    expect(c.legalNotes.map((note) => note.id)).toEqual(ids);
    expect(traceKeys(c, NOTES_RULE_ID)).toEqual([]);
    for (const note of c.legalNotes) expect(note.sources).toEqual(configurationSources);
  });

  it("prints the user's text verbatim in every locale, even on an empty invoice", () => {
    const text = "TVA non applicable, art. 293 B du CGI";
    const c = compute({ tax: { kind: "none", note: text } }, []);
    const [note] = c.legalNotes;
    expect(note && format(note.message, "en")).toBe(text);
    expect(note && format(note.message, "it")).toBe(text);
  });
});
