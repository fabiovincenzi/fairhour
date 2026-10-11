/**
 * Workspace configuration of the Italian pack (docs/tax-packs/it.md, section 4).
 *
 * JSON in, JSON out: no transforms, no bigint, defaults through `.default()` and `.prefault()`
 * only (zod 4's `.default()` returns the default without parsing it, so nested objects use
 * `.prefault({})` for their inner defaults to apply). The settings form is generated from this
 * schema with `z.toJSONSchema` (WEB-008). Decimal values are strings.
 *
 * Conservative choices: the regime and the social-security scheme have no default (a wrong guess
 * silently changes every invoice); the INPS rivalsa is capped at the statutory 4 %; a custom
 * professional fund must state its rate, FatturaPA `TipoCassa` and name.
 */
import { compareDecimal, decimal, type Decimal } from "@fairhour/money";
import * as z from "zod";

/** A percent as a decimal string: 0 ≤ value ≤ 100, at most 4 decimals, no leading zeros. */
export const PERCENT_PATTERN = /^(?:100(?:\.0{1,4})?|(?:0|[1-9][0-9]?)(?:\.[0-9]{1,4})?)$/;

/** A percent in the configuration, e.g. "4" or "15". */
export type Percent = string;

function percentSchema(): z.ZodString {
  return z.string().regex(PERCENT_PATTERN, {
    error: 'Expected a percent between 0 and 100 with at most 4 decimals, such as "4" or "15"',
  });
}

const isPositivePercent = (value: string): boolean =>
  compareDecimal(decimal(value), decimal("0")) > 0;

/** Text supplied by the user: `min`..`max` characters, not only white space. */
function textSchema(min: number, max: number): z.ZodString {
  return z
    .string()
    .min(min)
    .max(max)
    .regex(/\S/, { error: "Expected some text, not only white space" });
}

/** Professional funds with a preset rate and FatturaPA `TipoCassa` (it.md, table 7.3). */
export const CASSA_PRESET_IDS = [
  "cassa-forense",
  "cnpadc",
  "cipag",
  "inarcassa",
  "cnpr",
  "enpacl",
  "eppi",
  "epap",
  "enpab",
  "enpapi",
  "enpap",
  "custom",
] as const;

export type CassaPresetId = (typeof CASSA_PRESET_IDS)[number];
/** The presets that carry parameters (every id except "custom"). */
export type CassaPreset = Exclude<CassaPresetId, "custom">;

/** FatturaPA `TipoCassa` of a professional fund: TC01..TC21 (TC22 is INPS, configured apart). */
export const TIPO_CASSA_PATTERN = /^TC(?:0[1-9]|1[0-9]|2[01])$/;

/** The statutory maximum of the INPS rivalsa (L. 662/1996, art. 1, c. 212). */
export const INPS_RIVALSA_MAX_RATE = "4";

const noSocialSecuritySchema = z.strictObject({ kind: z.literal("none") });

const inpsSchema = z.strictObject({
  kind: z.literal("inps-gestione-separata"),
  /** Charge the optional 4 % rivalsa to clients. */
  rivalsa: z.boolean().default(true),
  /** At most the statutory 4 %; whether a lower percentage is allowed is an open point. */
  rate: percentSchema()
    .refine((value) => compareDecimal(decimal(value), decimal(INPS_RIVALSA_MAX_RATE)) <= 0, {
      error: `The INPS rivalsa cannot exceed ${INPS_RIVALSA_MAX_RATE}%`,
    })
    .default(INPS_RIVALSA_MAX_RATE),
});

const cassaSchema = z
  .strictObject({
    kind: z.literal("cassa"),
    preset: z.enum(CASSA_PRESET_IDS),
    /** Overrides the preset rate; required for "custom". */
    rate: percentSchema().optional(),
    /** Overrides the preset code; required for "custom". */
    tipoCassa: z
      .string()
      .regex(TIPO_CASSA_PATTERN, { error: 'Expected a FatturaPA TipoCassa from "TC01" to "TC21"' })
      .optional(),
    /** Shown on the invoice; required for "custom". */
    name: textSchema(1, 80).optional(),
  })
  .refine(
    (value) =>
      value.preset !== "custom" ||
      (value.rate !== undefined && value.tipoCassa !== undefined && value.name !== undefined),
    { error: 'A "custom" fund needs rate, tipoCassa and name', path: ["preset"] },
  );

