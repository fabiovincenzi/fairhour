export type CoreErrorCode =
  | "invalid-instant"
  | "invalid-interval"
  | "invalid-time-zone"
  | "invalid-duration"
  | "missing-clock"
  | "entry-split"
  | "entry-merge"
  | "rate-currency-mismatch"
  | "invalid-billing-mode"
  | "invalid-budget";

/**
 * Base class of every error thrown by `@fairhour/core`. Narrow on `code` (a stable string) rather
 * than on the message, which is meant for developers and never contains user content beyond the
 * offending value's shape.
 */
export abstract class CoreError extends Error {
  abstract readonly code: CoreErrorCode;

  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** The text is not an ISO 8601 instant with a `Z` or numeric UTC offset. */
export class InvalidInstantError extends CoreError {
  readonly code = "invalid-instant";

  constructor(value: string) {
    super(`Not an ISO 8601 instant with offset (length ${value.length})`);
  }
}

/** An entry ends before it starts. */
export class InvalidIntervalError extends CoreError {
  readonly code = "invalid-interval";

  constructor() {
    super("The end of a time entry is before its start");
  }
}

export class InvalidTimeZoneError extends CoreError {
  readonly code = "invalid-time-zone";
  readonly timeZone: string;

  constructor(timeZone: string) {
    super(`Unknown IANA time zone "${timeZone}"`);
    this.timeZone = timeZone;
  }
}

/** A duration in seconds is negative. */
export class InvalidDurationError extends CoreError {
  readonly code = "invalid-duration";

  constructor() {
    super("A duration in seconds cannot be negative");
  }
}

/** An entry is still running but no `now` was injected. */
export class MissingClockError extends CoreError {
  readonly code = "missing-clock";

  constructor() {
    super("A running entry needs an injected `now` to be measured");
  }
}

export type EntrySplitReason = "outside" | "same-id";

export class EntrySplitError extends CoreError {
  readonly code = "entry-split";
  readonly reason: EntrySplitReason;

  constructor(reason: EntrySplitReason) {
    super(
      reason === "outside"
        ? "The split instant must lie strictly between the start and the end of the entry"
        : "The second part of a split needs a new id",
    );
    this.reason = reason;
  }
}

export type EntryMergeReason = "project-mismatch" | "task-mismatch" | "billable-mismatch" | "gap";

export class EntryMergeError extends CoreError {
  readonly code = "entry-merge";
  readonly reason: EntryMergeReason;

  constructor(reason: EntryMergeReason) {
    super(`Entries cannot be merged: ${reason}`);
    this.reason = reason;
  }
}

export type InvalidBillingModeReason =
  "non-positive-hours-per-day" | "non-positive-half-day" | "half-day-exceeds-day";

export class InvalidBillingModeError extends CoreError {
  readonly code = "invalid-billing-mode";
  readonly reason: InvalidBillingModeReason;

  constructor(reason: InvalidBillingModeReason) {
    super(`Invalid day-rate billing mode: ${reason}`);
    this.reason = reason;
  }
}

export type InvalidBudgetReason = "non-positive-budget" | "negative-consumed" | "invalid-threshold";

export class InvalidBudgetError extends CoreError {
  readonly code = "invalid-budget";
  readonly reason: InvalidBudgetReason;

  constructor(reason: InvalidBudgetReason) {
    super(`Invalid budget: ${reason}`);
    this.reason = reason;
  }
}
