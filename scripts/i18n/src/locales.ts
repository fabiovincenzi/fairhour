/**
 * Locale completeness checks. English (`en`) is the source locale: every other locale must have
 * every English key, with the same ICU arguments and tags. Messages are read with
 * `@formatjs/icu-messageformat-parser`, the parser next-intl renders them with, so what this check
 * accepts is what the app can display (apostrophes and quoting included). The only dependency, so
 * CI installs just this package (`pnpm install --filter @fairhour/i18n-scripts`) before running it
 * with plain Node.
 */

import {
  parse,
  TYPE,
  type Location,
  type MessageFormatElement,
} from "@formatjs/icu-messageformat-parser";

export interface Messages {
  readonly [key: string]: string | Messages;
}

/** A message the ICU parser rejects. */
export interface SyntaxIssue {
  readonly key: string;
  /** The parser's error kind and position, e.g. `UNCLOSED_TAG (line 1, column 9)`. */
  readonly error: string;
}

export interface LocaleReport {
  readonly locale: string;
  readonly total: number;
  readonly translated: number;
  /** Keys present in English but missing here. */
  readonly missing: readonly string[];
  /** Keys present here but not in English (stale). */
  readonly extra: readonly string[];
  /** Messages that are not valid ICU MessageFormat (stale keys included). */
  readonly syntaxErrors: readonly SyntaxIssue[];
  /** Keys whose arguments or tags differ from English. */
  readonly placeholderMismatches: readonly string[];
  /** Keys whose value is identical to English (possibly untranslated). */
  readonly identical: readonly string[];
}

export interface AppReport {
  readonly app: string;
  readonly locales: readonly LocaleReport[];
}

/** Flattens nested messages into dot-separated keys. */
export function flatten(messages: Messages, prefix = ""): Map<string, string> {
  const result = new Map<string, string>();
  for (const [key, value] of Object.entries(messages)) {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    if (typeof value === "string") result.set(path, value);
    else for (const [k, v] of flatten(value, path)) result.set(k, v);
  }
  return result;
}

/** What `parse` throws: a `SyntaxError` named after the error kind, with the position. */
type ParserError = Error & { readonly location: Location };

export type ParsedMessage =
  | {
      readonly ok: true;
      /** Sorted, without duplicates: argument names (`count`) and tag names (`<link>`). */
      readonly names: readonly string[];
    }
  | { readonly ok: false; readonly error: string };

function collectNames(elements: readonly MessageFormatElement[], names: Set<string>): void {
  for (const element of elements) {
    switch (element.type) {
      case TYPE.literal:
      case TYPE.pound:
        break;
      case TYPE.argument:
      case TYPE.number:
      case TYPE.date:
      case TYPE.time:
        names.add(element.value);
        break;
      case TYPE.select:
      case TYPE.plural:
        names.add(element.value);
        for (const option of Object.values(element.options)) collectNames(option.value, names);
        break;
      case TYPE.tag:
        names.add(`<${element.value}>`);
        collectNames(element.children, names);
        break;
    }
  }
}

/**
 * Parses an ICU message the way the app does (rich-text tags on, `other` required in every
 * `plural` and `select`) and returns the names of its arguments and tags, found anywhere in the
 * tree: in `plural`/`select` options and between a tag's brackets. Text that an apostrophe quotes
 * is literal text to the parser, so an argument or a tag hidden by a quote is not in the result,
 * and an apostrophe that leaves a tag or a brace open is a syntax error.
 */
export function parseMessage(message: string): ParsedMessage {
  try {
    const names = new Set<string>();
    collectNames(parse(message, { ignoreTag: false }), names);
    return { ok: true, names: [...names].sort() };
  } catch (error) {
    if (
      error !== null &&
      typeof error === "object" &&
      "location" in error &&
      typeof error.location === "object" &&
      error.location !== null &&
      "start" in error.location
    ) {
      const { message: kind, location } = error as ParserError;
      const { line, column } = location.start;
      return { ok: false, error: `${kind} (line ${String(line)}, column ${String(column)})` };
    }
    if (error instanceof Error) {
      return { ok: false, error: `${error.name}: ${error.message}` };
    }
    return { ok: false, error: `Error: ${String(error)}` };
  }
}

