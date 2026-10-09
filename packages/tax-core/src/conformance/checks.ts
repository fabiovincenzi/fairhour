import {
  decimal,
  fromDecimal,
  isMoney,
  type CurrencyCode,
  type Decimal,
  type Money,
  type RoundingMode,
} from "@fairhour/money";
import * as fc from "fast-check";
import * as z from "zod";
import { computationFromJson, computationToJson } from "../computation/json";
import type { InvoiceComputation } from "../computation/types";
import { computeInvoice } from "../engine/compute";
import { isDeeplyFrozen } from "../engine/freeze";
import { listParameters, parametersToJson, resolveParameters } from "../engine/parameters";
import { reconciliationFailures } from "../engine/reconcile";
import { InvalidInputError, ParameterNotFoundError, UnsupportedInputError } from "../errors";
import type { GoldenFixture } from "../fixtures/schema";
import { formatComputation } from "../format/computation";
import { formatTrace } from "../format/trace";
import { invoiceInputToJson, parseInvoiceInput } from "../input/json";
import type { InvoiceInput, InvoiceInputJson } from "../input/types";
import type { JsonValue } from "../primitives";
import { hasOwn, ownValue } from "../internal/records";
import { coreMessages } from "../messages/core-messages";
import { formatMessage, parseMessage } from "../messages/format";
import { mergeCatalogs } from "../messages/merge";
import type { MessageCatalogs } from "../messages/types";
import { messageRefProblem } from "../messages/validate";
import { roundingPolicyProblems } from "../pack/rounding";
import { PACK_ID_PATTERN, type PackFacts, type RoundingPolicy, type TaxPack } from "../pack/types";
import {
  addDays,
  compareIsoDate,
  isCountryCode,
  isIsoDate,
  isJsonValue,
  isoDate,
  RULE_ID_PATTERN,
  yearOf,
  type CountryCode,
  type IsoDate,
} from "../primitives";
import { HTTPS_URL_PATTERN, sourceProblems, type SourceRef } from "../sources";
import { REVENUE_STATUS_ORDER, type RevenueReceipt } from "../thresholds/types";
import { decimalArbitrary, invoiceInputArbitrary } from "./arbitraries";
import {
  fixtureLabel,
  loadFixtureFiles,
  runFixture,
  validateFixture,
  type FixtureEntry,
} from "./fixtures";
import {
  amountsOf,
  canonicalJson,
  deepEqual,
  errorText,
  messagesOf,
  structuralClone,
} from "./util";

type FixtureSource =
  | { readonly fixturesDir: string; readonly fixtures?: never } // absolute path, *.json files
  | { readonly fixtures: readonly GoldenFixture[]; readonly fixturesDir?: never };

export type ConformanceOptions = FixtureSource & {
  /** At least one. Every one must parse; they seed property tests. */
  readonly validConfigs: readonly unknown[];
  /** At least one; each must be rejected by configSchema. */
  readonly invalidConfigs: readonly { readonly config: unknown; readonly reason: string }[];
  /** At least one valid input (JSON form) per regime the pack supports. */
  readonly sampleInputs: readonly InvoiceInputJson[];
  /** Per-invoice option objects to exercise (default [{}]). */
  readonly invoiceOptions?: readonly unknown[];
  /** Shape of generated inputs; defaults: the pack's countries (or a few), ["EUR"], the parameter timeline. */
  readonly input?: {
    readonly currencies?: readonly CurrencyCode[];
    readonly clientCountries?: readonly CountryCode[];
    readonly dateRange?: { readonly from: IsoDate; readonly to: IsoDate };
  };
  readonly properties?: { readonly numRuns?: number; readonly seed?: number }; // default 200 runs
  /** The pack's package.json version, compared with meta.version. */
  readonly packageVersion?: string;
};

/** Every check, in the order of design section 5. None can be skipped. */
export const CONFORMANCE_CHECK_IDS = [
  "meta.identity",
  "meta.disclaimer",
  "messages.complete",
  "messages.syntax",
  "config.valid",
  "config.invalid",
  "config.idempotent",
  "config.json-schema",
  "parameters.timeline",
  "parameters.snapshot",
  "parameters.resolution",
  "rules.identity",
  "rules.sources",
  "rounding.policy",
  "fixtures.schema",
  "fixtures.golden",
  "samples.compute",
  "property.reconciliation",
  "property.determinism",
  "property.permutation",
  "property.non-negative",
  "property.currency",
  "property.rounding-bounds",
  "property.immutability",
  "property.trace",
  "property.json",
  "property.invalid-input",
  "thresholds.contract",
] as const;

export type ConformanceCheckId = (typeof CONFORMANCE_CHECK_IDS)[number];

export interface ConformanceCheckResult {
  readonly id: ConformanceCheckId;
  readonly ok: boolean;
  readonly failures: readonly string[];
  /** Informational findings that are not failures (e.g. sources still to be verified). */
  readonly notes: readonly string[];
}

const DEFAULT_COUNTRIES = ["US", "GB", "DE", "IT", "JP"] as const;
const DEFAULT_RUNS = 200;
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
const GITHUB_HANDLE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

interface Outcome {
  readonly failures: readonly string[];
  readonly notes?: readonly string[];
}

