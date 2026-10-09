/**
 * Locale completeness checks. English (`en`) is the source locale: every other locale must have
 * every English key, with the same ICU placeholders. Dependency-free on purpose so CI can run it
 * with plain Node.
 */

export interface Messages {
  readonly [key: string]: string | Messages;
}

export interface LocaleReport {
  readonly locale: string;
  readonly total: number;
  readonly translated: number;
  /** Keys present in English but missing here. */
  readonly missing: readonly string[];
  /** Keys present here but not in English (stale). */
  readonly extra: readonly string[];
  /** Keys whose placeholders differ from English. */
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

const BRANCHING_TYPES = new Set(["plural", "selectordinal", "select"]);

function skipSpaces(text: string, index: number): number {
  let i = index;
  while (i < text.length && /\s/.test(text[i] ?? "")) i++;
  return i;
}

function readToken(text: string, index: number, stop: RegExp): [string, number] {
  let i = index;
  while (i < text.length && !stop.test(text[i] ?? "")) i++;
  return [text.slice(index, i), i];
}

/** Parses message text until an unmatched `}` (returned index points at it) or the end. */
function parseText(text: string, index: number, names: Set<string>): number {
  let i = index;
  while (i < text.length) {
    const char = text[i];
    if (char === "'") {
      // ICU quoting: '' is a literal quote, '{…}' is literal text.
      const end = text.indexOf("'", i + 1);
      i = end === -1 ? text.length : end + 1;
    } else if (char === "{") {
      i = parseArgument(text, i + 1, names);
    } else if (char === "}") {
      return i;
    } else {
      i++;
    }
  }
  return i;
}

/** Parses `{name}`, `{name, type}`, `{name, type, style}` or a plural/select argument. */
function parseArgument(text: string, index: number, names: Set<string>): number {
  let i = skipSpaces(text, index);
  const [name, afterName] = readToken(text, i, /[\s,}]/);
  if (name !== "") names.add(name);
  i = skipSpaces(text, afterName);
  if (text[i] !== ",") return i + 1; // `}` or malformed: consume one char and move on
  const [type, afterType] = readToken(text, skipSpaces(text, i + 1), /[\s,}]/);
  i = skipSpaces(text, afterType);
  if (text[i] !== ",") return i + 1;
  i++;
  if (!BRANCHING_TYPES.has(type)) {
    // Simple style such as `short` or `::currency/EUR`: skip to the closing brace.
    const end = text.indexOf("}", i);
    return end === -1 ? text.length : end + 1;
  }
  for (;;) {
    i = skipSpaces(text, i);
    if (i >= text.length) return i;
    if (text[i] === "}") return i + 1;
    const [selector, afterSelector] = readToken(text, i, /[\s{}]/);
    i = skipSpaces(text, afterSelector);
    if (selector.startsWith("offset:")) continue;
    if (text[i] !== "{") return i; // malformed
    i = parseText(text, i + 1, names) + 1;
  }
}

/**
 * Extracts ICU argument names (`{count}`, `{count, plural, …}`, `{date, date, short}`) and rich
 * text tags (`<link>`). Plural/select branches are parsed as text, so `{n}` inside `one {…}`
 * counts but the branch text itself does not.
 */
export function placeholders(message: string): string[] {
  const names = new Set<string>();
  let i = 0;
  while (i < message.length) {
    // A stray `}` at the top level is literal text.
    i = parseText(message, i, names) + 1;
  }
  for (const match of message.matchAll(/<\/?([A-Za-z][\w-]*)>/g)) {
    if (match[1]) names.add(`<${match[1]}>`);
  }
  return [...names].sort();
}

function comparablePlaceholders(message: string): string {
  return placeholders(message).join(",");
}

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
    if (comparablePlaceholders(value) !== comparablePlaceholders(other)) {
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
    placeholderMismatches,
    identical,
  };
}

export function isFailing(report: LocaleReport): boolean {
  return report.missing.length > 0 || report.placeholderMismatches.length > 0;
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
      "| Locale | Coverage | Missing | Placeholder issues | Same as English | Stale keys |",
      "|---|---|---|---|---|---|",
    );
    for (const r of app.locales) {
      const status = isFailing(r) ? "❌" : "✅";
      lines.push(
        `| ${status} ${r.locale} | ${String(coverage(r))}% (${String(r.translated)}/${String(r.total)}) | ${String(r.missing.length)} | ${String(r.placeholderMismatches.length)} | ${String(r.identical.length)} | ${String(r.extra.length)} |`,
      );
    }
    for (const r of app.locales.filter(isFailing)) {
      lines.push("", `**${app.app} / ${r.locale}**`);
      for (const key of r.missing.slice(0, 50)) lines.push(`- missing: \`${key}\``);
      for (const key of r.placeholderMismatches) lines.push(`- placeholders differ: \`${key}\``);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}
