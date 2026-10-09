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
  | "invalid-time"
  | "empty-range"
  | "range-crosses-midnight"
  | "invalid-date"
  | "multiple-dates"
  | "future-date"
  | "project-not-found"
  | "ambiguous-project";

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
  /** How the typed text matched: the whole name, the start of it, or somewhere inside (only `@`). */
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
  /** `low`: an error issue. `medium`: a warning, or a project found only inside a name (substring). `high`: neither. */
  readonly confidence: "high" | "medium" | "low";
}
