/**
 * Table-driven tests of `xx.small-business`. TEMPLATE: test every wording a legal note can take
 * (statutory, custom), in the user's locale and in the document locale, and that the rule stays
 * silent where it does not apply.
 */
import { formatComputation } from "@fairhour/tax-core";
import { describe, expect, it } from "vitest";
import { amount, compute, format, line, traceKeys } from "../../test/helpers";
import type { XxConfigInput } from "../config";
import { xxPack } from "../index";
import { SMALL_BUSINESS_NOTE_ID, SMALL_BUSINESS_RULE_ID } from "./small-business";

const STATUTORY_EN =
  "VAT not charged: small-business exemption under article 30 of the Exampleland VAT Act.";
const STATUTORY_EO =
  "AVI ne fakturita: escepto por malgrandaj entreprenoj laŭ artikolo 30 de la AVI-leĝo de Ekzemplolando.";

describe("xx.small-business: the note on every exempt invoice", () => {
  it.each<[string, XxConfigInput, string, string]>([
    ["the statutory wording", { vatRegistered: false }, STATUTORY_EN, STATUTORY_EO],
    [
      "the user's wording, printed as written in every locale",
      { vatRegistered: false, smallBusinessNote: "Kleinunternehmer: keine AVI" },
      "Kleinunternehmer: keine AVI",
      "Kleinunternehmer: keine AVI",
    ],
    // User text is a `text` parameter, never message syntax: braces and apostrophes are literal.
    [
      "the user's wording with braces and apostrophes",
      { vatRegistered: false, smallBusinessNote: "No VAT {art. 30} '{x}'" },
      "No VAT {art. 30} '{x}'",
      "No VAT {art. 30} '{x}'",
    ],
  ])("%s", (_name, config, en, eo) => {
    const c = compute(config, [line("100.00")]);
    expect(c.legalNotes.map((note) => note.id)).toEqual([SMALL_BUSINESS_NOTE_ID]);
    const [note] = c.legalNotes;
    expect(note && format(note.message)).toBe(en);
    expect(note && format(note.message, "eo")).toBe(eo);
    expect(note?.sources.map((source) => source.id)).toEqual(["xx.vat-act.art-30"]);
    expect(amount(c.taxTotal)).toBe("0.00");
    expect(traceKeys(c, SMALL_BUSINESS_RULE_ID)).toEqual(["xx.trace.small-business"]);
  });

  it("prints the note in the document locale and shows it in the user's", () => {
    const c = compute({ vatRegistered: false }, [line("100.00")]);
    const formatted = formatComputation(c, xxPack, "en");
    expect(formatted.legalNotes).toEqual([{ id: SMALL_BUSINESS_NOTE_ID, text: STATUTORY_EN }]);
    expect(formatted.documentLegalNotes).toEqual([
      { id: SMALL_BUSINESS_NOTE_ID, text: STATUTORY_EO },
    ]);
  });

  it.each<[string, XxConfigInput]>([
    ["VAT-registered (the default)", {}],
    ["VAT-registered, with a note configured", { smallBusinessNote: "Not used" }],
  ])("does not apply when %s", (_name, config) => {
    const c = compute(config, [line("100.00")]);
    expect(c.legalNotes).toEqual([]);
    expect(traceKeys(c, SMALL_BUSINESS_RULE_ID)).toEqual([]);
  });

  it("adds the note to an empty invoice too", () => {
    const c = compute({ vatRegistered: false }, []);
    expect(c.legalNotes.map((note) => note.id)).toEqual([SMALL_BUSINESS_NOTE_ID]);
  });
});
