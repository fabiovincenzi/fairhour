/**
 * Freezes `value` and everything reachable from it (own enumerable properties and array items),
 * then returns it. Only call it on values the caller owns: freezing is a mutation.
 */
export function deepFreeze<T>(value: T): T {
  const seen = new WeakSet<object>();
  const visit = (item: unknown): void => {
    if (typeof item !== "object" || item === null || seen.has(item)) return;
    seen.add(item);
    for (const child of Object.values(item)) visit(child);
    Object.freeze(item);
  };
  visit(value);
  return value;
}

/** True when `value` and everything reachable from it is frozen (primitives count as frozen). */
export function isDeeplyFrozen(value: unknown): boolean {
  const seen = new WeakSet<object>();
  const visit = (item: unknown): boolean => {
    if (typeof item !== "object" || item === null || seen.has(item)) return true;
    seen.add(item);
    if (!Object.isFrozen(item)) return false;
    return Object.values(item).every((child) => visit(child));
  };
  return visit(value);
}
