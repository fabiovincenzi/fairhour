import { decimal, money, price } from "@fairhour/money";
import { describe, expect, it } from "vitest";
import { MessageFormatError, MissingMessageError } from "../errors";
import { isoDate } from "../primitives";
import { coreMessages } from "./core-messages";
import {
  MAX_MESSAGE_DEPTH,
  formatMessage,
  localeFallbacks,
  parseMessage,
  resolveMessageText,
} from "./format";
import { mergeCatalogs } from "./merge";
import { message, p } from "./params";
import type { MessageCatalogs, MessageRef } from "./types";

/** ICU versions differ in the space they put between number and symbol. */
const normalize = (text: string): string => text.replace(/[\u00a0\u202f]/g, " ");

const catalogs: MessageCatalogs = {
  en: {
    "t.money": "Total {amount}",
    "t.price": "Rate {price}",
    "t.decimal": "{value} hours",
    "t.percent": "VAT {rate}",
    "t.date": "Issued on {date}",
    "t.text": "Note: {text}",
    "t.nested": "{inner} (see above)",
    "t.leaf": "leaf {text}",
    "t.recursive": "[{next}]",
    "t.plain": "No placeholders",
    "t.only-en": "English only",
    "t.repeat": "{a} and {a} and {b}",
    "t.bad": "Broken {",
  },
  it: {
    "t.money": "Totale {amount}",
    "t.price": "Tariffa {price}",
    "t.decimal": "{value} ore",
    "t.percent": "IVA {rate}",
    "t.date": "Emessa il {date}",
    "t.text": "Nota: {text}",
    "t.nested": "{inner} (vedi sopra)",
    "t.leaf": "foglia {text}",
    "t.recursive": "[{next}]",
    "t.plain": "Nessun segnaposto",
  },
};

describe("formatMessage", () => {
  const eur = money(123456n, "EUR");
  it.each([
    ["money", message("t.money", { amount: p.money(eur) }), "Total €1,234.56", "Totale 1234,56 €"],
    [
      "price",
      message("t.price", { price: p.price(price("0.4253", "EUR")) }),
      "Rate €0.4253",
      "Tariffa 0,4253 €",
    ],
    [
      "decimal",
      message("t.decimal", { value: p.decimal(decimal("1.50")) }),
      "1.50 hours",
      "1,50 ore",
    ],
    ["percent", message("t.percent", { rate: p.percent(decimal("22")) }), "VAT 22%", "IVA 22%"],
    [
      "date",
      message("t.date", { date: p.date(isoDate("2026-10-09")) }),
      "Issued on October 9, 2026",
      "Emessa il 9 ottobre 2026",
    ],
    [
      "text",
      message("t.text", { text: p.text("{not a placeholder}") }),
      "Note: {not a placeholder}",
      "Nota: {not a placeholder}",
    ],
    [
      "message",
      message("t.nested", { inner: p.message(message("t.leaf", { text: p.text("x") })) }),
      "leaf x (see above)",
      "foglia x (vedi sopra)",
    ],
    ["no parameters", message("t.plain"), "No placeholders", "Nessun segnaposto"],
  ])("formats a %s parameter in en and it", (_type, ref, en, it) => {
    expect(normalize(formatMessage(ref, catalogs, "en"))).toBe(en);
    expect(normalize(formatMessage(ref, catalogs, "it"))).toBe(it);
  });

  it("repeats a parameter and ignores unused ones", () => {
    const ref = message("t.repeat", { a: p.text("A"), b: p.text("B"), extra: p.text("E") });
    expect(formatMessage(ref, catalogs, "en")).toBe("A and A and B");
  });

  it("falls back from region to language to English", () => {
    const ref = message("t.money", { amount: p.money(money(500n, "EUR")) });
    expect(normalize(formatMessage(ref, catalogs, "it-CH"))).toMatch(/^Totale /);
    expect(normalize(formatMessage(ref, catalogs, "de"))).toMatch(/^Total /);
    expect(formatMessage(message("t.only-en"), catalogs, "it")).toBe("English only");
    expect(normalize(formatMessage(ref, catalogs, "IT"))).toMatch(/^Totale /);
  });

  it("formats parameters for the requested locale even when the text falls back", () => {
    const ref = message("t.money", { amount: p.money(eur) });
    expect(normalize(formatMessage(ref, catalogs, "de-DE"))).toBe("Total 1.234,56 €");
  });

  it("throws MissingMessageError for an unknown key", () => {
    expect(() => formatMessage(message("t.unknown"), catalogs, "it")).toThrow(MissingMessageError);
  });

  it("throws MessageFormatError for a missing or unknown parameter", () => {
    expect(() => formatMessage(message("t.money"), catalogs, "en")).toThrow(
      /missing parameter "amount"/,
    );
    expect(() => formatMessage(message("t.money", { other: p.text("x") }), catalogs, "en")).toThrow(
      MessageFormatError,
    );
    const bogus = {
      key: "t.text",
      params: { text: { type: "html", value: "<b>" } },
    } as unknown as MessageRef;
    expect(() => formatMessage(bogus, catalogs, "en")).toThrow(/unknown type/);
    const badDate = {
      key: "t.date",
      params: { date: { type: "date", value: "2023-02-30" } },
    } as unknown as MessageRef;
    expect(() => formatMessage(badDate, catalogs, "en")).toThrow(/not an ISO date/);
  });

  it("throws MessageFormatError for a malformed message", () => {
    expect(() => formatMessage(message("t.bad"), catalogs, "en")).toThrow(MessageFormatError);
  });

  it(`allows nesting up to ${MAX_MESSAGE_DEPTH} levels`, () => {
    const nest = (depth: number): MessageRef =>
      depth === 0
        ? message("t.leaf", { text: p.text("end") })
        : message("t.recursive", { next: p.message(nest(depth - 1)) });
    expect(formatMessage(nest(MAX_MESSAGE_DEPTH), catalogs, "en")).toBe("[[[[leaf end]]]]");
    expect(() => formatMessage(nest(MAX_MESSAGE_DEPTH + 1), catalogs, "en")).toThrow(
      /deeper than 4/,
    );
  });

  it("ignores inherited properties of catalogs and params", () => {
    expect(() => formatMessage(message("toString"), catalogs, "constructor")).toThrow(
      MissingMessageError,
    );
    const ref = message(
      "t.text",
      Object.create({ text: p.text("inherited") }) as Record<string, never>,
    );
    expect(() => formatMessage(ref, catalogs, "en")).toThrow(/missing parameter/);
  });
});

