/**
 * Freezes a plain data structure and everything it contains (the pack's metadata, parameters and
 * catalogs). Not used on the pack object itself: zod schemas keep lazy internal caches.
 */
export function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null) return value;
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}
