/**
 * Per-invoice options (`InvoiceInput.options`, docs/tax-packs/it.md, section 5). JSON in, JSON
 * out; unknown keys are rejected.
 */
import * as z from "zod";

export const STAMP_DUTY_OPTIONS = ["auto", "charge", "absorb", "not-due"] as const;
export const SPLIT_PAYMENT_OPTIONS = ["auto", "apply", "skip"] as const;

export const optionsSchema = z.strictObject({
  /**
   * "auto": the configuration decides; "charge"/"absorb": override who pays; "not-due": escape
   * hatch for exemptions the pack does not model (warning `it.stamp-duty.override`).
   */
  stampDuty: z.enum(STAMP_DUTY_OPTIONS).default("auto"),
  /** "apply": clients subject to split payment that are not public administrations; "skip". */
  splitPayment: z.enum(SPLIT_PAYMENT_OPTIONS).default("auto"),
});

export type ItOptions = z.output<typeof optionsSchema>;
export type ItOptionsInput = z.input<typeof optionsSchema>;
