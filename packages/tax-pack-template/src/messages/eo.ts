/**
 * Esperanto catalog: the placeholder for Exampleland's own language, in which the legal notes are
 * printed on the invoice (`meta.documentLocale`). Every locale has exactly the keys of `en` and
 * the same placeholders in each message (the conformance suite checks both; the type below makes
 * a missing or extra key a compile error).
 */
import type { XxMessageKey } from "./en";

// TEMPLATE: Esperanto only stands in for the fictional country's language. Rename this file to
// your country's language (de.ts, fr.ts...), translate every value (never the keys or the
// placeholders), and list the locale in meta.locales (index.ts). A country with several official
// languages has one catalog each; meta.documentLocale names the one the invoice is printed in.
export const eo: Readonly<Record<XxMessageKey, string>> = {
  "meta.name": "Ekzemplolando (ŝablono)",
  "meta.description":
    "Ŝablona pako por la fikcia lando Ekzemplolando: AVI laŭ la normala aŭ reduktita kvoto, la escepto por malgrandaj entreprenoj kaj la deteno de enspezimposto. Kopiu ĝin por komenci pakon por via lando.",
  "meta.disclaimer":
    "Ekzemplolando kaj ĝia leĝaro estas fikciaj: ĉi tiuj sumoj montras kiel impostpako funkcias kaj signifas nenion por vera fakturo. Sumoj kalkulitaj de vera pako estas informaj: kontrolu ilin kun kontisto.",

  "xx.rule.classify-lines.title": "Klasigo de la linioj",
  "xx.rule.vat.title": "AVI",
  "xx.rule.small-business.title": "Escepto por malgrandaj entreprenoj",
  "xx.rule.withholding.title": "Deteno de imposto",

  "xx.group.vat": "AVI {rate}",
  "xx.group.small-business": "Sen AVI (malgranda entrepreno)",
  "xx.group.small-business.reference": "art. 30 de la AVI-leĝo",
  "xx.group.exempt": "Senimposta",
  "xx.group.exempt.reference": "art. 12 de la AVI-leĝo",
  "xx.group.out-of-scope": "Ekster la amplekso de AVI",
  "xx.group.excluded": "Elspezoj por la kliento (ekster la impostebla sumo)",

  "xx.component.vat": "AVI",
  "xx.component.withholding": "Detenita imposto {rate}",

  "xx.trace.classify": "Linioj klasigitaj en impostgrupojn: {count}",
  "xx.trace.vat": "AVI je {rate} sur la impostebla sumo",
  "xx.trace.vat.none": "Neniu AVI: ne estas impostebla sumo",
  "xx.trace.small-business":
    "Escepto por malgrandaj entreprenoj: neniu AVI estas fakturita, kaj la fakturo diras kial",
  "xx.trace.withholding": "Detenita imposto: {rate} de la honorarioj antaŭ AVI",
  "xx.trace.withholding.not-agent": "Neniu deteno: la kliento ne devas deteni imposton",
  "xx.trace.withholding.skipped": "Neniu deteno: malŝaltita por ĉi tiu fakturo",
  "xx.trace.withholding.no-base": "Neniu deteno: la fakturo ne havas honorariojn",

  "xx.note.small-business":
    "AVI ne fakturita: escepto por malgrandaj entreprenoj laŭ artikolo 30 de la AVI-leĝo de Ekzemplolando.",
  "xx.note.custom": "{text}",

  "xx.warning.out-of-scope-without-reference":
    "Linio ekster la amplekso de AVI ne havas referencon: la fakturo devas diri kial neniu AVI estas fakturita.",

  "xx.issue.rate-without-vat":
    "Linio “{line}”: AVI-kvoto ({rate}) ne estas uzebla sub la escepto por malgrandaj entreprenoj",
  "xx.issue.unknown-vat-rate":
    "Linio “{line}”: {rate} ne estas AVI-kvoto de Ekzemplolando je la dato de la fakturo (normala {standard}, reduktita {reduced})",

  "xx.rounding.description":
    "Sumoj estas rondigitaj duone supren al la plej malgranda unuo de la valuto: ĉiu linia sumo, la AVI unufoje por ĉiu kvoto kaj la detenita imposto unufoje por la fakturo.",
};
