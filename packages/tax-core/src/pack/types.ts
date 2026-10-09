import type { Decimal, Money, RoundingMode } from "@fairhour/money";
import type * as z from "zod";
import type { InvoiceInput } from "../input/types";
import type { MessageCatalogs, MessageRef } from "../messages/types";
import type { CountryCode, IsoDate, LocaleTag } from "../primitives";
import type { SourceRef } from "../sources";
import type { AnnualThresholdsCapability } from "../thresholds/types";
import type { Rule } from "./rule";

export interface Maintainer {
  readonly name: string;
  readonly github?: string;
}

export interface PackMeta {
  /** /^[a-z][a-z0-9-]{1,31}$/: "it", "generic". Rule ids start with `${id}.`. */
  readonly id: string;
  /** English display name; localized through the key "meta.name". */
  readonly name: string;
  /** Semver of the pack; must equal its package.json version. Part of every computation. */
  readonly version: string;
  readonly countries: readonly CountryCode[] | "any";
  /** English; localized through "meta.description". */
  readonly description: string;
  readonly maintainers: readonly Maintainer[]; // at least one
  /** https URL of docs/tax-packs/<id>.md on the docs site. */
  readonly docsUrl: string;
  /** Key "meta.disclaimer": figures are informational, verify with an accountant. */
  readonly disclaimer: MessageRef;
  /** Locales with a complete catalog; must include "en". */
  readonly locales: readonly LocaleTag[];
  /** Language in which legal notes must be printed on the document ("it"); absent: user locale. */
  readonly documentLocale?: LocaleTag;
}

/** Pack ids: "it", "generic". */
export const PACK_ID_PATTERN = /^[a-z][a-z0-9-]{1,31}$/;

export interface ParameterVersion<P> {
  /** Unique, stable: "it-2023-01-01". Never reused, never edited after release. */
  readonly id: string;
  /** Inclusive. The next version's effectiveFrom ends this one. */
  readonly effectiveFrom: IsoDate;
  /** Full snapshot of every parameter (copy forward, change what the law changed). */
  readonly params: P;
  /** Why this version exists: the source of each change. At least one. */
  readonly sources: readonly SourceRef[];
  /** Human summary of what changed compared with the previous version (English). */
  readonly changes: readonly string[];
}

export interface RoundingPolicy {
  /** Rounding always targets the currency's minor unit (cash rounding is out of scope). */
  readonly step: "minor-unit";
  /** quantity × unit price -> line total. */
  readonly lines: { readonly mode: RoundingMode };
  /** Percentage contributions and surcharges, rounded once per tax group. */
  readonly contributions: { readonly mode: RoundingMode; readonly scope: "per-group" };
  /** Taxes: once per tax group (rate) or once per line, then summed per group. */
  readonly taxes: { readonly mode: RoundingMode; readonly scope: "per-group" | "per-line" };
  /** Withholdings: once on the document's withholding base. */
  readonly withholdings: { readonly mode: RoundingMode; readonly scope: "per-document" };
  /** Human description shown in the UI and the docs. */
  readonly description: MessageRef;
}

export type FactValue = boolean | string | Decimal | Money | null;
/**
 * Facts let a rule tell later rules what it decided (IT: { withholdingApplied: boolean }).
 * Declare a pack's facts with a `type` alias, not an `interface`: interfaces have no implicit
 * index signature and are not assignable to this record type.
 */
export type PackFacts = Readonly<Record<string, FactValue>>;

export interface InputIssue {
  readonly path: readonly (string | number)[];
  readonly code: string; // "it.currency-not-eur"
  readonly message: MessageRef; // localizable explanation
}

export interface PackCapabilities<C> {
  /** Annual revenue thresholds (e.g. the Italian forfettario ceiling). */
  readonly annualThresholds?: AnnualThresholdsCapability<C>;
}

export interface TaxPack<C, P, F extends PackFacts, O> {
  readonly meta: PackMeta;
  /**
   * zod 4 schema of the workspace configuration. JSON in, JSON out: no transforms, no bigint, no
   * Date, defaults via .default()/.prefault() only. Must be idempotent and convertible with
   * z.toJSONSchema (the settings form is generated from it, WEB-008).
   */
  readonly configSchema: z.ZodType<C>;
  /** Per-invoice options (same JSON-only rules). Packs without options use z.object({}).strict(). */
  readonly invoiceOptionsSchema: z.ZodType<O>;
  /** Strictly increasing effectiveFrom, at least one version. */
  readonly parameters: readonly ParameterVersion<P>[];
  /** The pipeline, executed in this order. */
  readonly rules: readonly Rule<C, P, F, O>[];
  readonly initialFacts: F;
  readonly messages: MessageCatalogs;
  readonly roundingPolicy: (config: C) => RoundingPolicy;
  /** Pack-specific refusals ("not supported by this pack"), after schema validation. */
  readonly validateInput?: (input: InvoiceInput, config: C, options: O) => readonly InputIssue[];
  readonly capabilities: PackCapabilities<C>;
}
