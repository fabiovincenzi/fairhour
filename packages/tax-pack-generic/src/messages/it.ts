/**
 * Italian catalog. Same keys and placeholders as `en` (the conformance suite checks both). The
 * typographic apostrophe ’ is used throughout: an ASCII apostrophe before a placeholder would be
 * ICU quoting.
 */
import type { GenericMessageKey } from "./en";

export const it: Readonly<Record<GenericMessageKey, string>> = {
  "meta.name": "Generico",
  "meta.description":
    "IVA, GST o imposta sulle vendite configurabile, oppure nessuna imposta, con inversione contabile, diciture di esenzione e ritenuta facoltative. Funziona in qualsiasi paese e valuta.",
  "meta.disclaimer":
    "Questo pacchetto applica le aliquote, le etichette e le diciture delle tue impostazioni fiscali; non conosce la legge del tuo paese. Importi indicativi: verifica impostazioni e fatture con il tuo commercialista o con l’amministrazione fiscale.",

  "generic.rule.classify-lines.title": "Classificazione delle righe",
  "generic.rule.tax.title": "Imposta",
  "generic.rule.withholding.title": "Ritenuta",
  "generic.rule.notes.title": "Note in fattura",

  "generic.group.tax": "{label} {rate}",
  "generic.group.reverse-charge": "Inversione contabile",
  "generic.group.no-tax": "Senza {label}",
  "generic.group.exempt": "Esente",
  "generic.group.out-of-scope": "Fuori campo",
  "generic.group.excluded": "Spese anticipate (escluse dalla base imponibile)",

  "generic.component.tax": "{label}",
  "generic.component.withholding": "{label}",

  "generic.trace.classify": "Righe classificate nei gruppi d’imposta: {count}",
  "generic.trace.no-tax":
    "Nessuna imposta ({label}): le impostazioni fiscali non prevedono imposta",
  "generic.trace.reverse-charge.forced":
    "Inversione contabile forzata su questa fattura: l’imposta ({label}) è assolta dal cliente",
  "generic.trace.reverse-charge.foreign-business":
    "Inversione contabile: cliente impresa in {clientCountry}, fornitore in {supplierCountry}, quindi l’imposta ({label}) è assolta dal cliente. Il pacchetto confronta solo i paesi: verificare che l’inversione contabile sia ammessa (appartenenza all’UE, partita IVA, luogo della prestazione) è tua responsabilità",
  "generic.trace.reverse-charge.skipped":
    "Nessuna inversione contabile: disattivata su questa fattura",
  "generic.trace.reverse-charge.not-business":
    "Nessuna inversione contabile: il cliente non è un’impresa",
  "generic.trace.reverse-charge.domestic":
    "Nessuna inversione contabile: il cliente è nel paese del fornitore ({country})",
  "generic.trace.tax": "{label} al {rate} sull’imponibile",
  "generic.trace.tax.line": "{label} al {rate} su “{description}”",
  "generic.trace.tax.per-line": "{label} al {rate}: imposta di ogni riga, arrotondata e sommata",
  "generic.trace.tax.none": "Nessuna imposta ({label}): non c’è imponibile",
  "generic.trace.withholding":
    "{label}: {rate} dell’importo prima dell’imposta, spese anticipate escluse",
  "generic.trace.withholding.not-agent":
    "Nessuna ritenuta ({label}): il cliente non è sostituto d’imposta",
  "generic.trace.withholding.individual": "Nessuna ritenuta ({label}): il cliente è un privato",
  "generic.trace.withholding.no-base":
    "Nessuna ritenuta ({label}): non c’è un importo su cui calcolarla",

  "generic.formula.tax-per-line": "{rate} × {base}, arrotondato riga per riga = {amount}",

  "generic.warning.exempt-without-note":
    "Una riga esente non ha un riferimento e non è configurata una nota di esenzione: la fattura potrebbe dover indicare perché non si applica l’imposta.",
  "generic.warning.reverse-charge-without-vat-id":
    "Inversione contabile applicata, ma il cliente non ha una partita IVA: le fatture in inversione contabile di solito richiedono il numero di identificazione IVA del cliente.",

  "generic.issue.rate-not-allowed":
    "Riga “{line}”: l’aliquota {rate} non è tra quelle configurate per {label}",
  "generic.issue.rate-without-tax":
    "Riga “{line}”: non si può usare un’aliquota ({rate}) perché le impostazioni fiscali non prevedono imposta",

  "generic.note.custom": "{text}",

  "generic.rounding.description":
    "Totali di riga, imposta ({label}) e ritenute sono arrotondati all’unità minima della valuta, {mode}; l’imposta ({label}) è arrotondata {scope}.",
  "generic.rounding.description-no-tax":
    "Totali di riga e ritenute sono arrotondati all’unità minima della valuta, {mode}.",
  "generic.rounding.mode.half-up": "metà per eccesso (i casi a metà si allontanano dallo zero)",
  "generic.rounding.mode.half-even": "metà al pari (i casi a metà vanno alla cifra pari)",
  "generic.rounding.mode.half-down": "metà per difetto (i casi a metà vanno verso lo zero)",
  "generic.rounding.mode.up": "per eccesso (lontano dallo zero)",
  "generic.rounding.mode.down": "per difetto (verso lo zero)",
  "generic.rounding.mode.ceiling": "verso più infinito",
  "generic.rounding.mode.floor": "verso meno infinito",
  "generic.rounding.scope.per-document": "una volta per aliquota sull’intero documento",
  "generic.rounding.scope.per-line": "su ogni riga, poi sommata",
};
