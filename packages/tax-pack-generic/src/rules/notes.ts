/**
 * Rule 4, `generic.notes` (docs/tax-packs/generic.md, section 2.4): the configured no-tax note
 * and the document note, printed verbatim as legal notes.
 */
import { message, p, type LegalNoteDraft } from "@fairhour/tax-core";
import { configurationSources } from "../sources";
import type { GenericRule } from "../types";

export const NOTES_RULE_ID = "generic.notes";

function customNote(id: string, text: string): LegalNoteDraft {
  return { id, message: message("generic.note.custom", { text: p.text(text) }) };
}

export const notesRule: GenericRule = {
  id: NOTES_RULE_ID,
  title: message("generic.rule.notes.title"),
  sources: configurationSources,
  apply: (_state, ctx) => {
    const { tax, documentNote } = ctx.config;
    const legalNotes: LegalNoteDraft[] = [];
    if (tax.kind === "none" && tax.note !== undefined) {
      legalNotes.push(customNote("generic.note.no-tax", tax.note));
    }
    if (documentNote !== undefined)
      legalNotes.push(customNote("generic.note.document", documentNote));
    return { legalNotes };
  },
};
