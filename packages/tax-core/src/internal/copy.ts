import {
  decimal,
  decimalToString,
  money,
  price,
  type Decimal,
  type Money,
  type Price,
} from "@fairhour/money";
import type { MessageParam, MessageRef } from "../messages/types";
import { mapRecord } from "./records";

/*
 * Fresh, frozen copies of values that end up in a computation. The engine deep-freezes its
 * result, and freezing is a mutation: it must never freeze objects owned by the caller or the
 * pack. These copies also normalize key order (determinism).
 */

export function copyMoney(value: Money): Money {
  return money(value.amount, value.currency);
}

export function copyDecimal(value: Decimal): Decimal {
  return decimal(decimalToString(value));
}

export function copyPrice(value: Price): Price {
  return price(decimalToString(value.amount), value.currency);
}

function copyParam(param: MessageParam): MessageParam {
  switch (param.type) {
    case "money":
      return { type: "money", value: copyMoney(param.value) };
    case "price":
      return { type: "price", value: copyPrice(param.value) };
    case "decimal":
    case "percent":
      return { type: param.type, value: copyDecimal(param.value) };
    case "date":
      return { type: "date", value: param.value };
    case "text":
      return { type: "text", value: param.value };
    case "message":
      return { type: "message", value: copyMessage(param.value) };
  }
}

export function copyMessage(ref: MessageRef): MessageRef {
  return ref.params === undefined
    ? { key: ref.key }
    : { key: ref.key, params: mapRecord(ref.params, copyParam) };
}

export function copyStringRecord(
  record: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  return mapRecord(record, (value) => value);
}
