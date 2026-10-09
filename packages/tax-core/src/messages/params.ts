import type { Decimal, Money, Price } from "@fairhour/money";
import type { IsoDate } from "../primitives";
import type { MessageKey, MessageParam, MessageRef } from "./types";

/** Builders for typed message parameters: `message("x.vat", { rate: p.percent(rate) })`. */
export const p: {
  readonly money: (value: Money) => MessageParam;
  readonly price: (value: Price) => MessageParam;
  readonly decimal: (value: Decimal) => MessageParam;
  readonly percent: (value: Decimal) => MessageParam;
  readonly date: (value: IsoDate) => MessageParam;
  readonly text: (value: string) => MessageParam;
  readonly message: (value: MessageRef) => MessageParam;
} = Object.freeze({
  money: (value: Money): MessageParam => ({ type: "money", value }),
  price: (value: Price): MessageParam => ({ type: "price", value }),
  decimal: (value: Decimal): MessageParam => ({ type: "decimal", value }),
  percent: (value: Decimal): MessageParam => ({ type: "percent", value }),
  date: (value: IsoDate): MessageParam => ({ type: "date", value }),
  text: (value: string): MessageParam => ({ type: "text", value }),
  message: (value: MessageRef): MessageParam => ({ type: "message", value }),
});

/** A message reference; `params` is omitted from the result when not given. */
export function message(
  key: MessageKey,
  params?: Readonly<Record<string, MessageParam>>,
): MessageRef {
  return params === undefined ? { key } : { key, params };
}
