import type { QuickAddLocale } from "./types";

/** A weekday and the words that name it. */
export interface WeekdayNames {
  /** ISO weekday number: 1 = Monday ... 7 = Sunday. */
  readonly day: number;
  /** The whole name (folded). Always accepted. */
  readonly full: string;
  /**
   * Short forms (folded). They are everyday words too (`sat`, `sun`, `wed`, `mar`), so they only
   * set the date silently when they carry a trailing period (`sat.`); otherwise the parser
   * accepts them with an `ambiguous-weekday` warning.
   */
  readonly abbreviations: readonly string[];
}

export interface LocaleKeywords {
  /** Unit words after a number of hours (folded, longest alternatives first when used in a regex). */
  readonly hourUnits: readonly string[];
  readonly minuteUnits: readonly string[];
  /**
   * Words that join the two ends of a time range (`from 9 to 10`, `dalle 9 alle 10`). A joiner
   * counts only after one of `rangePrefixes`: `assigned 3 to 4 people` is not a time range.
   */
  readonly rangeJoiners: readonly string[];
  readonly rangePrefixes: readonly string[];
  /**
   * Nouns that count things, not time: a number pair before one of them (`3-4 people`,
   * `da 3 a 4 persone`) is not a time range. Folded, ASCII.
   */
  readonly nonTimeNouns: readonly string[];
  /**
   * 12-hour shorthand: with no am/pm, an end that is earlier than the start and where both are at
   * most 12 means the afternoon (`9-5` is 09:00-17:00, `12-1` is 12:00-13:00). Off where people
   * write 24-hour times (`22-1` is an overnight range).
   */
  readonly twelveHourShorthand: boolean;
  /**
   * Articles that can start a project or client name (`The Company`, `La Rinascente`): they are
   * dropped from the name before it is matched against loose words. Folded.
   */
  readonly articles: readonly string[];
  /**
   * Words that never start a project or client name in loose words (articles, prepositions and
   * conjunctions): `fix the bug` must not find `The Company`. Folded. Names that start with one
   * are still reachable through `@project`.
   */
  readonly stopwords: readonly string[];
  readonly today: readonly string[];
  readonly yesterday: readonly string[];
  readonly weekdays: readonly WeekdayNames[];
}

/** Keywords are folded (no diacritics, lower case). */
export const KEYWORDS: Readonly<Record<QuickAddLocale, LocaleKeywords>> = {
  en: {
    hourUnits: ["hours", "hour", "hrs", "hr", "h"],
    minuteUnits: ["minutes", "minute", "mins", "min", "m"],
    rangeJoiners: ["to"],
    rangePrefixes: ["from"],
    nonTimeNouns: [
      "people",
      "persons",
      "person",
      "attendees",
      "participants",
      "guests",
      "members",
      "users",
      "customers",
      "clients",
      "items",
      "tickets",
      "issues",
      "bugs",
      "pages",
      "slides",
      "chapters",
      "files",
    ],
    twelveHourShorthand: true,
    articles: ["the", "a", "an"],
    stopwords: ["the", "a", "an", "of", "for", "to", "in", "on", "with", "at", "by", "and", "or"],
    today: ["today"],
    yesterday: ["yesterday"],
    weekdays: [
      { day: 1, full: "monday", abbreviations: ["mon"] },
      { day: 2, full: "tuesday", abbreviations: ["tues", "tue"] },
      { day: 3, full: "wednesday", abbreviations: ["wed"] },
      { day: 4, full: "thursday", abbreviations: ["thurs", "thur", "thu"] },
      { day: 5, full: "friday", abbreviations: ["fri"] },
      { day: 6, full: "saturday", abbreviations: ["sat"] },
      { day: 7, full: "sunday", abbreviations: ["sun"] },
    ],
  },
  it: {
    hourUnits: ["ore", "ora", "h"],
    minuteUnits: ["minuti", "minuto", "min", "m"],
    rangeJoiners: ["fino alle", "alle", "a"],
    rangePrefixes: ["dalle", "dal", "da"],
    nonTimeNouns: [
      "persone",
      "persona",
      "partecipanti",
      "ospiti",
      "membri",
      "utenti",
      "clienti",
      "voci",
      "ticket",
      "pagine",
      "slide",
      "capitoli",
      "file",
    ],
    twelveHourShorthand: false,
    // `l` is the elided article of `L'Oreal` (folded names split at the apostrophe).
    articles: ["il", "lo", "la", "l", "i", "gli", "le", "un", "uno", "una"],
    stopwords: [
      "il",
      "lo",
      "la",
      "l",
      "i",
      "gli",
      "le",
      "un",
      "uno",
      "una",
      "di",
      "da",
      "del",
      "della",
      "dei",
      "delle",
      "per",
      "con",
      "su",
      "tra",
      "fra",
      "e",
      "o",
      "a",
      "al",
      "alla",
    ],
    today: ["oggi"],
    yesterday: ["ieri"],
    weekdays: [
      { day: 1, full: "lunedi", abbreviations: ["lun"] },
      { day: 2, full: "martedi", abbreviations: ["mar"] },
      { day: 3, full: "mercoledi", abbreviations: ["mer"] },
      { day: 4, full: "giovedi", abbreviations: ["gio"] },
      { day: 5, full: "venerdi", abbreviations: ["ven"] },
      { day: 6, full: "sabato", abbreviations: ["sab"] },
      { day: 7, full: "domenica", abbreviations: ["dom"] },
    ],
  },
};
