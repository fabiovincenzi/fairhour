import { Temporal } from "temporal-polyfill";
import {
  NANOSECONDS_PER_SECOND,
  epochSeconds,
  instantFromEpochSeconds,
  zonedAt,
} from "../time/instant";
import { cleanDescription } from "./description";
import { fold, foldName } from "./fold";
import { KEYWORDS, type LocaleKeywords, type WeekdayNames } from "./locale";
import {
  type ProjectCandidate,
  type ProjectResolution,
  prepareProjects,
  resolveProject,
  resolveTag,
} from "./match";
import {
  type ClockTime,
  type DurationMatch,
  type RangeMatch,
  type Span,
  findDurations,
  findIsoDates,
  findMentions,
  findRanges,
  findTags,
  findUnitPairs,
  findTokens,
  findWords,
} from "./scan";
import type {
  QuickAddDraft,
  QuickAddIssue,
  QuickAddOptions,
  QuickAddProject,
  QuickAddProjectMatch,
} from "./types";

/**
 * Longest input read, in UTF-16 code units. A time entry is a short sentence; the cap bounds the
 * work (and the description) whatever is pasted into the box.
 */
export const QUICK_ADD_MAX_INPUT_LENGTH = 1000;
const MAX_NGRAM_WORDS = 4;
/** Two tokens at most this far apart (a space, `&`, a comma...) can be words of one name. */
const MAX_TOKEN_GAP = 3;
const SECONDS_PER_DAY = 86_400n;

function piece(text: string, start: number, end: number): Span {
  return { start, end, text: text.slice(start, end) };
}

/** The pieces of the input that something recognised has taken. */
class Claims {
  readonly #spans: { start: number; end: number }[] = [];

  isFree(span: { start: number; end: number }): boolean {
    return this.#spans.every((taken) => span.end <= taken.start || taken.end <= span.start);
  }

  add(span: { start: number; end: number }): void {
    this.#spans.push({ start: span.start, end: span.end });
  }

