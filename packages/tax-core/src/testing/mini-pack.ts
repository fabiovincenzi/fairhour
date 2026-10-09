/**
 * A minimal pack factory for engine tests (not exported): one parameter version, an empty
 * configuration, a "mini.classify" rule that puts every line in a 20 % taxable group "std",
 * and whatever rules a test appends. Not part of the public API.
 */
import { decimal, type Decimal } from "@fairhour/money";
import * as z from "zod";
import { message } from "../messages/params";
import type { MessageCatalogs } from "../messages/types";
import type { Rule } from "../pack/rule";
import type { ParameterVersion, RoundingPolicy, TaxPack } from "../pack/types";
import { isoDate } from "../primitives";
import type { SourceRef } from "../sources";

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- PackFacts needs a type alias
export type MiniFacts = { readonly flag: boolean; readonly note: string | null };
export type MiniConfig = z.output<typeof miniConfigSchema>;
export type MiniOptions = z.output<typeof miniOptionsSchema>;
export interface MiniParams {
  readonly rate: Decimal;
}
export type MiniRule = Rule<MiniConfig, MiniParams, MiniFacts, MiniOptions>;
export type MiniPack = TaxPack<MiniConfig, MiniParams, MiniFacts, MiniOptions>;

export const miniConfigSchema = z.strictObject({
  mode: z.enum(["halfUp", "halfEven"]).default("halfUp"),
});
export const miniOptionsSchema = z.strictObject({ marker: z.string().optional() });

export const miniSource: SourceRef = Object.freeze({
  id: "mini.source",
  kind: "statute",
  title: "Mini Act",
  citation: "art. 1",
  verification: Object.freeze({ status: "to-be-verified", reason: "test fixture" }),
});

const keys = [
  "meta.name",
  "meta.description",
  "meta.disclaimer",
  "mini.title",
  "mini.label",
  "mini.trace",
  "mini.rounding",
] as const;

export const miniMessages: MessageCatalogs = Object.freeze({
  en: Object.freeze(Object.fromEntries(keys.map((key) => [key, `EN ${key}`]))),
  it: Object.freeze(Object.fromEntries(keys.map((key) => [key, `IT ${key}`]))),
});

export const miniParameters: readonly ParameterVersion<MiniParams>[] = Object.freeze([
  Object.freeze({
    id: "mini-2020",
    effectiveFrom: isoDate("2020-01-01"),
    params: Object.freeze({ rate: decimal("20") }),
    sources: [miniSource],
    changes: ["Initial."],
  }),
]);

export const classifyAll: MiniRule = {
  id: "mini.classify",
  title: message("mini.title"),
  sources: [miniSource],
  apply: (state, ctx) => ({
    groups: [
      { id: "std", treatment: "taxable", rate: ctx.params.rate, label: message("mini.label") },
    ],
    lineGroups: Object.fromEntries(state.lines.map((line) => [line.id, "std"])),
  }),
};

export function miniRoundingPolicy(config: MiniConfig): RoundingPolicy {
  return {
    step: "minor-unit",
    lines: { mode: config.mode },
    contributions: { mode: config.mode, scope: "per-group" },
    taxes: { mode: config.mode, scope: "per-group" },
    withholdings: { mode: config.mode, scope: "per-document" },
    description: message("mini.rounding"),
  };
}

/** A pack with `classifyAll` followed by `rules` (pass `classify: false` to leave it out). */
export function miniPack(
  rules: readonly MiniRule[],
  overrides: Partial<MiniPack> & { readonly classify?: boolean } = {},
): MiniPack {
  const { classify = true, ...rest } = overrides;
  return {
    meta: {
      id: "mini",
      name: "Mini",
      version: "0.1.0",
      countries: "any",
      description: "Mini pack",
      maintainers: [{ name: "Tests" }],
      docsUrl: "https://example.com/mini",
      disclaimer: message("meta.disclaimer"),
      locales: ["en", "it"],
    },
    configSchema: miniConfigSchema,
    invoiceOptionsSchema: miniOptionsSchema,
    parameters: miniParameters,
    rules: classify ? [classifyAll, ...rules] : rules,
    initialFacts: { flag: false, note: null },
    messages: miniMessages,
    roundingPolicy: miniRoundingPolicy,
    capabilities: {},
    ...rest,
  };
}

/** A rule with id "mini.<name>" (default "mini.test") that returns `apply`'s output. */
export function miniRule(apply: MiniRule["apply"], extra: Partial<MiniRule> = {}): MiniRule {
  return { id: "mini.test", title: message("mini.title"), sources: [miniSource], apply, ...extra };
}
