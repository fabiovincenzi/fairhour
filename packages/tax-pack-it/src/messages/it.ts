/**
 * Italian catalog of the Italian pack: the document locale, so the `it.note.*` texts are the
 * legal wording printed on the invoice (docs/tax-packs/it.md, section 12).
 *
 * Apostrophes: legal notes keep the straight apostrophe (U+0027) of the official wording, which
 * also stays inside the Latin-1 character set FatturaPA text fields accept. The tax-core formatter
 * rejects a straight apostrophe directly before a brace (ICU quoting), so a message that needs
 * one there uses the typographic ’ (U+2019).
 */
import type { ItMessageKey } from "./en";

export const it: Readonly<Record<ItMessageKey, string>> = {
  "meta.name": "Italia",
  "meta.description":
    "Professionisti italiani con partita IVA: regime forfettario e regime ordinario, con IVA, ritenuta d'acconto, rivalsa INPS, casse previdenziali, imposta di bollo e scissione dei pagamenti.",
  "meta.disclaimer":
    "Gli importi sono indicativi e vanno verificati con il proprio commercialista prima di emettere la fattura.",

  "it.rule.common.classify-lines.title": "Classificazione delle righe",
  "it.rule.common.general-expenses.title": "Spese generali (avvocati)",
  "it.rule.common.cassa.title": "Contributo integrativo della cassa",
  "it.rule.common.inps-rivalsa.title": "Rivalsa INPS",
  "it.rule.ordinario.vat.title": "IVA",
  "it.rule.ordinario.withholding.title": "Ritenuta d'acconto",
  "it.rule.forfettario.no-vat.title": "Nessuna IVA (regime forfettario)",
  "it.rule.forfettario.no-withholding.title": "Nessuna ritenuta (regime forfettario)",
  "it.rule.common.stamp-duty.title": "Imposta di bollo",
  "it.rule.ordinario.split-payment.title": "Scissione dei pagamenti",

  "it.group.vat": "IVA {rate}",
  "it.group.n2-2-forfettario": "N2.2 – Non soggetta (forfettario)",
  "it.group.n2-2": "N2.2 – Non soggetta (altri casi)",
  "it.group.n2-1": "N2.1 – Non soggetta (artt. da 7 a 7-septies)",
  "it.group.n4": "N4 – Esente",
  "it.group.n1": "N1 – Esclusa ex art. 15",
  "it.group.reference.forfettario": "L. 190/2014, art. 1, commi 54-89",
  "it.group.reference.art7-ter": "DPR 633/1972, art. 7-ter",
  "it.group.reference.art10": "DPR 633/1972, art. 10",
  "it.group.reference.art15": "DPR 633/1972, art. 15",

  "it.reason.forfettario": "nessuna IVA nel regime forfettario",
  "it.reason.vat": "soggetta a IVA al {rate}",
  "it.reason.art15":
    "spese anticipate in nome e per conto del cliente, fuori dalla base imponibile IVA",
  "it.reason.exempt": "esente da IVA",
  "it.reason.out-of-scope": "non soggetta a IVA",
  "it.reason.reverse-charge-eu":
    "cliente soggetto passivo in un altro Stato dell'UE: l'IVA è assolta dal cliente (inversione contabile)",
  "it.reason.outside-eu": "cliente soggetto passivo fuori dall'UE: operazione non soggetta",
  "it.reference.art10": "art. 10 del DPR n. 633/1972",

  "it.note.forfettario":
    "Operazione effettuata in regime forfettario ai sensi dell'articolo 1, commi da 54 a 89, della Legge n. 190/2014 e successive modificazioni.",
  "it.note.forfettario-no-withholding":
    "Si richiede la non applicazione della ritenuta alla fonte a titolo d'acconto ai sensi dell'articolo 1, comma 67, della Legge n. 190/2014.",
  "it.note.art15":
    "Spese anticipate in nome e per conto del cliente, escluse dalla base imponibile IVA ai sensi dell'articolo 15, primo comma, n. 3), del DPR n. 633/1972.",
  "it.note.exempt": "Operazione esente da IVA ({reference}).",
  "it.note.out-of-scope": "Operazione non soggetta a IVA ({reference}).",
  "it.note.out-of-scope-generic": "Operazione non soggetta a IVA.",
  "it.note.reverse-charge-eu":
    "Inversione contabile: operazione non soggetta a IVA in Italia ai sensi dell'articolo 7-ter del DPR n. 633/1972.",
  "it.note.outside-eu": "Operazione non soggetta ai sensi dell'articolo 7-ter del DPR n. 633/1972.",
  "it.note.stamp-duty":
    "Imposta di bollo assolta in modo virtuale ai sensi dell'articolo 6 del DM 17 giugno 2014.",
  "it.note.split-payment":
    "Scissione dei pagamenti ai sensi dell'articolo 17-ter del DPR n. 633/1972.",
  "it.note.custom": "{text}",

  "it.component.general-expenses": "Spese generali {rate}",
  "it.component.cassa": "Contributo integrativo {name} {rate}",
  "it.component.inps-rivalsa": "Rivalsa INPS {rate}",
  "it.component.vat": "IVA",
  "it.component.withholding": "Ritenuta d'acconto {rate}",
  "it.component.stamp-duty": "Imposta di bollo",
  "it.component.split-payment": "IVA versata dal cliente (scissione dei pagamenti)",

  "it.trace.classify.none": "Nessuna riga da classificare",
  "it.trace.classify.group": "{group}: {amount} ({reason})",
  "it.trace.general-expenses": "Spese generali forfettarie del {rate} del compenso",
  "it.trace.general-expenses.none": "Nessuna spesa generale: la fattura non ha compensi",
  "it.trace.cassa": "Contributo integrativo {name} del {rate} su compensi e spese generali",
  "it.trace.cassa.none": "Nessun contributo integrativo {name}: la fattura non ha compensi",
  "it.trace.inps-rivalsa": "Rivalsa INPS del {rate} sui compensi",
  "it.trace.inps-rivalsa.none": "Nessuna rivalsa INPS: la fattura non ha compensi",
  "it.trace.vat": "IVA al {rate} sull'imponibile",
  "it.trace.vat.none": "Nessuna IVA: nessuna parte della fattura è soggetta a IVA in Italia",
  "it.trace.withholding.not-agent": "Nessuna ritenuta: il cliente non è sostituto d'imposta",
  "it.trace.withholding.no-base": "Nessuna ritenuta: la fattura non ha compensi",
  "it.trace.withholding.gross":
    "Importo soggetto a ritenuta: compensi, spese generali e rivalsa INPS (esclusi contributo integrativo, IVA, spese anticipate, beni e imposta di bollo)",
  "it.trace.withholding.share": "Base della ritenuta: {share} di tale importo",
  "it.trace.withholding":
    "Ritenuta d'acconto del {rate}, trattenuta dal cliente e versata all'Erario",
  "it.trace.forfettario.no-vat":
    "Nessuna IVA: nel regime forfettario non si addebita l'IVA (L. 190/2014, art. 1, c. 58)",
  "it.trace.forfettario.no-withholding.note":
    "Nessuna ritenuta sui compensi forfettari (L. 190/2014, art. 1, c. 67): la fattura chiede al cliente di non applicarla",
  "it.trace.forfettario.no-withholding.not-agent":
    "Nessuna ritenuta sui compensi forfettari (L. 190/2014, art. 1, c. 67); nessuna dicitura: il cliente non è sostituto d'imposta",
  "it.trace.forfettario.no-withholding.disabled":
    "Nessuna ritenuta sui compensi forfettari (L. 190/2014, art. 1, c. 67); la dicitura è disattivata nelle impostazioni",
  "it.trace.stamp-duty.not-due":
    "Nessuna imposta di bollo: l'importo non soggetto a IVA, {base}, non supera {threshold}",
  "it.trace.stamp-duty.override":
    "Nessuna imposta di bollo: indicata come non dovuta per questa fattura (opzione della fattura)",
  "it.trace.stamp-duty.charged":
    "Imposta di bollo di {amount} addebitata al cliente: l'importo non soggetto a IVA, {base}, supera {threshold}",
  "it.trace.stamp-duty.absorbed":
    "Imposta di bollo di {amount} a carico del professionista, non aggiunta al totale: l'importo non soggetto a IVA, {base}, supera {threshold}",
  "it.trace.stamp-duty.credit-note":
    "Imposta di bollo di {amount} su una nota di credito, indicata a titolo informativo e non aggiunta al totale: l'importo non soggetto a IVA, {base}, supera {threshold}",
  "it.trace.split-payment.withholding":
    "Nessuna scissione dei pagamenti: esclusa per i compensi soggetti a ritenuta (art. 17-ter, c. 1-sexies, DPR 633/1972)",
  "it.trace.split-payment.expired":
    "Nessuna scissione dei pagamenti: l'autorizzazione UE è scaduta il {date}",
  "it.trace.split-payment.no-vat": "Nessuna scissione dei pagamenti: la fattura non ha IVA",
  "it.trace.split-payment":
    "Scissione dei pagamenti: il cliente versa direttamente all'Erario l'IVA di {amount}",
  "it.trace.revenue.not-applicable":
    "Il limite di ricavi e compensi riguarda solo il regime forfettario",
  "it.trace.revenue.total":
    "Compensi incassati nel {year} fino al {asOf}: {total} (incassi: {count})",
  "it.trace.revenue.prorated":
    "Primo anno di attività, iniziata il {start}: il limite è ragguagliato a {days} giorni",
  "it.trace.revenue.ceiling.ok": "{total} è il {ratio} del limite di {limit}: entro il limite",
  "it.trace.revenue.ceiling.approaching":
    "{total} è il {ratio} del limite di {limit}, pari o oltre la soglia di avviso del {warningRatio}",
  "it.trace.revenue.ceiling.exceeded":
    "{total} supera il limite di {limit} (dal {date}, il {ratio} del limite): il regime forfettario cessa il 31 dicembre e dal {nextYear} si applica il regime ordinario",
  "it.trace.revenue.immediate-exit.ok":
    "{total} non supera il limite di uscita immediata di {limit}",
  "it.trace.revenue.immediate-exit.exceeded":
    "{total} supera {limit} (il {date}): il regime forfettario cessa subito e l'IVA è dovuta dall'operazione che ha superato il limite",
  "it.trace.revenue.immediate-exit.none": "Nessun limite di uscita immediata prima del 2023",

  "it.formula.percentage": "{rate} × {base} = {amount}",
  "it.formula.withholding-gross": "{fees} + {generalExpenses} + {rivalsa} = {gross}",
  "it.formula.above-threshold": "{base} > {threshold}",
  "it.formula.not-above-threshold": "{base} ≤ {threshold}",
  "it.formula.prorata": "{ceiling} × {days} / 365 = {limit}",

  "it.warning.forfettario.treatment-ignored":
    "Nel regime forfettario i trattamenti esente e non soggetta sono ignorati: nessuna riga ha comunque l'IVA.",
  "it.warning.forfettario.foreign-business-client":
    "Cliente soggetto passivo fuori dall'Italia in regime forfettario: la fattura usa N2.2 e la dicitura del forfettario. Verifica con il commercialista se servono anche le annotazioni dell'art. 7-ter (N2.1, inversione contabile).",
  "it.warning.client.eu-business-without-vat-id":
    "Inversione contabile per un cliente UE senza partita IVA: aggiungi la partita IVA del cliente (verificala su VIES).",
  "it.warning.out-of-scope.missing-reference":
    "Una riga non soggetta a IVA non indica la norma: aggiungi il riferimento (per esempio l'articolo del DPR n. 633/1972) alla riga.",
  "it.warning.goods-lines":
    "I beni non sono compensi: sono esclusi dal contributo integrativo, dalla rivalsa INPS e dalla base della ritenuta.",
  "it.warning.cassa.rate-to-be-verified":
    "L'aliquota del {rate} di {name} è ancora da verificare: controllala con la cassa o indicala nelle impostazioni.",
  "it.warning.withholding.foreign-agent":
    "Un cliente fuori dall'Italia è indicato come sostituto d'imposta: la ritenuta viene applicata, ma verifica che lo sia davvero.",
  "it.warning.stamp-duty.override":
    "Imposta di bollo indicata come non dovuta per questa fattura: verifica che si applichi un'esenzione.",
  "it.warning.stamp-duty.credit-note-absorbed":
    "L'imposta di bollo su una nota di credito è indicata a titolo informativo e non è aggiunta al totale.",
  "it.warning.split-payment.authorisation-expired":
    "L'autorizzazione UE alla scissione dei pagamenti è scaduta il {date}: la scissione non viene applicata.",
  "it.warning.revenue.approaching": "I compensi si avvicinano al limite del regime forfettario.",
  "it.warning.revenue.exceeded":
    "I compensi superano il limite del regime forfettario: dal prossimo anno si applica il regime ordinario.",
  "it.warning.revenue.immediate-exit":
    "I compensi superano il limite di uscita immediata: il regime forfettario cessa subito e l'IVA è dovuta dall'operazione che ha superato il limite.",
  "it.warning.revenue.leap-year":
    "Il limite è ragguagliato su 365 giorni; se un anno bisestile debba contarne 366 è da verificare.",

  "it.issue.currency-not-eur":
    "Il pacchetto italiano calcola fatture in euro e questa è in {currency}: converti prima i prezzi in EUR.",
  "it.issue.forfettario.rate-not-allowed":
    "Nel regime forfettario non si applica alcuna aliquota IVA ({rate}).",
  "it.issue.ordinario.unknown-vat-rate":
    "{rate} non è un'aliquota IVA italiana (aliquote ammesse, in percentuale: {allowed}).",
  "it.issue.split-payment.withholding-conflict":
    "La scissione dei pagamenti non si applica ai compensi soggetti a ritenuta (art. 17-ter, c. 1-sexies, DPR 633/1972).",

  "it.threshold.ceiling": "Limite di ricavi e compensi del regime forfettario",
  "it.threshold.immediate-exit": "Limite di uscita immediata dal regime forfettario",

  "it.rounding.description":
    "Totali di riga, contributi (una volta per gruppo), IVA (una volta per aliquota, nel riepilogo) e ritenuta (una volta per documento) sono arrotondati al centesimo, con le metà per eccesso; i totali sono somme di importi arrotondati.",
};
