/**
 * Rule 7, `it.forfettario.no-vat` (docs/tax-packs/it.md, section 7.7): transactions under the
 * regime forfettario carry no VAT; the invoice states the regime with the wording the Agenzia
 * delle Entrate suggests for the e-invoice Causale, or the user's own wording.
 */
import { message, p, type MessageRef } from "@fairhour/tax-core";
import type { ItConfig } from "../config";
import { sources } from "../sources";
import type { ItOutput, ItRule } from "../types";

/** The legal note text: the custom wording when configured, else the standard one. */
export function forfettarioNote(config: ItConfig): MessageRef {
  const custom = config.regime === "forfettario" ? config.wording?.vat : undefined;
  return custom === undefined
    ? message("it.note.forfettario")
    : message("it.note.custom", { text: p.text(custom) });
}

export const noVat: ItRule = {
  id: "it.forfettario.no-vat",
  title: message("it.rule.forfettario.no-vat.title"),
  sources: [sources.l190Regime, sources.l190NoVat, sources.fatturaForfettari],
  appliesTo: (ctx) => ctx.config.regime === "forfettario",
  apply: (_state, ctx): ItOutput => ({
    legalNotes: [{ id: "it.note.forfettario", message: forfettarioNote(ctx.config) }],
    trace: [{ message: message("it.trace.forfettario.no-vat") }],
  }),
};