  /** The text that nothing has claimed, in order, as `[start, end)` pieces. */
  segments(text: string): Span[] {
    const taken = [...this.#spans].sort((a, b) => a.start - b.start);
    const pieces: Span[] = [];
    let cursor = 0;
    for (const span of taken) {
      if (span.start > cursor) pieces.push(piece(text, cursor, span.start));
      cursor = Math.max(cursor, span.end);
    }
    if (cursor < text.length) pieces.push(piece(text, cursor, text.length));
    return pieces;
  }
}

/** The first `QUICK_ADD_MAX_INPUT_LENGTH` code units, without cutting a surrogate pair in two. */
function truncated(input: string): string {
  const cut = input.slice(0, QUICK_ADD_MAX_INPUT_LENGTH);
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}

interface Context {
  readonly text: string;
  readonly options: QuickAddOptions;
  readonly keywords: LocaleKeywords;
  readonly today: Temporal.PlainDate;
  readonly claims: Claims;
  readonly issues: QuickAddIssue[];
}

function warn(context: Context, issue: Omit<QuickAddIssue, "severity">): void {
  context.issues.push({ ...issue, severity: "warning" });
}

function fail(context: Context, issue: Omit<QuickAddIssue, "severity">): void {
  context.issues.push({ ...issue, severity: "error" });
}

// ---------------------------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------------------------

interface DateCandidate extends Span {
  readonly date: Temporal.PlainDate;
  readonly source: QuickAddDraft["dateSource"];
  /** A short weekday name with no period after it (`sat`, `mar`): also an ordinary word. */
  readonly unmarked: boolean;
}

function validIsoDate(year: number, month: number, day: number): Temporal.PlainDate | undefined {
  try {
    return Temporal.PlainDate.from({ year, month, day }, { overflow: "reject" });
  } catch {
    return undefined;
  }
}

/** ISO dates are claimed first, so that their digits are never read as a range or a duration. */
function isoDateCandidates(context: Context): DateCandidate[] {
  const candidates: DateCandidate[] = [];
  for (const iso of findIsoDates(context.text)) {
    context.claims.add(iso);
    const date = validIsoDate(iso.year, iso.month, iso.day);
    if (date === undefined) fail(context, { code: "invalid-date", text: iso.text });
    else candidates.push({ ...iso, date, source: "iso", unmarked: false });
  }
  return candidates;
}

function findWeekday(keywords: LocaleKeywords, folded: string): WeekdayNames | undefined {
  return keywords.weekdays.find(
    (weekday) => weekday.full === folded || weekday.abbreviations.includes(folded),
  );
}

function keywordDateCandidates(context: Context): DateCandidate[] {
  const { keywords, today } = context;
  const candidates: DateCandidate[] = [];
  for (const word of findWords(context.text)) {
    if (!context.claims.isFree(word)) continue;
    const folded = fold(word.text);
    const weekday = findWeekday(keywords, folded);
    if (keywords.today.includes(folded)) {
      candidates.push({ ...word, date: today, source: "keyword", unmarked: false });
    } else if (keywords.yesterday.includes(folded)) {
      const date = today.subtract({ days: 1 });
      candidates.push({ ...word, date, source: "keyword", unmarked: false });
    } else if (weekday !== undefined) {
      // The most recent such day, today included.
      const daysBack = (today.dayOfWeek - weekday.day + 7) % 7;
      const date = today.subtract({ days: daysBack });
      if (folded === weekday.full) {
        candidates.push({ ...word, date, source: "weekday", unmarked: false });
      } else if (context.text.charAt(word.end) === ".") {
        // `sat.`: the period says it is an abbreviation, and takes it into the date. No scanner
        // claims a span that starts with a period, so it is free.
        const span = { start: word.start, end: word.end + 1, text: `${word.text}.` };
        candidates.push({ ...span, date, source: "weekday", unmarked: false });
      } else {
        candidates.push({ ...word, date, source: "weekday", unmarked: true });
      }
    }
  }
  return candidates;
}

interface ChosenDate {
  readonly date: Temporal.PlainDate;
  readonly source: QuickAddDraft["dateSource"];
}

/** The first date written wins; any other is reported and left in the description. */
function chooseDate(context: Context, iso: readonly DateCandidate[]): ChosenDate {
  const candidates = [...iso, ...keywordDateCandidates(context)].sort((a, b) => a.start - b.start);
  const chosen = candidates[0];
  if (chosen === undefined) return { date: context.today, source: "default" };
  context.claims.add(chosen);
  if (candidates.length > 1) warn(context, { code: "multiple-dates", text: chosen.text });
  if (chosen.unmarked) warn(context, { code: "ambiguous-weekday", text: chosen.text });
  if (Temporal.PlainDate.compare(chosen.date, context.today) > 0) {
    warn(context, { code: "future-date", text: chosen.text });
  }
  return { date: chosen.date, source: chosen.source };
}

// ---------------------------------------------------------------------------------------------
// Time range and duration
// ---------------------------------------------------------------------------------------------

/**
 * Two numbers and a unit (`10-15 min`, `1-2 hours`) say neither a range nor one duration. Their
 * boundary rules keep them out of a `YYYY-MM-DD`, so there is nothing to check against the claims.
 */
function claimUnitPairs(context: Context): void {
  for (const pair of findUnitPairs(context.text, context.keywords)) {
    context.claims.add(pair);
    fail(context, { code: "ambiguous-duration", text: pair.text });
  }
}

interface ValidRange {
  readonly match: RangeMatch;
  readonly from: ClockTime;
  readonly to: ClockTime;
}

/**
 * Claims every range; the first valid one is used, a second valid one is reported. A range made of
 * two bare numbers (`chapters 3-4`) is not one when an explicit duration is also given (`2h`): its
 * digits stay in the description.
 */
function pickRange(
  context: Context,
  hasDuration: boolean,
): { range?: ValidRange; extra?: RangeMatch } {
  let range: ValidRange | undefined;
  let extra: RangeMatch | undefined;
  for (const match of findRanges(context.text, context.keywords)) {
    if (!context.claims.isFree(match) || (match.bare && hasDuration)) continue;
    if (match.from === undefined || match.to === undefined) {
      context.claims.add(match);
      fail(context, { code: "invalid-time", text: match.text });
    } else if (range === undefined) {
      context.claims.add(match);
      range = { match, from: match.from, to: match.to };
    } else {
      extra ??= match;
    }
  }
  return { ...(range === undefined ? {} : { range }), ...(extra === undefined ? {} : { extra }) };
}

const MINUTES_PER_DAY = 24 * 60;

/** Minutes from the midnight that starts the range's day to a wall-clock time (`24:00` is 1440). */
function wallMinutes(time: ClockTime): number {
  return (time.nextDay ? MINUTES_PER_DAY : 0) + time.hour * 60 + time.minute;
}

function secondsOf(
  date: Temporal.PlainDate,
  time: ClockTime,
  timeZone: string,
  extraDays: number,
): bigint {
  const day = date.add({ days: time.nextDay ? extraDays + 1 : extraDays });
  const zoned = day.toZonedDateTime({
    timeZone,
    plainTime: new Temporal.PlainTime(time.hour, time.minute),
  });
  return zoned.epochNanoseconds / NANOSECONDS_PER_SECOND;
}

/** `9-5` and `12-1` on a 12-hour clock: the end is in the afternoon. */
function afternoonEnd(from: ClockTime, to: ClockTime): ClockTime | undefined {
  const twelveHour = (time: ClockTime): boolean =>
    !time.meridiem && !time.nextDay && time.hour >= 1 && time.hour <= 12;
  if (!twelveHour(from) || !twelveHour(to)) return undefined;
  const end = { ...to, hour: (to.hour % 12) + 12 };
  return wallMinutes(end) > wallMinutes(from) ? end : undefined;
}

interface ResolvedRange {
  readonly startSeconds: bigint;
  readonly endSeconds: bigint;
  readonly match: RangeMatch;
}

/**
 * Puts a range on a date. The wall-clock times decide where it ends, never the instants (a DST
 * gap can move an instant): an end before the start means the next day, with a warning, and an end
 * that equals the start, or that the instants put before it, is an empty range. Where people
 * write 12-hour times (`en`), an end before the start with no am/pm is the afternoon.
 */
function resolveRange(
  context: Context,
  range: ValidRange,
  date: Temporal.PlainDate,
): ResolvedRange | undefined {
  const { timeZone } = context.options;
  const { from } = range;
  let { to } = range;
  let assumedPm = false;
  if (context.keywords.twelveHourShorthand && wallMinutes(to) < wallMinutes(from)) {
    const afternoon = afternoonEnd(from, to);
    if (afternoon !== undefined) {
      to = afternoon;
      assumedPm = true;
    }
  }
  const crossesMidnight = wallMinutes(to) < wallMinutes(from);
  const startSeconds = secondsOf(date, from, timeZone, 0);
  const endSeconds = secondsOf(date, to, timeZone, crossesMidnight ? 1 : 0);
  if (endSeconds <= startSeconds) {
    fail(context, { code: "empty-range", text: range.match.text });
    return undefined;
  }
  if (range.match.bare) warn(context, { code: "assumed-time-range", text: range.match.text });
  if (assumedPm) warn(context, { code: "assumed-pm", text: range.match.text });
  if (crossesMidnight) warn(context, { code: "range-crosses-midnight", text: range.match.text });
  return { startSeconds, endSeconds, match: range.match };
}

// ---------------------------------------------------------------------------------------------
// Projects and tags
// ---------------------------------------------------------------------------------------------

interface ProjectResult {
  readonly project?: QuickAddProject;
  readonly match?: QuickAddProjectMatch;
}

function applyResolution(
  context: Context,
  resolution: ProjectResolution | undefined,
  text: string,
): ProjectResult {
  if (resolution === undefined) {
    warn(context, { code: "project-not-found", text });
    return {};
  }
  if (resolution.type === "ambiguous") {
    warn(context, {
      code: "ambiguous-project",
      text,
      candidates: resolution.candidates.map((candidate) => candidate.id),
    });
    return {};
  }
  return { project: resolution.project, match: resolution.match };
}

/** The first `@project` decides; a mention that matches nothing is consumed and reported. */
function mentionedProject(
  context: Context,
  projects: readonly ProjectCandidate[],
): { found: boolean; result: ProjectResult } {
  const mention = findMentions(context.text).find((match) => context.claims.isFree(match));
  if (mention === undefined) return { found: false, result: {} };
  context.claims.add(mention);
  const resolution = resolveProject(foldName(mention.value), projects, "mention");
  return { found: true, result: applyResolution(context, resolution, mention.text) };
}

interface Token {
  readonly start: number;
  readonly end: number;
  readonly folded: string;
}

interface FreeTextBest {
  readonly span: Span;
  readonly resolution: ProjectResolution;
  readonly words: number;
  /** The word right before the run, when it is in the same piece of text. */
  readonly before: Token | undefined;
}

/**
 * The span of a matched name, with the article typed right before it when the name starts with
 * that article (`the` in `the company` for `The Company`: it belongs to the name, not to the
 * description).
 */
function matchedSpan(
  context: Context,
  best: FreeTextBest,
  project: QuickAddProject,
  via: QuickAddProjectMatch["via"],
): Span {
  const { before, span } = best;
  const name = foldName(via === "client" ? project.clientName : project.name);
  const owns =
    before !== undefined &&
    context.keywords.articles.includes(before.folded) &&
    span.start - before.end <= MAX_TOKEN_GAP &&
    name.startsWith(`${before.folded} `);
  return owns ? piece(context.text, before.start, span.end) : span;
}

/**
 * Looks for the best project or client name among the words nothing else has claimed: every run
 * of up to four adjacent words is tried, except those that start with a stopword (`the`, `with`,
 * `la`); the best match wins, then the longest, then the first.
 */
function freeTextProject(context: Context, projects: readonly ProjectCandidate[]): ProjectResult {
  const stopwords = new Set(context.keywords.stopwords);
  let best: FreeTextBest | undefined;
  for (const segment of context.claims.segments(context.text)) {
    const tokens: Token[] = findTokens(segment.text).map((token) => ({
      start: segment.start + token.start,
      end: segment.start + token.end,
      folded: foldName(token.text),
    }));
    for (const [from, head] of tokens.entries()) {
      if (stopwords.has(head.folded)) continue;
      const window = tokens.slice(from, from + MAX_NGRAM_WORDS);
      let previous = head;
      for (const [index, last] of window.entries()) {
        if (last.start - previous.end > MAX_TOKEN_GAP) break;
        previous = last;
        const words = index + 1;
        const query = window
          .slice(0, words)
          .map((token) => token.folded)
          .join(" ");
        const resolution = resolveProject(query, projects, "text");
        if (resolution === undefined) continue;
        const better =
          best === undefined ||
          resolution.rank > best.resolution.rank ||
          (resolution.rank === best.resolution.rank && words > best.words);
        if (better) {
          best = {
            span: piece(context.text, head.start, last.end),
            resolution,
            words,
            before: tokens[from - 1],
          };
        }
      }
    }
  }
  if (best === undefined) return {};
  if (best.resolution.type === "matched") {
    context.claims.add(
      matchedSpan(context, best, best.resolution.project, best.resolution.match.via),
    );
  }
  return applyResolution(context, best.resolution, best.span.text);
}

function collectTags(context: Context): string[] {
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const tag of findTags(context.text)) {
    if (!context.claims.isFree(tag)) continue;
    context.claims.add(tag);
    const resolved = resolveTag(tag.value, context.options.tags);
    const key = foldName(resolved);
    if (!seen.has(key)) {
      seen.add(key);
      tags.push(resolved);
    }
  }
  return tags;
}

