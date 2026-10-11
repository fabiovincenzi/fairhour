/**
 * Freezes `value` and everything reachable from it (own enumerable properties and array items),
 * then returns it. The pack freezes its own data (metadata, parameters, sources, catalogs) so
 * that no caller can edit a released parameter version at run time. Only call it on values the
 * pack owns: freezing is a mutation.
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
