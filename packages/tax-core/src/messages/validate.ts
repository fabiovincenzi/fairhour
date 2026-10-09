import { isDecimal, isMoney, isPrice, type CurrencyCode } from "@fairhour/money";
import { isPlainObject } from "../internal/records";
import { isIsoDate } from "../primitives";
import { MAX_MESSAGE_DEPTH } from "./format";

/**
 * Why `value` is not a well-formed MessageRef, or undefined when it is. With `currency`, every
 * money and price parameter must be in that currency and money must not be negative (design G8,
 * G9: a computation carries one currency and non-negative amounts, message parameters included).
 */
export function messageRefProblem(
  value: unknown,
  currency?: CurrencyCode,
  depth = 0,
): string | undefined {
  if (depth > MAX_MESSAGE_DEPTH) return `nested deeper than ${MAX_MESSAGE_DEPTH} levels`;
  if (!isPlainObject(value)) return "not a MessageRef object";
  if (typeof value.key !== "string" || value.key.length === 0) return "key is empty";
  if (value.params === undefined) return undefined;
  if (!isPlainObject(value.params)) return `"${value.key}": params is not an object`;
  for (const [name, param] of Object.entries(value.params)) {
    const problem = paramProblem(param, currency, depth);
    if (problem !== undefined) return `"${value.key}": parameter "${name}" ${problem}`;
  }
  return undefined;
}

function paramProblem(
  param: unknown,
  currency: CurrencyCode | undefined,
  depth: number,
): string | undefined {
  if (!isPlainObject(param)) return "is not a MessageParam";
  const { type, value } = param;
  switch (type) {
    case "money":
      if (!isMoney(value)) return "is not a Money";
      if (currency !== undefined && value.currency !== currency) return `is not in ${currency}`;
      if (currency !== undefined && value.amount < 0n) return "is negative";
      return undefined;
    case "price":
      if (!isPrice(value)) return "is not a Price";
      if (currency !== undefined && value.currency !== currency) return `is not in ${currency}`;
      return undefined;
    case "decimal":
    case "percent":
      return isDecimal(value) ? undefined : "is not a Decimal";
    case "date":
      return typeof value === "string" && isIsoDate(value) ? undefined : "is not an ISO date";
    case "text":
      return typeof value === "string" ? undefined : "is not a string";
    case "message": {
      const nested = messageRefProblem(value, currency, depth + 1);
      return nested === undefined ? undefined : `is an invalid message: ${nested}`;
    }
    default:
      return "has an unknown type";
  }
}
