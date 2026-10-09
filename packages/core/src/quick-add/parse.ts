import { Temporal } from "temporal-polyfill";
import {
  NANOSECONDS_PER_SECOND,
  epochSeconds,
  instantFromEpochSeconds,
  zonedAt,
} from "../time/instant";
import { fold, foldName } from "./fold";
import { KEYWORDS, type LocaleKeywords } from "./locale";
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

function cleanDescription(pieces: readonly Span[]): string {
  return pieces
    .map((p) => p.text)
    .join(" ")
    .replace(/\s+/gu, " ")
    .replace(/^[\s,;:\-–—]+|[\s,;:\-–—]+$/gu, "");
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
    else candidates.push({ ...iso, date, source: "iso" });
  }
  return candidates;
}

function keywordDateCandidates(context: Context): DateCandidate[] {
  const { keywords, today } = context;
  const candidates: DateCandidate[] = [];
  for (const word of findWords(context.text)) {
    if (!context.claims.isFree(word)) continue;
    const folded = fold(word.text);
    const weekday = keywords.weekdays.find(([, names]) => names.includes(folded));
    if (keywords.today.includes(folded)) {
      candidates.push({ ...word, date: today, source: "keyword" });
    } else if (keywords.yesterday.includes(folded)) {
      candidates.push({ ...word, date: today.subtract({ days: 1 }), source: "keyword" });
    } else if (weekday !== undefined) {
      // The most recent such day, today included.
      const daysBack = (today.dayOfWeek - weekday[0] + 7) % 7;
      candidates.push({ ...word, date: today.subtract({ days: daysBack }), source: "weekday" });
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
  if (Temporal.PlainDate.compare(chosen.date, context.today) > 0) {
    warn(context, { code: "future-date", text: chosen.text });
  }
  return { date: chosen.date, source: chosen.source };
}

// ---------------------------------------------------------------------------------------------
// Time range and duration
// ---------------------------------------------------------------------------------------------

interface ValidRange {
  readonly match: RangeMatch;
  readonly from: ClockTime;
  readonly to: ClockTime;
}

/**
 * Claims every range; the first valid one is used, a second valid one is reported. Ranges are
 * looked for right after the ISO dates and never overlap one (their boundary rules keep them out
 * of a `YYYY-MM-DD`), so there is nothing to check against the claims yet.
 */
function pickRange(context: Context): { range?: ValidRange; extra?: RangeMatch } {
  let range: ValidRange | undefined;
  let extra: RangeMatch | undefined;
  for (const match of findRanges(context.text, context.keywords)) {
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

interface ResolvedRange {
  readonly startSeconds: bigint;
  readonly endSeconds: bigint;
  readonly match: RangeMatch;
}

/** Puts a range on a date; an end before the start means the next day. */
function resolveRange(
  context: Context,
  range: ValidRange,
  date: Temporal.PlainDate,
): ResolvedRange | undefined {
  const { timeZone } = context.options;
  const startSeconds = secondsOf(date, range.from, timeZone, 0);
  let endSeconds = secondsOf(date, range.to, timeZone, 0);
  if (endSeconds < startSeconds) {
    endSeconds = secondsOf(date, range.to, timeZone, 1);
    warn(context, { code: "range-crosses-midnight", text: range.match.text });
  }
  if (endSeconds === startSeconds) {
    fail(context, { code: "empty-range", text: range.match.text });
    return undefined;
  }
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

/**
 * Looks for the best project or client name among the words nothing else has claimed: every run
 * of up to four adjacent words is tried; the best match wins, then the longest, then the first.
 */
function freeTextProject(context: Context, projects: readonly ProjectCandidate[]): ProjectResult {
  let best: { span: Span; resolution: ProjectResolution; words: number } | undefined;
  for (const segment of context.claims.segments(context.text)) {
    const tokens = findTokens(segment.text).map((token) => ({
      start: segment.start + token.start,
      end: segment.start + token.end,
      folded: foldName(token.text),
    }));
    for (const [from, head] of tokens.entries()) {
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
          best = { span: piece(context.text, head.start, last.end), resolution, words };
        }
      }
    }
  }
  if (best === undefined) return {};
  if (best.resolution.type === "matched") context.claims.add(best.span);
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
 * - time ranges `9-10:15`, `9:00-10:15`, `9am-5pm`, `from 9 to 10` / `dalle 9 alle 10:15`; a
 *   range that ends before it starts crosses midnight (`22-1` is three hours, with a warning);
 * - `@project` or `@"Project name"` (matched against project and client names, exact, then
 *   prefix, then substring, ignoring case and diacritics);
 * - `#tag` (matched against `tags`; unknown tags are kept as new ones);
 * - durations `2h`, `1.5h`, `1,5h`, `90m`, `1h30`, `1h30m`, `1h 30m`, `2 hours`, `45 min`, in whole
 *   seconds (a fraction is rounded half up to the second);
 * - `today`/`yesterday` (`oggi`/`ieri`) and weekday names, short or long: the most recent such day,
 *   today included. Keywords are those of `options.locale` only;
 * - without an `@project`, loose words that equal a project or client name or start it with whole
 *   words (`Acme` finds client `Acme S.r.l.`); the project name wins over the client name.
 *
 * When both a range and a duration are given, the range wins. Problems do not throw: they are
 * listed in `issues`, and `confidence` summarises them. The function throws only for unusable
 * options (`now` not an instant, `timeZone` not an IANA zone).
 * @throws InvalidInstantError, InvalidTimeZoneError
 */
export function parseQuickAdd(text: string, options: QuickAddOptions): QuickAddDraft {
  const context: Context = {
    text,
    options,
    keywords: KEYWORDS[options.locale],
    today: zonedAt(epochSeconds(options.now), options.timeZone).toPlainDate(),
    claims: new Claims(),
    issues: [],
  };
  const projects = prepareProjects(options.projects);

  const isoDates = isoDateCandidates(context);
  const { range, extra: extraRange } = pickRange(context);
  const mentioned = mentionedProject(context, projects);
  const tags = collectTags(context);
  const durations = findDurations(text, context.keywords).filter((match) =>
    context.claims.isFree(match),
  );
  const duration: DurationMatch | undefined = durations[0];
  if (duration !== undefined) context.claims.add(duration);
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
    duration !== undefined ||
    range !== undefined ||
    context.issues.some((issue) => issue.code === "invalid-time");
  if (!hasTimeInput) fail(context, { code: "missing-duration" });

  const hasError = context.issues.some((issue) => issue.severity === "error");
  const fuzzy = projectMatch?.kind === "substring";
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