/** Everything the checks share, computed once per run and never throwing. */
interface Prepared<C, P, F extends PackFacts, O> {
  readonly pack: TaxPack<C, P, F, O>;
  readonly options: ConformanceOptions;
  readonly catalogs: MessageCatalogs;
  readonly locales: readonly string[];
  readonly configs: readonly C[];
  readonly invoiceOptions: readonly unknown[];
  readonly currencies: readonly CurrencyCode[];
  readonly clientCountries: readonly CountryCode[];
  readonly dateRange: { readonly from: IsoDate; readonly to: IsoDate };
  readonly fc: { readonly numRuns: number; readonly seed?: number };
}

function prepare<C, P, F extends PackFacts, O>(
  pack: TaxPack<C, P, F, O>,
  options: ConformanceOptions,
): Prepared<C, P, F, O> {
  let catalogs: MessageCatalogs;
  try {
    catalogs = mergeCatalogs(coreMessages, pack.messages);
  } catch {
    catalogs = coreMessages;
  }
  const configs: C[] = [];
  for (const config of options.validConfigs) {
    const parsed = pack.configSchema.safeParse(config);
    if (parsed.success) configs.push(parsed.data);
  }
  const sorted = [...pack.parameters]
    .filter((version) => isIsoDate(version.effectiveFrom))
    .sort((a, b) => compareIsoDate(a.effectiveFrom, b.effectiveFrom));
  const first = sorted[0]?.effectiveFrom ?? isoDate("2000-01-01");
  const last = sorted[sorted.length - 1]?.effectiveFrom ?? first;
  let to: IsoDate;
  try {
    to = addDays(last, 730);
  } catch {
    to = isoDate("9999-12-31");
  }
  const countries =
    pack.meta.countries === "any"
      ? DEFAULT_COUNTRIES.map((code) => code as CountryCode)
      : pack.meta.countries;
  return {
    pack,
    options,
    catalogs,
    locales: pack.meta.locales.length > 0 ? pack.meta.locales : ["en"],
    configs,
    invoiceOptions: options.invoiceOptions ?? [{}],
    currencies: options.input?.currencies ?? ["EUR"],
    clientCountries: options.input?.clientCountries ?? countries,
    dateRange: options.input?.dateRange ?? { from: first, to },
    fc: {
      numRuns: options.properties?.numRuns ?? DEFAULT_RUNS,
      ...(options.properties?.seed === undefined ? {} : { seed: options.properties.seed }),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Metadata and messages

function checkMetaIdentity<C, P, F extends PackFacts, O>(prep: Prepared<C, P, F, O>): Outcome {
  const { meta } = prep.pack;
  const failures: string[] = [];
  if (!PACK_ID_PATTERN.test(meta.id))
    failures.push(`id "${meta.id}" does not match ${PACK_ID_PATTERN.source}`);
  if (!SEMVER.test(meta.version)) failures.push(`version "${meta.version}" is not semver`);
  const packageVersion = prep.options.packageVersion;
  if (packageVersion !== undefined && packageVersion !== meta.version) {
    failures.push(`version "${meta.version}" differs from package.json "${packageVersion}"`);
  }
  if (meta.name.trim() === "") failures.push("name is empty");
  if (meta.description.trim() === "") failures.push("description is empty");
  if (meta.countries !== "any") {
    if (meta.countries.length === 0) failures.push('countries is empty (use "any")');
    const unknown = meta.countries.filter((code: string) => !isCountryCode(code));
    if (unknown.length > 0)
      failures.push(`countries ${unknown.join(", ")} are not assigned ISO 3166-1 codes`);
    if (new Set(meta.countries).size !== meta.countries.length)
      failures.push("countries has duplicates");
  }
  if (!HTTPS_URL_PATTERN.test(meta.docsUrl))
    failures.push(`docsUrl "${meta.docsUrl}" is not an https URL`);
  if (meta.maintainers.length === 0) failures.push("at least one maintainer is required");
  for (const maintainer of meta.maintainers) {
    if (maintainer.name.trim() === "") failures.push("a maintainer has no name");
    if (maintainer.github !== undefined && !GITHUB_HANDLE.test(maintainer.github)) {
      failures.push(`"${maintainer.github}" is not a GitHub handle`);
    }
  }
  if (!meta.locales.includes("en")) failures.push('locales must include "en"');
  if (new Set(meta.locales).size !== meta.locales.length) failures.push("locales has duplicates");
  for (const locale of meta.locales) {
    let canonical: string | undefined;
    try {
      canonical = Intl.getCanonicalLocales(locale)[0];
    } catch {
      canonical = undefined;
    }
    if (canonical !== locale) failures.push(`locale "${locale}" is not a canonical BCP 47 tag`);
  }
  if (meta.documentLocale !== undefined && !meta.locales.includes(meta.documentLocale)) {
    failures.push(`documentLocale "${meta.documentLocale}" is not in locales`);
  }
  const disclaimer = messageRefProblem(meta.disclaimer);
  if (disclaimer !== undefined) failures.push(`disclaimer: ${disclaimer}`);
  return { failures };
}

function checkMetaDisclaimer<C, P, F extends PackFacts, O>(prep: Prepared<C, P, F, O>): Outcome {
  const { meta, messages } = prep.pack;
  const failures: string[] = [];
  for (const locale of prep.locales) {
    const catalog = ownValue(messages, locale);
    for (const key of [meta.disclaimer.key, "meta.name", "meta.description"]) {
      if (catalog === undefined || !hasOwn(catalog, key))
        failures.push(`"${key}" is missing in "${locale}"`);
    }
    try {
      formatMessage(meta.disclaimer, prep.catalogs, locale);
    } catch (error) {
      failures.push(`the disclaimer does not format in "${locale}": ${errorText(error)}`);
    }
  }
  return { failures };
}

function checkMessagesComplete<C, P, F extends PackFacts, O>(prep: Prepared<C, P, F, O>): Outcome {
  const { messages, meta } = prep.pack;
  const failures: string[] = [];
  const english = ownValue(messages, "en");
  if (english === undefined) return { failures: ['the "en" catalog is missing'] };
  const englishKeys = new Set(Object.keys(english));
  for (const locale of meta.locales) {
    if (ownValue(messages, locale) === undefined)
      failures.push(`locale "${locale}" has no catalog`);
  }
  for (const [locale, catalog] of Object.entries(messages)) {
    if (!meta.locales.includes(locale))
      failures.push(`catalog "${locale}" is not listed in meta.locales`);
    const keys = Object.keys(catalog);
    for (const key of keys) {
      if (key.startsWith("core.")) failures.push(`"${locale}" defines the reserved key "${key}"`);
      if (typeof catalog[key] !== "string") failures.push(`"${locale}" "${key}" is not a string`);
      if (!englishKeys.has(key))
        failures.push(`"${locale}" has "${key}", which "en" does not have`);
    }
    for (const key of englishKeys)
      if (!hasOwn(catalog, key)) failures.push(`"${locale}" is missing "${key}"`);
  }
  return { failures };
}

function checkMessagesSyntax<C, P, F extends PackFacts, O>(prep: Prepared<C, P, F, O>): Outcome {
  const failures: string[] = [];
  const english = ownValue(prep.pack.messages, "en") ?? {};
  for (const [locale, catalog] of Object.entries(prep.pack.messages)) {
    for (const [key, text] of Object.entries(catalog)) {
      let names: readonly string[];
      try {
        names = parseMessage(text, key);
      } catch (error) {
        failures.push(`"${locale}" "${key}": ${errorText(error)}`);
        continue;
      }
      const reference = locale === "en" ? undefined : ownValue(english, key);
      if (reference === undefined) continue;
      let expected: readonly string[];
      try {
        expected = parseMessage(reference, key);
      } catch {
        continue; // reported for "en"
      }
      if (canonicalJson([...names].sort()) !== canonicalJson([...expected].sort())) {
        failures.push(
          `"${locale}" "${key}" uses {${names.join("}, {")}} but "en" uses {${expected.join("}, {")}}`,
        );
      }
    }
  }
  return { failures };
}

// ---------------------------------------------------------------------------------------------
// Configuration

function issuesText(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.map(String).join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

function checkConfigValid<C, P, F extends PackFacts, O>(prep: Prepared<C, P, F, O>): Outcome {
  const { validConfigs } = prep.options;
  if (validConfigs.length === 0)
    return { failures: ["validConfigs needs at least one configuration"] };
  const failures: string[] = [];
  validConfigs.forEach((config, index) => {
    const parsed = prep.pack.configSchema.safeParse(config);
    if (!parsed.success)
      failures.push(`validConfigs[${index}] is rejected: ${issuesText(parsed.error)}`);
  });
  return { failures };
}

function checkConfigInvalid<C, P, F extends PackFacts, O>(prep: Prepared<C, P, F, O>): Outcome {
  const { invalidConfigs } = prep.options;
  if (invalidConfigs.length === 0)
    return { failures: ["invalidConfigs needs at least one configuration"] };
  const failures: string[] = [];
  invalidConfigs.forEach((entry, index) => {
    if (prep.pack.configSchema.safeParse(entry.config).success) {
      failures.push(`invalidConfigs[${index}] (${entry.reason}) is accepted`);
    }
  });
  return { failures };
}

function checkConfigIdempotent<C, P, F extends PackFacts, O>(prep: Prepared<C, P, F, O>): Outcome {
  const failures: string[] = [];
  prep.configs.forEach((parsed, index) => {
    const at = `validConfigs[${index}]`;
    if (!isJsonValue(parsed)) {
      failures.push(
        `${at}: the parsed configuration is not plain JSON (no transforms, bigint, Date, undefined)`,
      );
      return;
    }
    const again = prep.pack.configSchema.safeParse(parsed);
    if (!again.success || canonicalJson(again.data) !== canonicalJson(parsed)) {
      failures.push(`${at}: parse(parse(x)) differs from parse(x)`);
    }
    const roundTrip = prep.pack.configSchema.safeParse(
      JSON.parse(JSON.stringify(parsed)) as unknown,
    );
    if (!roundTrip.success || canonicalJson(roundTrip.data) !== canonicalJson(parsed)) {
      failures.push(`${at}: the parsed configuration does not survive a JSON round trip`);
    }
  });
  return { failures };
}

function checkConfigJsonSchema<C, P, F extends PackFacts, O>(prep: Prepared<C, P, F, O>): Outcome {
  const failures: string[] = [];
  const schemas = [
    ["configSchema", prep.pack.configSchema],
    ["invoiceOptionsSchema", prep.pack.invoiceOptionsSchema],
  ] as const;
  for (const [name, schema] of schemas) {
    for (const io of ["input", "output"] as const) {
      try {
        z.toJSONSchema(schema, { io });
      } catch (error) {
        failures.push(`z.toJSONSchema(${name}, { io: "${io}" }) failed: ${errorText(error)}`);
      }
    }
  }
  return { failures };
}

// ---------------------------------------------------------------------------------------------
// Parameters, rules, rounding

function checkParametersTimeline<C, P, F extends PackFacts, O>(
  prep: Prepared<C, P, F, O>,
): Outcome {
  const versions = prep.pack.parameters;
  if (versions.length === 0) return { failures: ["at least one parameter version is required"] };
  const failures: string[] = [];
  const ids = new Set<string>();
  versions.forEach((version, index) => {
    const at = `parameters[${index}] "${version.id}"`;
    if (version.id.trim() === "") failures.push(`parameters[${index}] has an empty id`);
    if (ids.has(version.id)) failures.push(`${at}: duplicate id`);
    ids.add(version.id);
    if (!isIsoDate(version.effectiveFrom)) failures.push(`${at}: effectiveFrom is not an ISO date`);
    const previous = versions[index - 1];
    if (previous !== undefined && !(previous.effectiveFrom < version.effectiveFrom)) {
      failures.push(`${at}: effectiveFrom must be after the previous version's`);
    }
    if (version.sources.length === 0) failures.push(`${at}: no sources`);
    if (version.changes.length === 0 || version.changes.some((change) => change.trim() === "")) {
      failures.push(`${at}: changes must list at least one non-empty entry`);
    }
    if (!isDeeplyFrozen(version.params)) failures.push(`${at}: params are not deeply frozen`);
  });
  return { failures };
}

function checkParametersSnapshot<C, P, F extends PackFacts, O>(
  prep: Prepared<C, P, F, O>,
): Outcome {
  // The comparison with the committed snapshot happens in defineConformanceSuite (vitest);
  // here the timeline must convert to JSON.
  JSON.stringify(parametersToJson(listParameters(prep.pack)));
  return { failures: [] };
}

function checkParametersResolution<C, P, F extends PackFacts, O>(
  prep: Prepared<C, P, F, O>,
): Outcome {
  const { pack } = prep;
  const failures: string[] = [];
  const resolved = (date: IsoDate): string => {
    try {
      return resolveParameters(pack.parameters, pack.meta.id, date).id;
    } catch (error) {
      return errorText(error);
    }
  };
  pack.parameters.forEach((version, index) => {
    const onFirstDay = resolved(version.effectiveFrom);
    if (onFirstDay !== version.id) {
      failures.push(`"${version.id}" does not resolve on its first day (got ${onFirstDay})`);
    }
    const previous = pack.parameters[index - 1];
    if (previous !== undefined) {
      const dayBefore = addDays(version.effectiveFrom, -1);
      const before = resolved(dayBefore);
      if (before !== previous.id)
        failures.push(`"${previous.id}" does not resolve on ${dayBefore} (got ${before})`);
    }
  });
  const first = pack.parameters[0];
  if (first !== undefined && first.effectiveFrom !== "1900-01-01") {
    const before = addDays(first.effectiveFrom, -1);
    try {
      resolveParameters(pack.parameters, pack.meta.id, before);
      failures.push(`${before} (before the first version) resolves instead of throwing`);
    } catch (error) {
      if (!(error instanceof ParameterNotFoundError))
        failures.push(`${before}: ${errorText(error)}`);
    }
  }
  return { failures };
}

function checkRulesIdentity<C, P, F extends PackFacts, O>(prep: Prepared<C, P, F, O>): Outcome {
  const { rules, meta } = prep.pack;
  if (rules.length === 0) return { failures: ["at least one rule is required"] };
  const failures: string[] = [];
  const ids = new Set<string>();
  const english = ownValue(prep.catalogs, "en") ?? {};
  for (const rule of rules) {
    if (ids.has(rule.id)) failures.push(`duplicate rule id "${rule.id}"`);
    ids.add(rule.id);
    if (!RULE_ID_PATTERN.test(rule.id))
      failures.push(`rule id "${rule.id}" does not match RULE_ID_PATTERN`);
    if (!rule.id.startsWith(`${meta.id}.`))
      failures.push(`rule id "${rule.id}" does not start with "${meta.id}."`);
    const problem = messageRefProblem(rule.title);
    if (problem !== undefined) failures.push(`rule "${rule.id}" title: ${problem}`);
    else if (!hasOwn(english, rule.title.key))
      failures.push(`rule "${rule.id}" title key "${rule.title.key}" is missing`);
  }
  return { failures };
}

function checkRulesSources<C, P, F extends PackFacts, O>(prep: Prepared<C, P, F, O>): Outcome {
  const failures: string[] = [];
  const notes = new Set<string>();
  const byId = new Map<string, string>();
  const visit = (owner: string, sources: readonly SourceRef[]): void => {
    if (sources.length === 0) failures.push(`${owner}: at least one source is required`);
    for (const source of sources) {
      const problems = sourceProblems(source);
      if (problems.length > 0) {
        failures.push(`${owner}: source "${source.id}": ${problems.join(", ")}`);
        continue;
      }
      const text = canonicalJson(source);
      const known = byId.get(source.id);
      if (known !== undefined && known !== text)
        failures.push(`source id "${source.id}" is used for different sources`);
      byId.set(source.id, text);
      if (source.verification.status === "to-be-verified") {
        notes.add(
          `to be verified: ${source.id} (${source.title}, ${source.citation}): ${source.verification.reason}`,
        );
      }
    }
  };
  for (const rule of prep.pack.rules) visit(`rule "${rule.id}"`, rule.sources);
  for (const version of prep.pack.parameters) visit(`parameters "${version.id}"`, version.sources);
  return { failures, notes: [...notes] };
}

function checkRoundingPolicy<C, P, F extends PackFacts, O>(prep: Prepared<C, P, F, O>): Outcome {
  const failures: string[] = [];
  if (prep.configs.length === 0) return { failures: ["no valid configuration to check"] };
  prep.configs.forEach((config, index) => {
    const policy: unknown = prep.pack.roundingPolicy(config);
    const problems = roundingPolicyProblems(policy);
    if (problems.length > 0) {
      failures.push(`validConfigs[${index}]: ${problems.join("; ")}`);
      return;
    }
    for (const locale of prep.locales) {
      try {
        formatMessage((policy as RoundingPolicy).description, prep.catalogs, locale);
      } catch (error) {
        failures.push(
          `validConfigs[${index}]: the description does not format in "${locale}": ${errorText(error)}`,
        );
      }
    }
  });
  return { failures };
}

// ---------------------------------------------------------------------------------------------
// Fixtures and samples

function fixtureEntries(options: ConformanceOptions): {
  readonly entries: readonly FixtureEntry[];
  readonly failures: readonly string[];
} {
  if (options.fixturesDir !== undefined) return loadFixtureFiles(options.fixturesDir);
  return { entries: options.fixtures.map((json) => ({ json })), failures: [] };
}

function checkFixturesSchema<C, P, F extends PackFacts, O>(prep: Prepared<C, P, F, O>): Outcome {
  const { entries, failures: loading } = fixtureEntries(prep.options);
  const failures = [...loading];
  if (entries.length === 0 && loading.length === 0)
    failures.push("at least one golden fixture is required");
  entries.forEach((entry, index) => {
    for (const problem of validateFixture(entry, prep.pack.meta.id).problems) {
      failures.push(`${fixtureLabel(entry, index)}: ${problem}`);
    }
  });
  return { failures };
}

function checkFixturesGolden<C, P, F extends PackFacts, O>(prep: Prepared<C, P, F, O>): Outcome {
  const failures: string[] = [];
  fixtureEntries(prep.options).entries.forEach((entry, index) => {
    const { fixture } = validateFixture(entry, prep.pack.meta.id);
    if (fixture === undefined) return; // reported by fixtures.schema
    for (const failure of runFixture(prep.pack, fixture))
      failures.push(`${fixtureLabel(entry, index)}: ${failure}`);
  });
  return { failures };
}

/** The input with per-invoice options (validated by computeInvoice, like any input). */
function withOptions(input: InvoiceInput, options: unknown): InvoiceInput {
  return { ...input, options: options as Readonly<Record<string, JsonValue>> };
}

function checkSamplesCompute<C, P, F extends PackFacts, O>(prep: Prepared<C, P, F, O>): Outcome {
  const { sampleInputs } = prep.options;
  if (sampleInputs.length === 0) return { failures: ["sampleInputs needs at least one input"] };
  const failures: string[] = [];
  sampleInputs.forEach((json, index) => {
    let input: InvoiceInput;
    try {
      input = parseInvoiceInput(json);
    } catch (error) {
      failures.push(`sampleInputs[${index}] is invalid: ${errorText(error)}`);
      return;
    }
    const optionSets = input.options === undefined ? prep.invoiceOptions : [input.options];
    prep.configs.forEach((config, configIndex) => {
      for (const options of optionSets) {
        const at = `sampleInputs[${index}] with validConfigs[${configIndex}] and options ${canonicalJson(options)}`;
        try {
          const computation = computeInvoice(prep.pack, config, withOptions(input, options));
          for (const failure of reconciliationFailures(computation))
            failures.push(`${at}: ${failure.check} ${failure.detail}`);
        } catch (error) {
          if (!(error instanceof UnsupportedInputError))
            failures.push(`${at}: ${errorText(error)}`);
        }
      }
    });
  });
  return { failures };
}

// ---------------------------------------------------------------------------------------------
// Properties

interface Case<C> {
  readonly input: InvoiceInput;
  readonly config: C;
  readonly configIndex: number;
}

function caseArbitrary<C, P, F extends PackFacts, O>(
  prep: Prepared<C, P, F, O>,
  minLines = 0,
): fc.Arbitrary<Case<C>> {
  return fc
    .record({
      currency: fc.constantFrom(...prep.currencies),
      configIndex: fc.integer({ min: 0, max: prep.configs.length - 1 }),
      options: fc.constantFrom(...prep.invoiceOptions),
    })
    .chain(({ currency, configIndex, options }) =>
      invoiceInputArbitrary({
        currency,
        dateRange: prep.dateRange,
        clientCountries: prep.clientCountries,
      })
        .filter((input) => input.lines.length >= minLines)
        .map((input) => ({
          input: withOptions(input, options),
          config: prep.configs[configIndex] as C,
          configIndex,
        })),
    );
}

/** Computes, or returns undefined for an input the pack refuses (a skipped run). */
function computeCase<C, P, F extends PackFacts, O>(
  prep: Prepared<C, P, F, O>,
  item: Case<C>,
): InvoiceComputation | undefined {
  try {
    return computeInvoice(prep.pack, item.config, item.input);
  } catch (error) {
    if (error instanceof UnsupportedInputError) return undefined;
    throw error;
  }
}

function describeCase<C>(item: Case<C>): string {
  return `validConfigs[${item.configIndex}], input ${JSON.stringify(invoiceInputToJson(item.input))}`;
}

function runProperty<C, P, F extends PackFacts, O, T extends Case<C>>(
  prep: Prepared<C, P, F, O>,
  arbitrary: () => fc.Arbitrary<T>,
  predicate: (item: T, computation: InvoiceComputation) => readonly string[],
): Outcome {
  if (prep.configs.length === 0)
    return { failures: ["no valid configuration to generate inputs with"] };
  const details = fc.check(
    fc.property(arbitrary(), (item) => {
      const computation = computeCase(prep, item);
      fc.pre(computation !== undefined);
      const problems = predicate(item, computation);
      if (problems.length > 0) throw new Error(problems.slice(0, 5).join("; "));
    }),
    { numRuns: prep.fc.numRuns, ...(prep.fc.seed === undefined ? {} : { seed: prep.fc.seed }) },
  );
  if (!details.failed) return { failures: [] };
  if (details.counterexample === null) {
    return {
      failures: [
        `the property could not run: ${details.interrupted ? "interrupted" : "too many inputs refused by the pack (UnsupportedInputError)"}`,
      ],
    };
  }
  const [item] = details.counterexample;
  return {
    failures: [
      `${errorText(details.errorInstance)} (seed ${details.seed}, path "${details.counterexamplePath}"; ${describeCase(item)})`,
    ],
  };
}

const json = (c: InvoiceComputation): string => JSON.stringify(computationToJson(c));

function comparable(c: InvoiceComputation): unknown {
  const byId = <T>(items: readonly T[], key: (item: T) => string): readonly T[] =>
    [...items].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  const money = (value: Money): string => `${value.amount}`;
  return {
    totals: [c.subtotal, c.taxableBase, c.taxTotal, c.total, c.withholdingTotal, c.netPayable].map(
      money,
    ),
    lines: byId(c.lines, (line) => line.id).map((line) => [line.id, money(line.net), line.groupId]),
    components: byId(c.components, (component) => component.id).map((component) => [
      component.id,
      money(component.base),
      money(component.amount),
      byId(component.allocations, (allocation) => allocation.groupId).map((allocation) => [
        allocation.groupId,
        money(allocation.base),
        money(allocation.amount),
      ]),
    ]),
    summary: byId(c.vatSummary, (entry) => entry.groupId).map((entry) => [
      entry.groupId,
      money(entry.base),
      money(entry.tax),
    ]),
  };
}

/** |amount − base × rate / 100| ≤ items × bound, exactly (bigint arithmetic). */
function withinBound(
  amount: Money,
  base: Money,
  rate: Decimal,
  items: bigint,
  mode: RoundingMode | undefined,
): boolean {
  const denominator = 10n ** BigInt(rate.scale + 2);
  const difference = amount.amount * denominator - base.amount * rate.coefficient;
  const distance = difference < 0n ? -difference : difference;
  const half = mode === "halfUp" || mode === "halfEven" || mode === "halfDown";
  // half modes: ≤ ½ per item; directed modes (or unknown): < 1 per item.
  return half ? 2n * distance <= items * denominator : distance < items * denominator;
}

function roundingFailures(c: InvoiceComputation, policy: RoundingPolicy): readonly string[] {
  const failures: string[] = [];
  const entries = new Map(c.vatSummary.map((entry) => [entry.groupId, entry] as const));
  const modeOf = (kind: string): RoundingMode | undefined => {
    switch (kind) {
      case "tax":
        return policy.taxes.mode;
      case "withholding":
        return policy.withholdings.mode;
      case "contribution":
      case "surcharge":
        return policy.contributions.mode;
      default:
        return undefined;
    }
  };
  for (const component of c.components) {
    const mode = modeOf(component.kind);
    if (component.kind === "tax") {
      for (const allocation of component.allocations) {
        const entry = entries.get(allocation.groupId);
        if (entry?.rate === undefined) continue;
        let items = 1n;
        if (policy.taxes.scope === "per-line") {
          const lines = c.lines.filter((line) => line.groupId === allocation.groupId).length;
          const others = c.components.filter(
            (other) =>
              other.kind !== "tax" &&
              other.effect === "adds-to-total" &&
              other.allocations.some((item) => item.groupId === allocation.groupId),
          ).length;
          items = BigInt(Math.max(1, lines + others));
        }
        if (!withinBound(allocation.amount, allocation.base, entry.rate, items, mode)) {
          failures.push(
            `tax "${component.id}" on "${allocation.groupId}": ${allocation.amount.amount} is too far from ${allocation.base.amount} × ${entry.rate.coefficient}e-${entry.rate.scale}%`,
          );
        }
      }
      continue;
    }
    if (component.rate === undefined) continue;
    const rate = component.rate;
    const parts =
      component.allocations.length > 0
        ? component.allocations
        : [{ groupId: "", base: component.base, amount: component.amount }];
    for (const part of parts) {
      if (!withinBound(part.amount, part.base, rate, 1n, mode)) {
        failures.push(
          `"${component.id}" ${part.groupId}: ${part.amount.amount} is too far from ${part.base.amount} × ${rate.coefficient}e-${rate.scale}%`,
        );
      }
    }
  }
  return failures;
}

const PROPERTIES: Record<
  Extract<ConformanceCheckId, `property.${string}`>,
  <C, P, F extends PackFacts, O>(prep: Prepared<C, P, F, O>) => Outcome
> = {
  "property.reconciliation": (prep) =>
    runProperty(
      prep,
      () => caseArbitrary(prep),
      (_item, c) =>
        reconciliationFailures(c).map(
          (failure) =>
            `${failure.check} ${failure.detail}: expected ${failure.expected}, got ${failure.actual}`,
        ),
    ),
  "property.determinism": (prep) =>
    runProperty(
      prep,
      () => caseArbitrary(prep),
      (item, c) => {
        const first = json(c);
        const again = computeInvoice(prep.pack, item.config, item.input);
        const clone = computeInvoice(
          prep.pack,
          structuralClone(item.config),
          structuralClone(item.input),
        );
        return first === json(again) && first === json(clone)
          ? []
          : ["two computations of the same input differ"];
      },
    ),
  "property.permutation": (prep) =>
    runProperty(
      prep,
      () =>
        caseArbitrary(prep).chain((item) =>
          fc
            .shuffledSubarray([...item.input.lines], {
              minLength: item.input.lines.length,
              maxLength: item.input.lines.length,
            })
            .map((lines) => ({ ...item, shuffled: lines })),
        ),
      (item, c) => {
        const other = computeInvoice(prep.pack, item.config, {
          ...item.input,
          lines: item.shuffled,
        });
        return deepEqual(comparable(c), comparable(other))
          ? []
          : ["shuffling the lines changed totals, components or the summary"];
      },
    ),
  "property.non-negative": (prep) =>
    runProperty(
      prep,
      () => caseArbitrary(prep),
      (_item, c) =>
        amountsOf(c)
          .filter((found) => isMoney(found.value) && found.value.amount < 0n)
          .map((found) => `${found.path} is negative`),
    ),
  "property.currency": (prep) =>
    runProperty(
      prep,
      () => caseArbitrary(prep),
      (item, c) =>
        amountsOf(c)
          .filter((found) => found.value.currency !== item.input.currency)
          .map(
            (found) => `${found.path} is in ${found.value.currency}, not ${item.input.currency}`,
          ),
    ),
  "property.rounding-bounds": (prep) =>
    runProperty(
      prep,
      () => caseArbitrary(prep),
      (item, c) => roundingFailures(c, prep.pack.roundingPolicy(item.config)),
    ),
  "property.immutability": (prep) =>
    runProperty(
      prep,
      () => caseArbitrary(prep),
      (_item, c) => (isDeeplyFrozen(c) ? [] : ["the computation is not deeply frozen"]),
    ),
  "property.trace": (prep) =>
    runProperty(
      prep,
      () => caseArbitrary(prep),
      (_item, c) => {
        const failures: string[] = [];
        c.trace.forEach((step, index) => {
          if (step.step !== index + 1) failures.push(`trace[${index}] is numbered ${step.step}`);
        });
        for (const component of c.components) {
          if (
            !c.trace.some(
              (step) => step.componentId === component.id && step.ruleId === component.ruleId,
            )
          ) {
            failures.push(`component "${component.id}" has no trace step by its rule`);
          }
        }
        for (const locale of prep.locales) {
          for (const { path, ref } of messagesOf(c)) {
            try {
              formatMessage(ref, prep.catalogs, locale);
            } catch (error) {
              failures.push(`${path} in "${locale}": ${errorText(error)}`);
            }
          }
          try {
            formatTrace(c, prep.pack, locale);
            formatComputation(c, prep.pack, locale);
          } catch (error) {
            failures.push(`formatting in "${locale}": ${errorText(error)}`);
          }
        }
        return failures;
      },
    ),
  "property.json": (prep) =>
    runProperty(
      prep,
      () => caseArbitrary(prep),
      (_item, c) => {
        const text = computationToJson(c);
        const back = computationFromJson(JSON.parse(JSON.stringify(text)) as unknown);
        return deepEqual(back, c) && json(back) === JSON.stringify(text)
          ? []
          : ["computationFromJson(computationToJson(c)) differs from c"];
      },
    ),
  "property.invalid-input": (prep) =>
    runProperty(
      prep,
      () => caseArbitrary(prep, 1),
      (item) => {
        const [first, ...rest] = item.input.lines;
        if (first === undefined) return [];
        const other: CurrencyCode = item.input.currency === "USD" ? "EUR" : "USD";
        const mutations: readonly [string, InvoiceInput][] = [
          [
            "a negative quantity",
            { ...item.input, lines: [{ ...first, quantity: decimal("-1") }, ...rest] },
          ],
          [
            "a foreign-currency price",
            {
              ...item.input,
              lines: [
                { ...first, unitPrice: { amount: first.unitPrice.amount, currency: other } },
                ...rest,
              ],
            },
          ],
          ["a duplicate line id", { ...item.input, lines: [first, ...rest, first] }],
        ];
        const failures: string[] = [];
        for (const [what, input] of mutations) {
          try {
            computeInvoice(prep.pack, item.config, input);
            failures.push(`${what} was accepted`);
          } catch (error) {
            if (!(error instanceof InvalidInputError))
              failures.push(`${what}: expected InvalidInputError, got ${errorText(error)}`);
          }
        }
        return failures;
      },
    ),
};

function checkThresholds<C, P, F extends PackFacts, O>(prep: Prepared<C, P, F, O>): Outcome {
  const capability = prep.pack.capabilities.annualThresholds;
  if (capability === undefined)
    return { failures: [], notes: ["the pack has no annualThresholds capability"] };
  if (prep.configs.length === 0) return { failures: ["no valid configuration to check"] };
  const failures: string[] = [];
  const currency = prep.currencies[0] ?? "EUR";
  const year = yearOf(prep.dateRange.from);
  const asOf = isoDate(`${year}-12-31`);
  const rank = (status: string): number =>
    REVENUE_STATUS_ORDER.indexOf(status as (typeof REVENUE_STATUS_ORDER)[number]);

  prep.configs.forEach((config, index) => {
    const empty = capability.evaluate(config, { year, currency, receipts: [], asOf });
    if (empty.status !== "ok" && empty.status !== "not-applicable") {
      failures.push(`validConfigs[${index}]: no receipts gives "${empty.status}"`);
    }
  });

  const receipt = fc
    .record({
      day: fc.integer({ min: 0, max: 364 }),
      amount: decimalArbitrary({ min: "0", max: "200000", maxScale: 2 }),
    })
    .map(({ day, amount }): RevenueReceipt => ({
      date: addDays(isoDate(`${year}-01-01`), day),
      amount: fromDecimal(amount, currency, "halfUp"),
    }));
  const monotonic = fc.check(
    fc.property(
      fc.integer({ min: 0, max: prep.configs.length - 1 }),
      fc.array(receipt, { maxLength: 12 }),
      (configIndex, receipts) => {
        const config = prep.configs[configIndex] as C;
        const sorted = [...receipts].sort((a, b) => compareIsoDate(a.date, b.date));
        let previous = -1;
        let first: string | undefined;
        for (let count = 0; count <= sorted.length; count += 1) {
          const status = capability.evaluate(config, {
            year,
            currency,
            receipts: sorted.slice(0, count),
            asOf,
          }).status;
          first ??= status;
          if (first === "not-applicable" && status !== "not-applicable")
            throw new Error(`"not-applicable" became "${status}"`);
          if (rank(status) < previous)
            throw new Error(`adding a receipt lowered the status to "${status}"`);
          previous = rank(status);
        }
      },
    ),
    {
      numRuns: Math.max(20, (prep.fc.numRuns - (prep.fc.numRuns % 4)) / 4),
      ...(prep.fc.seed === undefined ? {} : { seed: prep.fc.seed }),
    },
  );
  if (monotonic.failed)
    failures.push(`receipts: ${errorText(monotonic.errorInstance)} (seed ${monotonic.seed})`);

  const revenue = runProperty(
    prep,
    () => caseArbitrary(prep),
    (item, c) => {
      const countable = capability.countableRevenue(item.config, c);
      if (!isMoney(countable) || countable.currency !== c.currency)
        return ["countableRevenue is not in the invoice currency"];
      if (countable.amount < 0n) return ["countableRevenue is negative"];
      return countable.amount > c.total.amount ? ["countableRevenue exceeds the total"] : [];
    },
  );
  return { failures: [...failures, ...revenue.failures] };
}

const CHECKS: Record<
  ConformanceCheckId,
  <C, P, F extends PackFacts, O>(prep: Prepared<C, P, F, O>) => Outcome
> = {
  "meta.identity": checkMetaIdentity,
  "meta.disclaimer": checkMetaDisclaimer,
  "messages.complete": checkMessagesComplete,
  "messages.syntax": checkMessagesSyntax,
  "config.valid": checkConfigValid,
  "config.invalid": checkConfigInvalid,
  "config.idempotent": checkConfigIdempotent,
  "config.json-schema": checkConfigJsonSchema,
  "parameters.timeline": checkParametersTimeline,
  "parameters.snapshot": checkParametersSnapshot,
  "parameters.resolution": checkParametersResolution,
  "rules.identity": checkRulesIdentity,
  "rules.sources": checkRulesSources,
  "rounding.policy": checkRoundingPolicy,
  "fixtures.schema": checkFixturesSchema,
  "fixtures.golden": checkFixturesGolden,
  "samples.compute": checkSamplesCompute,
  ...PROPERTIES,
  "thresholds.contract": checkThresholds,
};

/** Runs one check; an unexpected exception is a failure of that check. */
export function runConformanceCheck<C, P, F extends PackFacts, O>(
  pack: TaxPack<C, P, F, O>,
  options: ConformanceOptions,
  id: ConformanceCheckId,
): ConformanceCheckResult {
  let outcome: Outcome;
  try {
    outcome = CHECKS[id](prepare(pack, options));
  } catch (error) {
    outcome = { failures: [`the check threw: ${errorText(error)}`] };
  }
  return {
    id,
    ok: outcome.failures.length === 0,
    failures: outcome.failures,
    notes: outcome.notes ?? [],
  };
}

/** The same checks as plain functions, for testing the suite itself. */
export function runConformanceChecks<C, P, F extends PackFacts, O>(
  pack: TaxPack<C, P, F, O>,
  options: ConformanceOptions,
): readonly ConformanceCheckResult[] {
  return CONFORMANCE_CHECK_IDS.map((id) => runConformanceCheck(pack, options, id));
}
