import { type EntryTimes, compareBigint, parseNow, resolveInterval } from "../time/instant";

export interface OverlapPair<E extends EntryTimes> {
  /** The entry that starts first (ties: the one that comes first in the input). */
  readonly first: E;
  readonly second: E;
  /** Seconds the two entries have in common (always positive). */
  readonly overlapSeconds: bigint;
}

interface Item<E extends EntryTimes> {
  readonly entry: E;
  readonly index: number;
  readonly startSeconds: bigint;
  readonly endSeconds: bigint;
}

/** Min-heap on `endSeconds`: the active entry that finishes first is on top. */
class EndHeap<E extends EntryTimes> {
  readonly items: Item<E>[] = [];

  get top(): Item<E> | undefined {
    return this.items[0];
  }

  push(item: Item<E>): void {
    const items = this.items;
    let child = items.length;
    items.push(item);
    while (child > 0) {
      const parent = (child - 1) >> 1;
      const parentItem = items[parent];
      if (parentItem === undefined || parentItem.endSeconds <= item.endSeconds) break;
      items[child] = parentItem;
      child = parent;
    }
    items[child] = item;
  }

  pop(): void {
    const items = this.items;
    const last = items.pop();
    if (last === undefined || items.length === 0) return;
    let parent = 0;
    for (;;) {
      let child = parent * 2 + 1;
      if (child >= items.length) break;
      const right = items[child + 1];
      const left = items[child];
      if (right !== undefined && left !== undefined && right.endSeconds < left.endSeconds) child++;
      const childItem = items[child];
      if (childItem === undefined || childItem.endSeconds >= last.endSeconds) break;
      items[parent] = childItem;
      parent = child;
    }
    items[parent] = last;
  }
}

/**
 * Finds every pair of entries that share time in `O((n + k) log n)` for `n` entries and `k`
 * reported pairs: a sort, then a sweep that keeps a heap of the entries still running, so entries
 * that do not overlap anything cost `O(log n)` each (no pairwise comparison).
 *
 * Entries are half-open intervals `[start, end)`: an entry that ends exactly when another starts
 * (`end == start`) does **not** overlap it, and an entry of zero length overlaps nothing. A running
 * entry (`end: null`) lasts until the injected `now`.
 *
 * Pairs come back ordered by the start of their `second` entry, then by the start of `first`.
 * @throws InvalidInstantError, InvalidIntervalError, MissingClockError
 */
export function findOverlaps<E extends EntryTimes>(
  entries: readonly E[],
  options: { readonly now?: string } = {},
): OverlapPair<E>[] {
  const nowSeconds = parseNow(options.now);
  const items: Item<E>[] = [];
  entries.forEach((entry, index) => {
    const { startSeconds, endSeconds } = resolveInterval(entry, nowSeconds);
    if (endSeconds > startSeconds) items.push({ entry, index, startSeconds, endSeconds });
  });
  items.sort((a, b) => compareBigint(a.startSeconds, b.startSeconds) || a.index - b.index);

  const pairs: OverlapPair<E>[] = [];
  const active = new EndHeap<E>();
  for (const item of items) {
    for (let top = active.top; top !== undefined && top.endSeconds <= item.startSeconds;) {
      active.pop();
      top = active.top;
    }
    // Everything left in the heap started no later than `item` and ends after it starts.
    const live = [...active.items].sort(
      (a, b) => compareBigint(a.startSeconds, b.startSeconds) || a.index - b.index,
    );
    for (const other of live) {
      const sharedEnd = other.endSeconds < item.endSeconds ? other.endSeconds : item.endSeconds;
      pairs.push({
        first: other.entry,
        second: item.entry,
        overlapSeconds: sharedEnd - item.startSeconds,
      });
    }
    active.push(item);
  }
  return pairs;
}
