import {
  InvalidAmountError,
  MAX_DECIMAL_DIGITS,
  MAX_DECIMAL_SCALE,
  decimalToString,
  isDecimal,
  isDecimalString,
  isMoney,
  isPrice,
  moneyToJson,
  priceToJson,
  type Decimal,
} from "@fairhour/money";
import { isPlainObject, setOwn } from "./records";
import type { JsonValue } from "../primitives";

/** A deep copy of plain JSON data (fresh arrays and objects, same key order). */
export function cloneJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map((item: JsonValue) => cloneJson(item));
  if (typeof value === "object" && value !== null) {
    const result: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value)) setOwn(result, key, cloneJson(item));
    return result;
  }
  return value;
}

/**
 * The decimal string of `value`, or an `out-of-range` error when `decimal()` could not read it
 * back (more than MAX_DECIMAL_DIGITS digits, which only arithmetic can produce). The same rule as
 * money's `moneyToJson`/`priceToJson`: every value an encoder writes decodes back.
 * @throws InvalidAmountError reason "out-of-range"
 */
function encodeDecimal(value: Decimal): string {
  const text = decimalToString(value);
  if (!isDecimalString(text)) {
    throw new InvalidAmountError(
      "out-of-range",
      `Value out of range for a decimal string: at most ${MAX_DECIMAL_DIGITS} digits and ${MAX_DECIMAL_SCALE} decimals`,
    );
  }
  return text;
}

/**
 * Converts any parameter-like value to JSON: Money becomes MoneyJson, Price and Decimal become
 * decimal strings, bigint becomes a decimal string, undefined object properties are dropped and
 * key order is preserved. Every Money, Price and Decimal it writes can be read back.
 * @throws TypeError for values JSON cannot represent (functions, symbols, non-finite numbers,
 *         class instances such as Date or Map, a top-level undefined)
 * @throws InvalidAmountError (reason "out-of-range") for a Money, Price or Decimal with more than
 *         MAX_DECIMAL_DIGITS digits, which no decimal reader accepts
 */
export function toJsonValue(value: unknown): JsonValue {
  switch (typeof value) {
    case "string":
    case "boolean":
      return value;
    case "number":
      if (!Number.isFinite(value)) throw new TypeError("toJsonValue: non-finite number");
      return value;
    case "bigint":
      return value.toString();
    case "object": {
      if (value === null) return null;
      if (isMoney(value)) return { ...moneyToJson(value) };
      if (isPrice(value)) return priceToJson(value).amount;
      if (isDecimal(value)) return encodeDecimal(value);
      if (Array.isArray(value)) {
        return value.map((item: unknown) => (item === undefined ? null : toJsonValue(item)));
      }
      const proto: unknown = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) {
        throw new TypeError("toJsonValue: only plain objects and arrays can be converted");
      }
      const result: Record<string, JsonValue> = {};
      for (const [key, item] of Object.entries(value)) {
        if (item !== undefined) setOwn(result, key, toJsonValue(item));
      }
      return result;
    }
    case "undefined":
    case "function":
    case "symbol":
      throw new TypeError(`toJsonValue: a ${typeof value} cannot be represented in JSON`);
  }
}

/** Where a JSON-like value breaks a size limit (see {@link jsonLimitProblem}). */
export interface JsonLimitProblem {
  /** Path from the value's root to the container that broke the limit. */
  readonly path: readonly (string | number)[];
  readonly code: "too-deep" | "too-large";
  readonly message: string;
}

export interface JsonLimits {
  /** Containers may nest this deep; the value itself is level 1. */
  readonly maxDepth: number;
  /** Object properties and array items, all levels together (no limit when absent). */
  readonly maxEntries?: number;
}

/** The entries of an array or a plain object; undefined for anything else (a leaf). */
function childrenOf(value: unknown): readonly (readonly [string | number, unknown])[] | undefined {
  if (Array.isArray(value)) return value.map((item: unknown, index) => [index, item] as const);
  if (isPlainObject(value)) return Object.entries(value);
  return undefined;
}

/**
 * Checks the depth and the size of a JSON-like value with an explicit stack, without recursion,
 * so that zod (whose schemas for recursive data recurse) only ever sees bounded values: a
 * 20,000-level document is an issue, not a stack overflow. Arrays and plain objects are
 * containers; everything else is a leaf whose type the schema checks afterwards. A cyclic value
 * nests forever, so it is reported as too deep. Returns the first problem found, or undefined.
 */
export function jsonLimitProblem(value: unknown, limits: JsonLimits): JsonLimitProblem | undefined {
  const stack: { readonly value: unknown; readonly depth: number; readonly path: JsonPath }[] = [
    { value, depth: 1, path: [] },
  ];
  let entries = 0;
  for (let item = stack.pop(); item !== undefined; item = stack.pop()) {
    const children = childrenOf(item.value);
    if (children === undefined) continue;
    if (item.depth > limits.maxDepth) {
      return {
        path: item.path,
        code: "too-deep",
        message: `Nested deeper than ${limits.maxDepth} levels`,
      };
    }
    entries += children.length;
    if (limits.maxEntries !== undefined && entries > limits.maxEntries) {
      return {
        path: item.path,
        code: "too-large",
        message: `More than ${limits.maxEntries} properties and array items in total`,
      };
    }
    for (const [key, child] of children) {
      stack.push({ value: child, depth: item.depth + 1, path: [...item.path, key] });
    }
  }
  return undefined;
}

type JsonPath = readonly (string | number)[];
