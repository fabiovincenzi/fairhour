import type { Decimal, Money, Price } from "@fairhour/money";
import type { IsoDate, LocaleTag } from "../primitives";

/** Dotted key: "core.subtotal", "it.ordinario.vat.trace". */
export type MessageKey = string;

export type MessageParam =
  | { readonly type: "money"; readonly value: Money }
  | { readonly type: "price"; readonly value: Price }
  | { readonly type: "decimal"; readonly value: Decimal }
  | { readonly type: "percent"; readonly value: Decimal } // percent units: 22 -> "22%"
  | { readonly type: "date"; readonly value: IsoDate }
  | { readonly type: "text"; readonly value: string } // verbatim, never translated
  | { readonly type: "message"; readonly value: MessageRef }; // nested, translated

export type MessageParamType = MessageParam["type"];

export interface MessageRef {
  readonly key: MessageKey;
  readonly params?: Readonly<Record<string, MessageParam>>;
}

export type MessageCatalog = Readonly<Record<MessageKey, string>>;
/** "en" is mandatory; other keys are locale tags ("it"). */
export type MessageCatalogs = Readonly<{ en: MessageCatalog }> &
  Readonly<Record<LocaleTag, MessageCatalog>>;
