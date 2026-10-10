/**
 * Workspace configuration of the generic pack (docs/tax-packs/generic.md, section 1).
 *
 * JSON in, JSON out: no transforms, no bigint, defaults through `.default()` and `.prefault()`
 * only (zod 4's `.default()` returns the default without parsing it, so nested objects use
 * `.prefault({})` for their inner defaults to apply). The settings form is generated from this
 * schema with `z.toJSONSchema` (WEB-008).
 */
import { decimal, decimalEquals, ROUNDING_MODES, type Decimal } from "@fairhour/money";
import { isCountryCode } from "@fairhour/tax-core";
import * as z from "zod";

/** A percent as a decimal string: 0 ≤ value ≤ 100, at most 4 decimals, no leading zeros. */
export const PERCENT_PATTERN = /^(?:100(?:\.0{1,4})?|(?:0|[1-9][0-9]?)(?:\.[0-9]{1,4})?)$/;

/** A percent in the configuration, e.g. "20" or "8.875". */
export type Percent = string;

const percentSchema = z.string().regex(PERCENT_PATTERN, {
  error: 'Expected a percent between 0 and 100 with at most 4 decimals, such as "20" or "8.875"',
});

/** User-supplied text: `min`..`max` characters, not only white space. */
function text(max: number): z.ZodString {
  return z
    .string()
    .min(1)
    .max(max)
    .regex(/\S/, { error: "Expected some text, not only white space" });
}

export const MAX_ALLOWED_LINE_RATES = 10;

const rateTaxSchema = z.strictObject({
  kind: z.literal("rate"),
  /** The standard rate, used by lines with the treatment { kind: "standard" }. */
  rate: percentSchema,
  /** Other rates lines may use with the treatment { kind: "rate" }; empty: any rate. */
  allowedLineRates: z.array(percentSchema).max(MAX_ALLOWED_LINE_RATES).default([]),
});

const noTaxSchema = z.strictObject({
  kind: z.literal("none"),
  /** Printed on every invoice, e.g. "VAT not applicable, art. 293 B of the CGI". */
  note: text(500).optional(),
});

export const REVERSE_CHARGE_MODES = ["off", "foreign-business-clients"] as const;

const reverseChargeSchema = z
  .strictObject({
    mode: z.enum(REVERSE_CHARGE_MODES).default("off"),
    /** Required unless mode is "off": the supplier's ISO 3166-1 alpha-2 country. */
    supplierCountry: z
      .string()
      .regex(/^[A-Z]{2}$/, { error: 'Expected an ISO 3166-1 alpha-2 code such as "DE"' })
      .refine(isCountryCode, { error: "Expected an assigned ISO 3166-1 alpha-2 country code" })
      .optional(),
    /** Printed on reverse-charge invoices. */
    note: text(500).default("Reverse charge"),
  })
  .refine((value) => value.mode === "off" || value.supplierCountry !== undefined, {
    error: 'supplierCountry is required unless the reverse-charge mode is "off"',
    path: ["supplierCountry"],
  });

export const WITHHOLDING_APPLIES_TO = ["withholding-agents", "business-clients"] as const;

const withholdingSchema = z.strictObject({
  label: text(40).default("Withholding tax"),
  rate: percentSchema,
  /** Who must withhold: clients flagged as withholding agents, or every business client. */
  appliesTo: z.enum(WITHHOLDING_APPLIES_TO).default("withholding-agents"),
});

export const TAX_SCOPES = ["per-document", "per-line"] as const;

const roundingSchema = z.strictObject({
  mode: z.enum(ROUNDING_MODES).default("halfUp"),
  /** Tax rounded once per rate on the whole document, or on each line then summed. */
  taxScope: z.enum(TAX_SCOPES).default("per-document"),
});

export const configSchema = z.strictObject({
  /** Shown in the summary and the trace: "VAT", "GST", "Sales tax", "IVA", "MwSt". */
  taxLabel: text(32).default("VAT"),
  tax: z.discriminatedUnion("kind", [rateTaxSchema, noTaxSchema]),
  /** Printed when at least one line is exempt and the line gives no reference. */
  exemptNote: text(500).optional(),
  reverseCharge: reverseChargeSchema.prefault({}),
  withholding: withholdingSchema.optional(),
  rounding: roundingSchema.prefault({}),
  /** Free text printed on every invoice (payment terms belong elsewhere). */
  documentNote: text(1000).optional(),
});

/** The parsed configuration (defaults filled in). */
export type GenericConfig = z.output<typeof configSchema>;
/** The configuration as stored and edited (fields with defaults are optional). */
export type GenericConfigInput = z.input<typeof configSchema>;
export type GenericTaxConfig = GenericConfig["tax"];
export type GenericRateTaxConfig = Extract<GenericTaxConfig, { kind: "rate" }>;
export type GenericWithholdingConfig = NonNullable<GenericConfig["withholding"]>;
export type ReverseChargeMode = (typeof REVERSE_CHARGE_MODES)[number];
export type TaxScope = (typeof TAX_SCOPES)[number];
export type WithholdingAppliesTo = (typeof WITHHOLDING_APPLIES_TO)[number];

/** A configured percent as a Decimal (the schema guarantees the syntax). */
export function percent(value: Percent): Decimal {
  return decimal(value);
}

/** True when a line may use `rate`: the standard rate, or any rate when none are listed. */
export function isRateAllowed(tax: GenericRateTaxConfig, rate: Decimal): boolean {
  if (decimalEquals(rate, percent(tax.rate))) return true;
  if (tax.allowedLineRates.length === 0) return true;
  return tax.allowedLineRates.some((allowed) => decimalEquals(rate, percent(allowed)));
}
