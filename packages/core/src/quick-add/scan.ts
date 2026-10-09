import type { LocaleKeywords } from "./locale";

/** A half-open `[start, end)` range of UTF-16 offsets in the input text. */
export interface Span {
  readonly start: number;
  readonly end: number;
  /** The matched text. */
  readonly text: string;
}

/** A time of day. `nextDay` is set for `24:00`, the end of the day. */
export interface ClockTime {
  readonly hour: number;
  readonly minute: number;
  readonly nextDay: boolean;
}

export interface RangeMatch extends Span {
  /** `undefined` when the digits are not a valid time (`9-25:00`, `13pm`). */
  readonly from: ClockTime | undefined;
  readonly to: ClockTime | undefined;
}

export interface DurationMatch extends Span {
  readonly seconds: bigint;
}

export interface IsoDateMatch extends Span {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export interface MentionMatch extends Span {
  /** The mention without the `@` (and without quotes). */
  readonly value: string;
}

export interface TagMatch extends Span {
  readonly value: string;
}

/** The text of a capture group, `""` when the group did not take part in the match. */
function capture(match: RegExpExecArray, index: number): string {
  return match[index] ?? "";
}

interface Scanners {
  readonly range: RegExp;
  readonly hoursAndMinutes: RegExp;
  readonly hours: RegExp;
  readonly minutes: RegExp;
}

const scannersByKeywords = new WeakMap<LocaleKeywords, Scanners>();

function scannersFor(keywords: LocaleKeywords): Scanners {
  let scanners = scannersByKeywords.get(keywords);
  if (scanners === undefined) {
    scanners = buildScanners(keywords);
    scannersByKeywords.set(keywords, scanners);
  }
  return scanners;
}

function alternatives(words: readonly string[]): string {
  return words.map((word) => word.replace(/\s+/g, "\\s+")).join("|");
}

function toSpan(match: RegExpExecArray): Span {
  const text = match[0];
  const start = match.index;
  return { start, end: start + text.length, text };
}

// ---------------------------------------------------------------------------------------------
// Time ranges: 9-10:15, 9:00-10:15, 9am-5pm, from 9 to 10, dalle 9 alle 10:15
// ---------------------------------------------------------------------------------------------

const TIME = String.raw`(\d{1,2})(?::(\d{2}))?(?:\s?(am|pm))?`;

function clockTime(hourText: string, minuteText: string, meridiem: string): ClockTime | undefined {
  const hour = Number.parseInt(hourText, 10);
  const minute = minuteText === "" ? 0 : Number.parseInt(minuteText, 10);
  if (minute > 59) return undefined;
  if (meridiem !== "") {
    if (hour < 1 || hour > 12) return undefined;
    return {
      hour: (hour % 12) + (meridiem.toLowerCase() === "pm" ? 12 : 0),
      minute,
      nextDay: false,
    };
  }
  if (hour === 24 && minute === 0) return { hour: 0, minute: 0, nextDay: true };
  if (hour > 23) return undefined;
  return { hour, minute, nextDay: false };
}

/** Every `time - time` range in the text. */
export function findRanges(text: string, keywords: LocaleKeywords): RangeMatch[] {
  return [...text.matchAll(scannersFor(keywords).range)].map((match) => ({
    ...toSpan(match),
    from: clockTime(capture(match, 1), capture(match, 2), capture(match, 3)),
    to: clockTime(capture(match, 4), capture(match, 5), capture(match, 6)),
  }));
}

// ---------------------------------------------------------------------------------------------
// Durations: 2h, 1.5h, 1,5h, 90m, 1h30, 1h30m, 1h 30m, 2 hours, 45 min
// ---------------------------------------------------------------------------------------------

const BEFORE_NUMBER = String.raw`(?<![\p{L}\p{N}.,])`;
const AFTER_UNIT = String.raw`(?![\p{L}\p{N}])`;

/** `intPart.fraction` of an hour (or minute) times `unitSeconds`, rounded half up to the second. */
function scaledSeconds(integer: string, fraction: string, unitSeconds: bigint): bigint {
  const denominator = 10n ** BigInt(fraction.length);
  const numerator = BigInt(integer + fraction) * unitSeconds;
  return (2n * numerator + denominator) / (2n * denominator);
}

function buildScanners(keywords: LocaleKeywords): Scanners {
  const joiners = alternatives(keywords.rangeJoiners);
  const prefixes = alternatives(keywords.rangePrefixes);
  const hours = alternatives(keywords.hourUnits);
  const minutes = alternatives(keywords.minuteUnits);
  return {
    range: new RegExp(
      String.raw`(?<![\p{L}\p{N}:.,/-])(?:(?:${prefixes})\s+)?${TIME}(?:\s*[-–—]\s*|\s+(?:${joiners})\s+)${TIME}(?![\p{L}\p{N}:]|[.,]\d)`,
      "giu",
    ),
    // hours and minutes: 1h30, 1h30m, 1h 30m, 1 hour 30 minutes
    hoursAndMinutes: new RegExp(
      String.raw`${BEFORE_NUMBER}(\d{1,3})\s?(?:${hours})(?:(\d{1,2})${AFTER_UNIT}|\s?(\d{1,2})\s?(?:${minutes})${AFTER_UNIT})`,
      "giu",
    ),
    // hours, possibly fractional: 2h, 1.5h, 1,5h, 2 hours
    hours: new RegExp(
      String.raw`${BEFORE_NUMBER}(\d{1,3})(?:[.,](\d{1,4}))?\s?(?:${hours})${AFTER_UNIT}`,
      "giu",
    ),
    // minutes: 90m, 45 min
    minutes: new RegExp(String.raw`${BEFORE_NUMBER}(\d{1,5})\s?(?:${minutes})${AFTER_UNIT}`, "giu"),
  };
}

/** Every duration in the text, in order of position (overlapping candidates are dropped). */
export function findDurations(text: string, keywords: LocaleKeywords): DurationMatch[] {
  const scanners = scannersFor(keywords);
  const found: DurationMatch[] = [];
  for (const match of text.matchAll(scanners.hoursAndMinutes)) {
    const minutePart = capture(match, 2) || capture(match, 3);
    found.push({
      ...toSpan(match),
      seconds: scaledSeconds(capture(match, 1), "", 3600n) + scaledSeconds(minutePart, "", 60n),
    });
  }
  for (const match of text.matchAll(scanners.hours)) {
    found.push({
      ...toSpan(match),
      seconds: scaledSeconds(capture(match, 1), capture(match, 2), 3600n),
    });
  }
  for (const match of text.matchAll(scanners.minutes)) {
    found.push({ ...toSpan(match), seconds: scaledSeconds(capture(match, 1), "", 60n) });
  }
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: DurationMatch[] = [];
  for (const candidate of found) {
    const last = kept.at(-1);
    if (last === undefined || candidate.start >= last.end) kept.push(candidate);
  }
  return kept;
}

// ---------------------------------------------------------------------------------------------
// Dates, @project, #tag and words
// ---------------------------------------------------------------------------------------------

const ISO_DATE = /(?<![\p{L}\p{N}-])(\d{4})-(\d{2})-(\d{2})(?![\p{L}\p{N}-])/gu;

/** Every `YYYY-MM-DD`-shaped token; whether it is a real date is the caller's business. */
export function findIsoDates(text: string): IsoDateMatch[] {
  return [...text.matchAll(ISO_DATE)].map((match) => ({
    ...toSpan(match),
    year: Number.parseInt(capture(match, 1), 10),
    month: Number.parseInt(capture(match, 2), 10),
    day: Number.parseInt(capture(match, 3), 10),
  }));
}

const MENTION =
  /(?<![\p{L}\p{N}])@(?:"([^"]+)"|“([^”]+)”|([\p{L}\p{N}][\p{L}\p{N}_-]*(?:\.[\p{L}\p{N}][\p{L}\p{N}_-]*)*))/gu;

/** Every `@project`, `@"Project name"` mention (an `@` inside a word, as in an e-mail, is not one). */
export function findMentions(text: string): MentionMatch[] {
  return [...text.matchAll(MENTION)].map((match) => ({
    ...toSpan(match),
    value: capture(match, 1) || capture(match, 2) || capture(match, 3),
  }));
}

const TAG = /(?<![\p{L}\p{N}&])#(\p{L}[\p{L}\p{N}_-]*)/gu;

/** Every `#tag`. A tag starts with a letter, so `#42` stays in the description. */
export function findTags(text: string): TagMatch[] {
  return [...text.matchAll(TAG)].map((match) => ({ ...toSpan(match), value: capture(match, 1) }));
}

const WORD = /(?<![\p{L}\p{N}])\p{L}+(?![\p{L}\p{N}])/gu;

/** Whole alphabetic words (a word glued to digits is not one). */
export function findWords(text: string): Span[] {
  return [...text.matchAll(WORD)].map((match) => toSpan(match));
}

/** Alphanumeric tokens with their offsets, for name matching. */
export function findTokens(text: string): Span[] {
  return [...text.matchAll(/[\p{L}\p{N}]+/gu)].map((match) => toSpan(match));
}
