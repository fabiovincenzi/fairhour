/**
 * Rule 3, `xx.small-business`: under the small-business exemption the invoice charges no VAT
 * (`xx.classify-lines` put its lines in the `small-business` group) and must say why. The rule adds
 * that legal note: the statutory wording, or the user's own (`smallBusinessNote`).
 */
import { message, p } from "@fairhour/tax-core";
import { vatActSmallBusiness } from "../sources";
import type { XxRule } from "../types";

// TEMPLATE: legal notes are the mandatory mentions of an invoice. Their wording is printed in
// meta.documentLocale, so translate it from the official text, and cite the provision. When users
// may need their own wording, accept it in the configuration and print it with a `text` parameter
// (printed verbatim, never translated).

export const SMALL_BUSINESS_RULE_ID = "xx.small-business";
export const SMALL_BUSINESS_NOTE_ID = "xx.note.small-business";

export const smallBusinessRule: XxRule = {
  id: SMALL_BUSINESS_RULE_ID,
  title: message("xx.rule.small-business.title"),
  sources: [vatActSmallBusiness],
  appliesTo: (ctx) => !ctx.config.vatRegistered,
  apply: (_state, ctx) => {
    const custom = ctx.config.smallBusinessNote;
    return {
      legalNotes: [
        {
          id: SMALL_BUSINESS_NOTE_ID,
          message:
            custom === undefined
              ? message("xx.note.small-business")
              : message("xx.note.custom", { text: p.text(custom) }),
        },
      ],
      trace: [{ message: message("xx.trace.small-business") }],
    };
  },
};
