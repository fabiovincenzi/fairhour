/**
 * Record helpers that are safe with any key, including "__proto__" and "constructor": lookups
 * only see own properties and writes define own properties instead of calling setters.
 */

export function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function hasOwn(record: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

/** The own value at `key`, or undefined. */
export function ownValue<T>(record: Readonly<Record<string, T>>, key: string): T | undefined {
  return hasOwn(record, key) ? record[key] : undefined;
}

/** Defines an own, enumerable, writable property (no prototype setter is ever triggered). */
export function setOwn<T>(record: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(record, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

/** A new record with the same keys, in the same order, and mapped values. */
export function mapRecord<T, U>(
  record: Readonly<Record<string, T>>,
  map: (value: T, key: string) => U,
): Record<string, U> {
  const result: Record<string, U> = {};
  for (const [key, value] of Object.entries(record)) setOwn(result, key, map(value, key));
  return result;
}

/** A record without a prototype: lookups of missing keys always give undefined. */
export function nullPrototypeRecord<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}

/**
 * A deep copy of arrays and plain objects (including plain value objects such as Decimal);
 * primitives and class instances are returned as they are.
 */
export function clonePlain<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item: unknown) => clonePlain(item)) as T;
  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) setOwn(result, key, clonePlain(item));
    return result as T;
  }
  return value;
}