describe("parseMessage", () => {
  it.each([
    ["Plain text", []],
    ["{a}", ["a"]],
    ["{a} and {b_2} and {a}", ["a", "b_2"]],
    ["l'imposta di {amount}", ["amount"]],
    ["dell’{amount}", ["amount"]],
    ["50% of {base}", ["base"]],
    ["# {x}", ["x"]],
  ])("%s -> %j", (text, names) => {
    expect(parseMessage(text)).toEqual(names);
  });

  it.each([
    ["Unclosed {a", /unclosed "\{"/],
    ["Unmatched }", /unmatched "\}"/],
    ["Empty {}", /invalid placeholder/],
    ["Spaces { a }", /invalid placeholder/],
    ["Digits first {1a}", /invalid placeholder/],
    ["ICU argument {a, number}", /invalid placeholder/],
    ["Nested {a{b}}", /invalid placeholder/],
    ["dell'{amount}", /apostrophe/],
    ["quote '}", /unmatched|apostrophe/],
    ["doubled ''", /apostrophe/],
  ])("rejects %s", (text, reason) => {
    expect(() => parseMessage(text, "k")).toThrow(reason);
  });

  it("labels inline messages", () => {
    try {
      parseMessage("{");
      expect.unreachable();
    } catch (error) {
      expect((error as MessageFormatError).key).toBe("(inline)");
    }
  });
});

describe("locale resolution", () => {
  it.each([
    ["it-CH", ["it-CH", "it", "en"]],
    ["it", ["it", "en"]],
    ["en-GB", ["en-GB", "en"]],
    ["en", ["en"]],
    ["", ["en"]],
  ])("%s -> %j", (locale, expected) => {
    expect(localeFallbacks(locale)).toEqual(expected);
  });

  it("resolves texts and skips non-string entries", () => {
    const odd = { en: { k: "English" }, it: { k: 1 } } as unknown as MessageCatalogs;
    expect(resolveMessageText("k", odd, "it")).toBe("English");
  });
});

describe("core catalog", () => {
  it("has the same keys and placeholders in en and it", () => {
    const en = coreMessages.en;
    const it = coreMessages.it ?? {};
    expect(Object.keys(it).sort()).toEqual(Object.keys(en).sort());
    for (const [key, text] of Object.entries(en)) {
      expect(key.startsWith("core.")).toBe(true);
      expect([...parseMessage(it[key] ?? "")].sort()).toEqual([...parseMessage(text)].sort());
    }
  });
});

describe("mergeCatalogs", () => {
  it("merges per locale, later wins, and always has en", () => {
    expect(mergeCatalogs()).toEqual({ en: {} });
    const merged = mergeCatalogs(
      { en: { a: "A", b: "B" }, it: { a: "A-it" } },
      { en: { b: "B2", c: "C" }, fr: { a: "A-fr" } },
    );
    expect(merged).toEqual({
      en: { a: "A", b: "B2", c: "C" },
      it: { a: "A-it" },
      fr: { a: "A-fr" },
    });
    expect(Object.isFrozen(merged)).toBe(true);
    expect(Object.isFrozen(merged.en)).toBe(true);
  });

  it("does not modify its inputs", () => {
    const first = { en: { a: "A" } };
    mergeCatalogs(first, { en: { a: "Z" } });
    expect(first).toEqual({ en: { a: "A" } });
    expect(Object.isFrozen(first)).toBe(false);
  });
});
