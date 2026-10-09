import { decimalToString, isDecimal, isMoney, isPrice, moneyToJson } from "@fairhour/money";
import { setOwn } from "./records";
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
 * Converts any parameter-like value to JSON: Money becomes MoneyJson, Price and Decimal become
 * decimal strings, bigint becomes a decimal string, undefined object properties are dropped and
 * key order is preserved.
 * @throws TypeError for values JSON cannot represent (functions, symbols, non-finite numbers,
 *         class instances such as Date or Map, a top-level undefined)
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
      if (isPrice(value)) return decimalToString(value.amount);
      if (isDecimal(value)) return decimalToString(value);
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
