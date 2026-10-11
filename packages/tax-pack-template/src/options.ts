/**
 * Per-invoice options of the Exampleland pack: choices made on one invoice, stored in
 * `InvoiceInput.options`. The same rules as the configuration apply (JSON only, strict objects,
 * defaults). A pack without options uses `z.strictObject({})`.
 */
import * as z from "zod";

// TEMPLATE: keep only the options your country needs; delete the field (keep the empty strict
// object) if there are none. Options are for exceptions on one invoice, not for settings.

/**
 * - `auto`: withhold when the configuration and the client say so;
 * - `skip`: never withhold on this invoice (for example, the client has confirmed in writing
 *   that the supply is not subject to the withholding).
 */
export const WITHHOLDING_OPTIONS = ["auto", "skip"] as const;
export type WithholdingOption = (typeof WITHHOLDING_OPTIONS)[number];

export const invoiceOptionsSchema = z.strictObject({
  withholding: z.enum(WITHHOLDING_OPTIONS).default("auto"),
});

/** The parsed per-invoice options (defaults filled in): what rules see as `ctx.options`. */
export type XxOptions = z.output<typeof invoiceOptionsSchema>;
/** The options as stored in `InvoiceInput.options`. */
export type XxOptionsInput = z.input<typeof invoiceOptionsSchema>;
