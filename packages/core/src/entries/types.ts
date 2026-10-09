/**
 * A stopped time entry as the split/merge helpers see it. `start` and `end` are ISO 8601 instants
 * (UTC, `Z` or a numeric offset). Extra fields on the object (timestamps, ownership, ...) are
 * preserved by `splitEntry` and taken from the earlier entry by `mergeEntries`.
 */
export interface TimeEntry {
  readonly id: string;
  readonly projectId: string;
  readonly taskId?: string;
  readonly description: string;
  readonly billable: boolean;
  readonly tags: readonly string[];
  readonly start: string;
  readonly end: string;
}