function sameNames(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((name, index) => name === b[index]);
}

/** Every message that the ICU parser rejects, in file order. */
function syntaxIssues(messages: ReadonlyMap<string, string>): SyntaxIssue[] {
  const issues: SyntaxIssue[] = [];
  for (const [key, message] of messages) {
    const parsed = parseMessage(message);
    if (!parsed.ok) issues.push({ key, error: parsed.error });
  }
  return issues;
}

/**
 * Checks the source locale on its own: it is complete by definition, but its messages must be
 * valid ICU, because a broken English message breaks the app and cannot be compared with.
 */
export function checkSource(source: Messages): LocaleReport {
  const english = flatten(source);
  return {
    locale: "en",
    total: english.size,
    translated: english.size,
    missing: [],
    extra: [],
    syntaxErrors: syntaxIssues(english),
    placeholderMismatches: [],
    identical: [],
  };
}

/**
 * Compares a translation with the English source. Every message of the translation must parse
 * (stale keys included); a message that parses must have the same set of arguments and tags as
 * the English one. A broken English message is reported by {@link checkSource}, not here.
 */
export function compareLocale(locale: string, source: Messages, target: Messages): LocaleReport {
  const english = flatten(source);
  const translated = flatten(target);
  const missing: string[] = [];
  const placeholderMismatches: string[] = [];
  const identical: string[] = [];
  for (const [key, value] of english) {
    const other = translated.get(key);
    if (other === undefined) {
      missing.push(key);
      continue;
    }
    const expected = parseMessage(value);
    const actual = parseMessage(other);
    if (expected.ok && actual.ok && !sameNames(expected.names, actual.names)) {
      placeholderMismatches.push(key);
    }
    if (other === value && /[A-Za-z]{3,}/.test(value)) identical.push(key);
  }
  const extra = [...translated.keys()].filter((key) => !english.has(key));
  return {
    locale,
    total: english.size,
    translated: english.size - missing.length,
    missing,
    extra,
    syntaxErrors: syntaxIssues(translated),
    placeholderMismatches,
    identical,
  };
}

export function isFailing(report: LocaleReport): boolean {
  return (
    report.missing.length > 0 ||
    report.syntaxErrors.length > 0 ||
    report.placeholderMismatches.length > 0
  );
}

export function coverage(report: LocaleReport): number {
  return report.total === 0 ? 100 : Math.floor((report.translated / report.total) * 1000) / 10;
}

export function formatReports(reports: readonly AppReport[]): string {
  if (reports.length === 0) return "No `apps/*/messages/en.json` found yet; nothing to check.\n";
  const lines = ["## Translation coverage", ""];
  for (const app of reports) {
    lines.push(
      `### ${app.app}`,
      "",
      "| Locale | Coverage | Missing | Syntax errors | Placeholder issues | Same as English | Stale keys |",
      "|---|---|---|---|---|---|---|",
    );
    for (const r of app.locales) {
      const status = isFailing(r) ? "❌" : "✅";
      lines.push(
        `| ${status} ${r.locale} | ${String(coverage(r))}% (${String(r.translated)}/${String(r.total)}) | ${String(r.missing.length)} | ${String(r.syntaxErrors.length)} | ${String(r.placeholderMismatches.length)} | ${String(r.identical.length)} | ${String(r.extra.length)} |`,
      );
    }
    for (const r of app.locales.filter(isFailing)) {
      lines.push("", `**${app.app} / ${r.locale}**`);
      for (const key of r.missing.slice(0, 50)) lines.push(`- missing: \`${key}\``);
      for (const issue of r.syntaxErrors) {
        lines.push(`- syntax error: \`${issue.key}\`: ${issue.error}`);
      }
      for (const key of r.placeholderMismatches) lines.push(`- placeholders differ: \`${key}\``);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}
