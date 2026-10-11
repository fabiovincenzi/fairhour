/**
 * Freezes a plain data structure and everything it contains: the pack's metadata, parameters,
 * sources and catalogs. Not used on the pack object itself, because zod schemas keep lazy internal
 * caches. The conformance suite checks that parameter values are deeply frozen.
 */
export function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null) return value;
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}
