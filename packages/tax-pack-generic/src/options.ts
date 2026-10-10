/**
 * Per-invoice options of the generic pack (docs/tax-packs/generic.md, section 1). JSON in, JSON
 * out, like the workspace configuration.
 */
import * as z from "zod";

/**
 * - `auto`: follow the workspace setting (`reverseCharge.mode`);
 * - `apply`: force the reverse charge on this invoice (for example a domestic reverse charge);
 * - `skip`: never apply it on this invoice.
 *
 * With `tax.kind === "none"` there is no tax to reverse, so the option has no effect.
 */
export const REVERSE_CHARGE_OPTIONS = ["auto", "apply", "skip"] as const;

export const invoiceOptionsSchema = z.strictObject({
  reverseCharge: z.enum(REVERSE_CHARGE_OPTIONS).default("auto"),
});

/** The parsed per-invoice options (defaults filled in). */
export type GenericOptions = z.output<typeof invoiceOptionsSchema>;
/** The per-invoice options as stored in `InvoiceInput.options`. */
export type GenericOptionsInput = z.input<typeof invoiceOptionsSchema>;
export type ReverseChargeOption = (typeof REVERSE_CHARGE_OPTIONS)[number];