// ---------------------------------------------------------------------------------------------
// The parser
// ---------------------------------------------------------------------------------------------

/**
 * Parses a quick-add sentence into a draft time entry (CORE-008). Pure: the clock is `now`.
 *
 * What it recognises, in this order (each piece is removed from the text; what is left is the
 * description):
 *
 * - `YYYY-MM-DD` dates;
 * - two numbers and a unit (`10-15 min`, `1-2 hours`, `da 2 a 3 ore`): neither a range nor one
 *   duration, reported as `ambiguous-duration`;
 * - `@project` or `@"Project name"` (matched against project and client names, exact, then
 *   prefix, then substring, ignoring case and diacritics, and a leading article: `@company` finds
 *   `The Company`);
 * - `#tag` (matched against `tags`; unknown tags are kept as new ones);
 * - durations `2h`, `1.5h`, `1,5h`, `90m`, `1h30`, `1h30m`, `1h 30m`, `2 hours`, `45 min`, in whole
 *   seconds (a fraction is rounded half up to the second; minutes above 59 after the hours, as in
 *   `1h75`, are an `invalid-duration`);
 * - time ranges `9-10:15`, `9:00-10:15`, `9am-5pm`, `from 9 to 10` / `dalle 9 alle 10:15` (`to`,
 *   `alle` and the like join the ends only after `from`, `dalle` and the like). A range that ends
 *   before it starts crosses midnight (`22-1` is three hours, with a warning); in `en`, with no
 *   am/pm and both ends up to 12, it ends in the afternoon instead (`9-5` is 09:00-17:00, `12-1`
 *   is 12:00-13:00, with an `assumed-pm` warning). A range of two bare numbers (`3-4`) is read as
 *   one with an `assumed-time-range` warning, unless an explicit duration is given: then the
 *   duration is used and the digits stay in the description (`review chapters 3-4 2h`). A pair
 *   before a unit (`10-15 min`) or a noun that counts things (`3-4 people`) is not a range;
 * - `today`/`yesterday` (`oggi`/`ieri`) and weekday names: the most recent such day, today
 *   included. Keywords are those of `options.locale` only. A short weekday (`sat`, `mar`) is also
 *   an everyday word: with a period (`sat.`) it is a date, without one it still is, with an
 *   `ambiguous-weekday` warning;
 * - without an `@project`, loose words that equal a project or client name or start it with whole
 *   words (`Acme` finds client `Acme S.r.l.`); the project name wins over the client name. A run
 *   of words never starts with an article, a preposition or a conjunction (`fix the bug` does not
 *   find `The Company`), a single word needs three letters to match the start of a name, and a
 *   start-of-name match has `medium` confidence.
 *
 * When both a range and a duration are given, the range wins (a bare range, see above, excepted).
 * Problems do not throw: they are listed in `issues`, and `confidence` summarises them.
 *
 * Only the first `QUICK_ADD_MAX_INPUT_LENGTH` (1000) characters are read: a longer input is cut
 * there (the description is the cut text) and reported as `input-too-long`, an error, because
 * whatever was dropped may have held the duration.
 *
 * The function throws only for unusable options (`now` not an instant, `timeZone` not an IANA
 * zone).
 * @throws InvalidInstantError, InvalidTimeZoneError
 */
