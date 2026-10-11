/**
 * Workspace configuration of the Exampleland pack: the choices a freelancer makes once, in the
 * workspace's tax settings (README, "The fictional law of Exampleland").
 *
 * Rules for every pack's configuration schema (docs/contributing/tax-packs.md, "Configuration"):
 * - JSON in, JSON out: no transforms, no bigint, no dates as objects. The settings form is
 *   generated from this schema with `z.toJSONSchema` (WEB-008), and the parsed value is stored as
 *   JSON, so `parse(parse(x))` must equal `parse(x)` (the conformance suite checks it).
 * - `z.strictObject` everywhere: a misspelled key is an error, not a silently ignored setting.
 * - Defaults with `.default()` for scalars and `.prefault({})` for nested objects: zod 4's
 *   `.default({})` returns `{}` without parsing it, so the inner defaults would not be applied.
 * - Every default is the most common, conservative choice in the country, and the docs say why.
 * - Legal values (rates, thresholds, fixed amounts) are not settings: they change with the law,
 *   so they live in `parameters.ts`, versioned by date. The configuration picks among them by
 *   name ("standard" or "reduced"), never by number.
 */
import * as z from "zod";

// TEMPLATE: replace the fields below with your country's settings. Typical ones: the regime
// (VAT-registered, a small-business or flat-rate scheme), the social security scheme, which of
// the legal rates the freelancer's services use, and custom wording for mandatory notes.

/** Names of the VAT rates that lines with the "standard" treatment may use (see parameters.ts). */
export const VAT_RATE_NAMES = ["standard", "reduced"] as const;
export type VatRateName = (typeof VAT_RATE_NAMES)[number];

/** Names of the withholding rates (see parameters.ts). */
export const WITHHOLDING_RATE_NAMES = ["standard", "new-business"] as const;
export type WithholdingRateName = (typeof WITHHOLDING_RATE_NAMES)[number];

/** User-supplied text: 1..`max` characters, not only white space. */
function text(max: number): z.ZodString {
  return z
    .string()
    .min(1)
    .max(max)
    .regex(/\S/, { error: "Expected some text, not only white space" });
}

export const configSchema = z.strictObject({
  /**
   * VAT-registered (true, the default: most freelancers above the small-business threshold), or
   * under the small-business exemption of art. 30 of the VAT Act (false: no VAT, a mandatory
   * note on every invoice).
   */
  vatRegistered: z.boolean().default(true),
  /**
   * The VAT rate of lines with the "standard" treatment. "standard" by default; some
   * professions (in Exampleland: authors and translators) invoice at the reduced rate.
   */
  defaultVatRate: z.enum(VAT_RATE_NAMES).default("standard"),
  /**
   * Replaces the statutory wording of the small-business note, printed as written. When absent,
   * the pack prints its own wording (message `xx.note.small-business`).
   */
  smallBusinessNote: text(500).optional(),
  /** Income tax withheld by clients that are withholding agents (art. 25 of the Income Tax Act). */
  withholding: z
    .strictObject({
      /** True by default: professional fees are subject to the withholding. */
      enabled: z.boolean().default(true),
      /** "new-business": the lower rate for the first three years of activity. */
      rate: z.enum(WITHHOLDING_RATE_NAMES).default("standard"),
    })
    .prefault({}),
});

/** The parsed configuration (every default filled in): what rules see as `ctx.config`. */
export type XxConfig = z.output<typeof configSchema>;
/** The configuration as stored and edited (fields with defaults are optional). */
export type XxConfigInput = z.input<typeof configSchema>;