export const socialSecuritySchema = z.discriminatedUnion("kind", [
  noSocialSecuritySchema,
  inpsSchema,
  cassaSchema,
]);

export const STAMP_DUTY_CHARGES = ["client", "absorbed"] as const;

const stampDutySchema = z.strictObject({
  /** "client": added to the total; "absorbed": an informational line paid by the professional. */
  charge: z.enum(STAMP_DUTY_CHARGES).default("client"),
});

const generalExpensesSchema = z.strictObject({
  /** Absent: the parameter (15 %). Only lawyers should enable general expenses. */
  rate: percentSchema().optional(),
});

export const NO_WITHHOLDING_NOTE_MODES = ["when-withholding-agent", "always", "never"] as const;

const legalWordingSchema = textSchema(10, 500);

const forfettarioSchema = z.strictObject({
  regime: z.literal("forfettario"),
  socialSecurity: socialSecuritySchema,
  generalExpenses: generalExpensesSchema.optional(),
  stampDuty: stampDutySchema.prefault({}),
  noWithholdingNote: z.enum(NO_WITHHOLDING_NOTE_MODES).default("when-withholding-agent"),
  /** Replaces the default legal wording of the two forfettario notes. */
  wording: z
    .strictObject({
      vat: legalWordingSchema.optional(),
      noWithholding: legalWordingSchema.optional(),
    })
    .optional(),
  revenueTracker: z
    .strictObject({
      /** "approaching" from this share of the ceiling; greater than 0. */
      warningRatio: percentSchema()
        .refine(isPositivePercent, { error: "The warning ratio must be greater than 0" })
        .default("80"),
    })
    .prefault({}),
});

export const TIPO_RITENUTA_CODES = ["RT01", "RT02"] as const;

const withholdingSchema = z.strictObject({
  /** Disable only for activities that are not lavoro autonomo. */
  enabled: z.boolean().default(true),
  /** Absent: the parameter (20 %). Commercial agents: 23. */
  rate: percentSchema().optional(),
  /** Share of the fees subject to withholding: professionals 100, agents 50 or 20. */
  baseShare: percentSchema()
    .refine(isPositivePercent, { error: "The base share must be greater than 0" })
    .default("100"),
  /** FatturaPA TipoRitenuta: RT01 natural persons, RT02 legal persons. */
  tipoRitenuta: z.enum(TIPO_RITENUTA_CODES).default("RT01"),
  /** FatturaPA CausalePagamento: "A" for habitual professional services. */
  causalePagamento: z
    .string()
    .regex(/^[A-Z][0-9A-Z]?$/, { error: 'Expected a CausalePagamento code such as "A"' })
    .default("A"),
});

export const SPLIT_PAYMENT_MODES = ["auto", "never"] as const;

const ordinarioSchema = z.strictObject({
  regime: z.literal("ordinario"),
  socialSecurity: socialSecuritySchema,
  generalExpenses: generalExpensesSchema.optional(),
  withholding: withholdingSchema.prefault({}),
  stampDuty: stampDutySchema.prefault({}),
  splitPayment: z.enum(SPLIT_PAYMENT_MODES).default("auto"),
});

export const configSchema = z.discriminatedUnion("regime", [forfettarioSchema, ordinarioSchema]);

/** The parsed configuration (defaults filled in). */
export type ItConfig = z.output<typeof configSchema>;
/** The configuration as stored and edited (fields with defaults are optional). */
export type ItConfigInput = z.input<typeof configSchema>;
export type ForfettarioConfig = Extract<ItConfig, { regime: "forfettario" }>;
export type OrdinarioConfig = Extract<ItConfig, { regime: "ordinario" }>;
export type SocialSecurityConfig = ItConfig["socialSecurity"];
export type CassaConfig = Extract<SocialSecurityConfig, { kind: "cassa" }>;
export type InpsConfig = Extract<SocialSecurityConfig, { kind: "inps-gestione-separata" }>;
export type StampDutyCharge = (typeof STAMP_DUTY_CHARGES)[number];

/** A configured percent as a Decimal (the schema guarantees the syntax). */
export function percent(value: Percent): Decimal {
  return decimal(value);
}
