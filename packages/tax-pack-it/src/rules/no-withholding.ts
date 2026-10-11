/**
 * Rule 8, `it.forfettario.no-withholding` (docs/tax-packs/it.md, section 7.7): fees under the
 * regime forfettario are not subject to withholding (L. 190/2014, art. 1, c. 67). The invoice
 * asks the withholding agent not to withhold, according to `noWithholdingNote`.
 */
import { message, p, type MessageRef } from "@fairhour/tax-core";
import { sources } from "../sources";
import type { ItOutput, ItRule } from "../types";

function noteMessage(custom: string | undefined): MessageRef {
  return custom === undefined
    ? message("it.note.forfettario-no-withholding")
    : message("it.note.custom", { text: p.text(custom) });
}

export const noWithholding: ItRule = {
  id: "it.forfettario.no-withholding",
  title: message("it.rule.forfettario.no-withholding.title"),
  sources: [sources.l190NoWithholding, sources.fatturaForfettari],
  appliesTo: (ctx) => ctx.config.regime === "forfettario",
  apply: (_state, ctx): ItOutput => {
    const { config } = ctx;
    if (config.regime !== "forfettario") return {};
    const mode = config.noWithholdingNote;
    if (
      mode === "always" ||
      (mode === "when-withholding-agent" && ctx.input.client.isWithholdingAgent)
    ) {
      return {
        legalNotes: [
          {
            id: "it.note.forfettario-no-withholding",
            message: noteMessage(config.wording?.noWithholding),
          },
        ],
        trace: [{ message: message("it.trace.forfettario.no-withholding.note") }],
      };
    }
    return {
      trace: [
        {
          message: message(
            mode === "never"
              ? "it.trace.forfettario.no-withholding.disabled"
              : "it.trace.forfettario.no-withholding.not-agent",
          ),
        },
      ],
    };
  },
};
