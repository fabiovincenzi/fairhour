import { EntryMergeError, EntrySplitError } from "../errors";
import { epochSeconds, resolveInterval } from "../time/instant";
import type { TimeEntry } from "./types";

/** Separator `mergeEntries` puts between two different descriptions. */
export const DESCRIPTION_SEPARATOR = " / ";

/**
 * Splits a stopped entry in two at the instant `at`.
 *
 * - The first part keeps the entry's `id` and `start` and ends at `at`; the second starts at `at`,
 *   keeps the entry's `end` and gets `newId` (ids are injected: the function is pure).
 * - Every other field (project, task, description, billable, tags and any extra field) is copied
 *   to both parts, so the two parts together carry exactly the original's metadata and time.
 * - `at` must lie strictly inside the entry (to the second): neither part may be empty.
 *
 * `mergeEntries(...splitEntry(entry, at, newId))` gives back `entry`.
 * @throws EntrySplitError, InvalidInstantError, InvalidIntervalError
 */
export function splitEntry<E extends TimeEntry>(
  entry: E,
  at: string,
  newId: string,
): readonly [first: E, second: E] {
  if (newId === entry.id) throw new EntrySplitError("same-id");
  const { startSeconds, endSeconds } = resolveInterval(entry, undefined);
  const atSeconds = epochSeconds(at);
  if (atSeconds <= startSeconds || atSeconds >= endSeconds) throw new EntrySplitError("outside");
  return [
    { ...entry, tags: [...entry.tags], end: at },
    { ...entry, tags: [...entry.tags], id: newId, start: at },
  ];
}

function unionTags(first: readonly string[], second: readonly string[]): string[] {
  return [...new Set([...first, ...second])];
}

function joinDescriptions(first: string, second: string): string {
  if (first === second || second === "") return first;
  if (first === "") return second;
  return `${first}${DESCRIPTION_SEPARATOR}${second}`;
}

/**
 * Merges two stopped entries that touch (`end == start`) or overlap into one.
 *
 * Metadata rules:
 *
 * - **Must match**: `projectId`, `taskId` (both absent counts as a match) and `billable`;
 *   otherwise `EntryMergeError` (`project-mismatch`, `task-mismatch`, `billable-mismatch`).
 *   Entries separated by a gap are refused too (`gap`): the gap would become tracked time.
 * - **Time**: the merged entry covers the union, from the earlier start to the later end.
 *   Touching entries lose no time (the durations add up); for overlapping entries the shared
 *   time is counted once.
 * - **`id` and any extra field** come from the entry that starts first (`a` when they start
 *   together).
 * - **`description`**: equal descriptions stay as they are; an empty one yields to the other;
 *   different ones are joined as `"first / second"` in time order.
 * - **`tags`**: the union, first entry's tags first, without duplicates.
 *
 * @throws EntryMergeError, InvalidInstantError, InvalidIntervalError
 */
export function mergeEntries<E extends TimeEntry>(a: E, b: E): E {
  if (a.projectId !== b.projectId) throw new EntryMergeError("project-mismatch");
  if (a.taskId !== b.taskId) throw new EntryMergeError("task-mismatch");
  if (a.billable !== b.billable) throw new EntryMergeError("billable-mismatch");

  const intervalA = resolveInterval(a, undefined);
  const intervalB = resolveInterval(b, undefined);
  const [first, second, firstInterval, secondInterval] =
    intervalB.startSeconds < intervalA.startSeconds
      ? ([b, a, intervalB, intervalA] as const)
      : ([a, b, intervalA, intervalB] as const);
  if (secondInterval.startSeconds > firstInterval.endSeconds) throw new EntryMergeError("gap");

  return {
    ...first,
    description: joinDescriptions(first.description, second.description),
    tags: unionTags(first.tags, second.tags),
    end: secondInterval.endSeconds > firstInterval.endSeconds ? second.end : first.end,
  };
}
