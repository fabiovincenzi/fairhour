import { isMoney, isPrice, type Money, type Price } from "@fairhour/money";
import type { InvoiceComputation } from "../computation/types";
import { isPlainObject } from "../internal/records";
import type { MessageRef } from "../messages/types";

/**
 * Structural equality for plain data: primitives (bigint included) by value, arrays item by
 * item, objects by own enumerable keys. Keys whose value is undefined count as absent.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item: unknown, index) => deepEqual(item, b[index]));
  }
  const keysOf = (value: object): string[] =>
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key]) => key)
      .sort();
  const keysA = keysOf(a);
  const keysB = keysOf(b);
  if (keysA.length !== keysB.length || keysA.some((key, index) => key !== keysB[index]))
    return false;
  const recordA = a as Readonly<Record<string, unknown>>;
  const recordB = b as Readonly<Record<string, unknown>>;
  return keysA.every((key) => deepEqual(recordA[key], recordB[key]));
}

/** JSON with object keys sorted (canonical text for comparisons); bigint as a decimal string. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value ?? null, (_key, item: unknown) => {
    if (typeof item === "bigint") return item.toString();
    if (!isPlainObject(item)) return item;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(item).sort()) {
      Object.defineProperty(sorted, key, { value: item[key], enumerable: true, writable: true });
    }
    return sorted;
  });
}

/** A deep copy of plain data (arrays and plain objects); other values are shared. */
export function structuralClone<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item: unknown) => structuralClone(item)) as T;
  if (isPlainObject(value)) {
    const copy: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      Object.defineProperty(copy, key, {
        value: structuralClone(item),
        enumerable: true,
        writable: true,
      });
    }
    return copy as T;
  }
  return value;
}

export interface FoundAmount {
  readonly path: string;
  readonly value: Money | Price;
}

/** Every Money and Price in a computation, message parameters included. */
export function amountsOf(c: InvoiceComputation): readonly FoundAmount[] {
  const found: FoundAmount[] = [];
  const visit = (value: unknown, path: string): void => {
    if (isMoney(value) || isPrice(value)) {
      found.push({ path, value });
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item: unknown, index) => {
        visit(item, `${path}[${index}]`);
      });
      return;
    }
    if (isPlainObject(value)) {
      for (const [key, item] of Object.entries(value))
        visit(item, path === "" ? key : `${path}.${key}`);
    }
  };
  visit(c, "");
  return found;
}

/** Every MessageRef of a computation, with where it is. */
export function messagesOf(
  c: InvoiceComputation,
): readonly { readonly path: string; readonly ref: MessageRef }[] {
  const refs: { path: string; ref: MessageRef }[] = [];
  c.components.forEach((component, index) =>
    refs.push({ path: `components[${index}].label`, ref: component.label }),
  );
  c.vatSummary.forEach((entry, index) => {
    refs.push({ path: `vatSummary[${index}].label`, ref: entry.label });
    if (entry.reference !== undefined)
      refs.push({ path: `vatSummary[${index}].reference`, ref: entry.reference });
  });
  c.legalNotes.forEach((note, index) =>
    refs.push({ path: `legalNotes[${index}]`, ref: note.message }),
  );
  c.warnings.forEach((warning, index) =>
    refs.push({ path: `warnings[${index}]`, ref: warning.message }),
  );
  c.trace.forEach((step, index) => {
    refs.push({ path: `trace[${index}].message`, ref: step.message });
    if (step.formula !== undefined)
      refs.push({ path: `trace[${index}].formula`, ref: step.formula });
  });
  return refs;
}

export function errorText(error: unknown): string {
  return error instanceof Error
    ? `${error.name}: ${error.message}`
    : `non-Error thrown: ${String(error)}`;
}
