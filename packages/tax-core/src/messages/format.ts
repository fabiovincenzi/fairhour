import { formatDecimal, formatMoney, formatPercent, formatPrice } from "@fairhour/money";
import { MessageFormatError, MissingMessageError } from "../errors";
import { hasOwn, ownValue } from "../internal/records";
import { dateParts, type LocaleTag } from "../primitives";
import type {
  MessageCatalog,
  MessageCatalogs,
  MessageParam,
  MessageParamType,
  MessageRef,
} from "./types";

/** Nested `message` parameters may go this deep; deeper nesting is a MessageFormatError. */
export const MAX_MESSAGE_DEPTH = 4;

const PLACEHOLDER_NAME = /^[a-zA-Z][a-zA-Z0-9_]*$/;

const PARAM_TYPES: ReadonlySet<string> = new Set<MessageParamType>([
  "money",
  "price",
  "decimal",
  "percent",
  "date",
  "text",
  "message",
]);

type Token =
  | { readonly kind: "text"; readonly value: string }
  | { readonly kind: "param"; readonly name: string };

/**
 * Splits a message into literal text and `{name}` placeholders (the ICU subset of design 4.4).
 * An apostrophe right before a brace or another apostrophe is rejected: ICU would read it as
 * quoting, so the same string would mean something else there. Use the typographic ’ instead.
 */
function tokenize(text: string, key: string): readonly Token[] {
  const tokens: Token[] = [];
  let literal = "";
  let index = 0;
  while (index < text.length) {
    const char = text.charAt(index);
    if (char === "'") {
      const next = text.charAt(index + 1);
      if (next === "{" || next === "}" || next === "'") {
        throw new MessageFormatError(
          key,
          `an apostrophe before "${next}" is ICU quoting syntax; use the typographic apostrophe ’ (U+2019)`,
        );
      }
    }
    if (char === "{") {
      const close = text.indexOf("}", index + 1);
      if (close === -1) throw new MessageFormatError(key, `unclosed "{" at offset ${index}`);
      const name = text.slice(index + 1, close);
      if (!PLACEHOLDER_NAME.test(name)) {
        throw new MessageFormatError(
          key,
          `invalid placeholder at offset ${index}: expected {name} with name matching ${PLACEHOLDER_NAME.source}`,
        );
      }
      if (literal.length > 0) tokens.push({ kind: "text", value: literal });
      literal = "";
      tokens.push({ kind: "param", name });
      index = close + 1;
      continue;
    }
    if (char === "}") throw new MessageFormatError(key, `unmatched "}" at offset ${index}`);
    literal += char;
    index += 1;
  }
  if (literal.length > 0) tokens.push({ kind: "text", value: literal });
  return tokens;
}

/**
 * Placeholder names used by a message, unique, in order of first use.
 * @throws MessageFormatError when the message is malformed (`key` only labels the error)
 */
export function parseMessage(text: string, key = "(inline)"): readonly string[] {
  const names: string[] = [];
  for (const token of tokenize(text, key)) {
    if (token.kind === "param" && !names.includes(token.name)) names.push(token.name);
  }
  return names;
}

/** Catalog locales to try, in order: the exact tag, its language subtag, then "en". */
export function localeFallbacks(locale: LocaleTag): readonly LocaleTag[] {
  const language = locale.split("-")[0]?.toLowerCase() ?? "";
  const candidates = [locale, language, "en"];
  return candidates.filter(
    (candidate, index) => candidate !== "" && candidates.indexOf(candidate) === index,
  );
}

/** The message text for `key` in the best available locale. @throws MissingMessageError */
export function resolveMessageText(
  key: string,
  catalogs: MessageCatalogs,
  locale: LocaleTag,
): string {
  for (const candidate of localeFallbacks(locale)) {
    const catalog: MessageCatalog | undefined = ownValue(catalogs, candidate);
    if (catalog !== undefined && hasOwn(catalog, key)) {
      const text = catalog[key];
      if (typeof text === "string") return text;
    }
  }
  throw new MissingMessageError(key, locale);
}

function formatDate(value: string, locale: LocaleTag, key: string): string {
  const parts = dateParts(value);
  if (parts === undefined) throw new MessageFormatError(key, "a date parameter is not an ISO date");
  const [year, month, day] = parts;
  // Date.UTC on the explicit date only (never the clock), formatted in UTC: no time-zone shift.
  return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

function formatParam(
  param: MessageParam,
  catalogs: MessageCatalogs,
  locale: LocaleTag,
  depth: number,
  key: string,
): string {
  switch (param.type) {
    case "money":
      return formatMoney(param.value, locale);
    case "price":
      return formatPrice(param.value, locale);
    case "decimal":
      return formatDecimal(param.value, locale);
    case "percent":
      return formatPercent(param.value, locale);
    case "date":
      return formatDate(param.value, locale, key);
    case "text":
      return param.value;
    case "message":
      return formatAt(param.value, catalogs, locale, depth + 1);
  }
}

function formatAt(
  ref: MessageRef,
  catalogs: MessageCatalogs,
  locale: LocaleTag,
  depth: number,
): string {
  if (depth > MAX_MESSAGE_DEPTH) {
    throw new MessageFormatError(
      ref.key,
      `nested messages deeper than ${MAX_MESSAGE_DEPTH} levels`,
    );
  }
  const text = resolveMessageText(ref.key, catalogs, locale);
  let result = "";
  for (const token of tokenize(text, ref.key)) {
    if (token.kind === "text") {
      result += token.value;
      continue;
    }
    const param = ref.params === undefined ? undefined : ownValue(ref.params, token.name);
    if (param === undefined)
      throw new MessageFormatError(ref.key, `missing parameter "${token.name}"`);
    if (!PARAM_TYPES.has(param.type)) {
      throw new MessageFormatError(ref.key, `parameter "${token.name}" has an unknown type`);
    }
    result += formatParam(param, catalogs, locale, depth, ref.key);
  }
  return result;
}

/**
 * The canonical form of a BCP 47 tag (`"it-it"` -> `"it-IT"`, `"EN"` -> `"en"`).
 * @throws MessageFormatError (labelled with `key`) when `locale` is not a valid tag
 */
function canonicalLocale(locale: unknown, key: string): LocaleTag {
  let canonical: string | undefined;
  try {
    // A JavaScript caller may pass anything, and Intl reads undefined as "no locale" ([]).
    canonical = typeof locale === "string" ? Intl.getCanonicalLocales(locale)[0] : undefined;
  } catch {
    canonical = undefined;
  }
  if (canonical === undefined) {
    throw new MessageFormatError(
      key,
      `${JSON.stringify(String(locale).slice(0, 35))} is not a valid BCP 47 locale tag`,
    );
  }
  return canonical;
}

/**
 * Formats with the ICU-compatible subset of design 4.4. The locale is canonicalized first
 * (`"it-it"` -> `"it-IT"`); an invalid tag is a MessageFormatError, never a silent fallback.
 * Locale resolution: exact tag, then its language subtag ("it-IT" -> "it"), then "en".
 * Parameters are formatted for the (canonical) `locale` itself.
 * @throws MissingMessageError (key absent from "en"), MessageFormatError (invalid locale tag,
 *         missing parameter, malformed message, nesting deeper than 4)
 */
export function formatMessage(
  ref: MessageRef,
  catalogs: MessageCatalogs,
  locale: LocaleTag,
): string {
  return formatAt(ref, catalogs, canonicalLocale(locale, ref.key), 0);
}