export function parseQuickAdd(input: string, options: QuickAddOptions): QuickAddDraft {
  const tooLong = input.length > QUICK_ADD_MAX_INPUT_LENGTH;
  const text = tooLong ? truncated(input) : input;
  const keywords = KEYWORDS[options.locale];
  const context: Context = {
    text,
    options,
    keywords,
    today: zonedAt(epochSeconds(options.now), options.timeZone).toPlainDate(),
    claims: new Claims(),
    issues: [],
  };
  const projects = prepareProjects(options.projects, keywords.articles);
  if (tooLong) fail(context, { code: "input-too-long" });

  const isoDates = isoDateCandidates(context);
  claimUnitPairs(context);
  const mentioned = mentionedProject(context, projects);
  const tags = collectTags(context);
  const durations = findDurations(text, keywords).filter((match) => context.claims.isFree(match));
  const found: DurationMatch | undefined = durations[0];
  if (found !== undefined) context.claims.add(found);
  const duration = found?.invalid === true ? undefined : found;
  if (found?.invalid === true) fail(context, { code: "invalid-duration", text: found.text });
  const { range, extra: extraRange } = pickRange(context, found !== undefined);
  const { date, source: dateSource } = chooseDate(context, isoDates);
  const resolved = range === undefined ? undefined : resolveRange(context, range, date);
  const { project, match: projectMatch } = mentioned.found
    ? mentioned.result
    : freeTextProject(context, projects);

  let measured: { seconds: bigint; source: Span } | undefined;
  if (resolved !== undefined) {
    measured = { seconds: resolved.endSeconds - resolved.startSeconds, source: resolved.match };
    if (duration !== undefined && duration.seconds !== measured.seconds) {
      warn(context, { code: "conflicting-duration", text: duration.text });
    }
  } else if (duration?.seconds === 0n) {
    fail(context, { code: "zero-duration", text: duration.text });
  } else if (duration !== undefined) {
    measured = { seconds: duration.seconds, source: duration };
  }
  const extraText = durations[1]?.text ?? extraRange?.text;
  if (extraText !== undefined) warn(context, { code: "multiple-durations", text: extraText });
  if (measured !== undefined && measured.seconds > SECONDS_PER_DAY) {
    warn(context, { code: "duration-over-24h", text: measured.source.text });
  }
  const hasTimeInput =
    found !== undefined ||
    range !== undefined ||
    context.issues.some((issue) => ["invalid-time", "ambiguous-duration"].includes(issue.code));
  if (!hasTimeInput) fail(context, { code: "missing-duration" });

  const hasError = context.issues.some((issue) => issue.severity === "error");
  const fuzzy =
    projectMatch?.kind === "substring" ||
    (projectMatch?.source === "text" && projectMatch.kind === "prefix");
  const confidence = hasError ? "low" : context.issues.length > 0 || fuzzy ? "medium" : "high";

  return {
    date: date.toString(),
    dateSource,
    ...(measured === undefined ? {} : { durationSeconds: measured.seconds }),
    ...(resolved === undefined
      ? {}
      : {
          start: instantFromEpochSeconds(resolved.startSeconds),
          end: instantFromEpochSeconds(resolved.endSeconds),
        }),
    ...(project === undefined ? {} : { projectId: project.id }),
    ...(projectMatch === undefined ? {} : { projectMatch }),
    tags,
    description: cleanDescription(context.claims.segments(text)),
    issues: context.issues,
    confidence,
  };
}
