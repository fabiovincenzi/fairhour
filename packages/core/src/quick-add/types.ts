import type { LocalDate } from "../time/instant";

export type QuickAddLocale = "en" | "it";

export interface QuickAddProject {
  readonly id: string;
  readonly name: string;
  readonly clientName: string;
}

export interface QuickAddOptions {
  /** The current instant (ISO 8601 with `Z` or an offset). Injected: the parser never reads the clock. */
  readonly now: string;
  /** IANA zone of the user: "today", weekdays and times of day are read in it. */
  readonly timeZone: string;
  /** Keyword language: `today`/`yesterday`/weekday names, duration unit words. */
  readonly locale: QuickAddLocale;
  readonly projects: readonly QuickAddProject[];
  /** Existing tags; a typed `#tag` is matched against them, otherwise it is kept as a new tag. */
  readonly tags: readonly string[];
}

export type QuickAddIssueCode =
  | "missing-duration"
  | "zero-duration"
  | "duration-over-24h"
  | "conflicting-duration"
  | "multiple-durations"
  /** Minutes after the hours above 59 (`1h75`). */
  | "invalid-duration"
  /** Two numbers and a unit (`10-15 min`, `1-2 hours`): a span, not one duration or a time range. */
  | "ambiguous-duration"
  | "invalid-time"
  | "empty-range"
  | "range-crosses-midnight"
  /** A range of two bare numbers (`9-10`), read as times of day. */
  | "assumed-time-range"
  /** A 12-hour range with no am/pm whose end is before its start (`9-5`): the end is pm. */
  | "assumed-pm"
  | "invalid-date"
  | "multiple-dates"
  | "future-date"
  /** A short weekday with no period (`sat`, `mar`) was taken as a date: it may be a word. */
  | "ambiguous-weekday"
  | "project-not-found"
  | "ambiguous-project"
  /** The input was longer than `QUICK_ADD_MAX_INPUT_LENGTH`: only the start was read. */
  | "input-too-long";

export interface QuickAddIssue {
  readonly code: QuickAddIssueCode;
  /** `error`: the draft cannot be saved as it is. `warning`: it can, but check it. */
  readonly severity: "error" | "warning";
  /** The fragment of the input the issue is about. */
  readonly text?: string;
  /** For `ambiguous-project`: the ids of the projects that matched equally well. */
  readonly candidates?: readonly string[];
}

export interface QuickAddProjectMatch {
  /**
   * How the typed text matched: the whole name, the start of it (whole leading words, in loose
   * words), or somewhere inside (only `@`). A leading article (`the`, `la`) is ignored.
   */
  readonly kind: "exact" | "prefix" | "substring";
  /** Matched on the project name or on its client's name. */
  readonly via: "project" | "client";
  /** Written as `@project`, or found in the free text. */
  readonly source: "mention" | "text";
}

export interface QuickAddDraft {
  /** Local calendar date of the entry (the default is today in `timeZone`). */
  readonly date: LocalDate;
  readonly dateSource: "default" | "keyword" | "weekday" | "iso";
  /** Whole seconds. From a range (`9-10:15`) or a duration (`1h30m`). */
  readonly durationSeconds?: bigint;
  /** UTC instants of a time range, on `date` in `timeZone`. Both present or both absent. */
  readonly start?: string;
  readonly end?: string;
  readonly projectId?: string;
  readonly projectMatch?: QuickAddProjectMatch;
  /** Tags without the `#`, canonical spelling when they match an existing tag; no duplicates. */
  readonly tags: readonly string[];
  /** What is left of the text once everything recognised has been taken out. */
  readonly description: string;
  readonly issues: readonly QuickAddIssue[];
  /**
   * `low`: an error issue. `medium`: a warning, or a project found only by part of its name (a
   * substring of it, or the start of it among loose words). `high`: neither.
   */
  readonly confidence: "high" | "medium" | "low";
}
