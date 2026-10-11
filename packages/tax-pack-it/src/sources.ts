/**
 * Legal sources of the Italian pack: one `SourceRef` per cited provision, mirrored in
 * docs/tax-packs/it.md (sections 7, 10, 11, 13 and 17).
 *
 * `verification` mirrors the marks of the specification, which was researched on 2026-10-09:
 * [O] official publication -> verified against "official-summary"; [S] consistent secondary
 * sources -> verified against "secondary"; [TBV] -> "to-be-verified" with the reason. No
 * consolidated statute was read in full (Normattiva was unreachable), so nothing is
 * "primary-text". Upgrading a mark is a metadata change: read the official text first.
 */
import { isoDate, type SourceRef, type SourceVerification } from "@fairhour/tax-core";
import type { CassaPreset } from "./config";
import { deepFreeze } from "./freeze";

const RESEARCHED_ON = isoDate("2026-10-09");

const official: SourceVerification = {
  status: "verified",
  on: RESEARCHED_ON,
  against: "official-summary",
};
const secondary: SourceVerification = {
  status: "verified",
  on: RESEARCHED_ON,
  against: "secondary",
};
const toBeVerified = (reason: string): SourceVerification => ({
  status: "to-be-verified",
  reason,
});

const NORMATTIVA = "https://www.normattiva.it/uri-res/N2Ls?urn:nir:";
const L_190_2014_TEXT =
  "https://www.agenziaentrate.gov.it/portale/documents/20143/241330/commi+54_+89_LEGGE+23+dicembre+2014.pdf/e5221678-d627-821c-fc47-d3c5be04f123";
const L_190_2014 = "Legge 23 dicembre 2014, n. 190";
const DPR_633_1972 = "DPR 26 ottobre 1972, n. 633";
const DPR_633_URL = `${NORMATTIVA}presidente.repubblica:decreto:1972-10-26;633`;
const DPR_600_1973 = "DPR 29 settembre 1973, n. 600";
const DPR_600_URL = `${NORMATTIVA}presidente.repubblica:decreto:1973-09-29;600`;
const DPR_642_1972 = "DPR 26 ottobre 1972, n. 642";
const DPR_642_URL = `${NORMATTIVA}presidente.repubblica:decreto:1972-10-26;642`;
const DPR_642_TARIFFA_URL =
  "https://def.finanze.it/DocTribFrontend/getContent.do?id=%7B0C8651F4-4C34-4F0F-82C2-538A2E4FC576%7D";
const FATTURAPA = "Agenzia delle Entrate, Specifiche tecniche FatturaPA, versione 1.9.1";
const FATTURAPA_URL =
  "https://www.agenziaentrate.gov.it/portale/documents/d/guest/allegato-a-specifiche-tecniche-vers-1-9-1";
const CIRCOLARE_32E_2023 = "Agenzia delle Entrate, Circolare n. 32/E del 5 dicembre 2023";
const CIRCOLARE_32E_URL =
  "https://www.dirittobancario.it/wp-content/uploads/2023/12/Circolare-Agenzia-delle-Entrate-5-dicembre-2023-n.-32-E.pdf";

export const sources = deepFreeze({
  // --- Regime forfettario (L. 190/2014) ---------------------------------------------------
  l190Regime: {
    id: "it.l-190-2014.c54-89",
    kind: "statute",
    title: L_190_2014,
    citation: "art. 1, commi 54-89 (regime forfettario)",
    url: L_190_2014_TEXT,
    verification: official,
  },
  l190NoVat: {
    id: "it.l-190-2014.c58-a",
    kind: "statute",
    title: L_190_2014,
    citation: "art. 1, comma 58, lettera a)",
    url: L_190_2014_TEXT,
    verification: official,
    note: "Forfettari do not charge VAT (no rivalsa of the tax of art. 18 DPR 633/1972) on domestic transactions.",
  },
  l190NoWithholding: {
    id: "it.l-190-2014.c67",
    kind: "statute",
    title: L_190_2014,
    citation: "art. 1, comma 67",
    url: L_190_2014_TEXT,
    verification: official,
    note: "Fees of the regime are not subject to withholding; the taxpayer declares that the income is subject to the substitute tax.",
  },
  l190Ceiling: {
    id: "it.l-190-2014.c54-a",
    kind: "statute",
    title: L_190_2014,
    citation: "art. 1, comma 54, lettera a), as amended by L. 145/2018 and L. 197/2022",
    url: L_190_2014_TEXT,
    verification: official,
    note: "Confirmed through Circolare 32/E/2023: €65,000 (2019-2022 access), €85,000 from 2023.",
  },
  l190ImmediateExit: {
    id: "it.l-190-2014.c71",
    kind: "statute",
    title: L_190_2014,
    citation: "art. 1, comma 71, secondo e terzo periodo (added by L. 197/2022)",
    url: L_190_2014_TEXT,
    verification: official,
    note: "Above €100,000 the regime ends in the same year; VAT is due from the transaction that exceeds the limit. Confirmed through Circolare 32/E/2023.",
  },
  l190CashBasis: {
    id: "it.l-190-2014.c64",
    kind: "statute",
    title: L_190_2014,
    citation: "art. 1, comma 64 (reddito determinato sui compensi percepiti)",
    url: L_190_2014_TEXT,
    verification: secondary,
  },
  l145of2018: {
    id: "it.l-145-2018.c9-11",
    kind: "statute",
    title: "Legge 30 dicembre 2018, n. 145",
    citation: "art. 1, commi 9-11",
    url: `${NORMATTIVA}stato:legge:2018-12-30;145`,
    verification: toBeVerified(
      "The €65,000 ceiling is confirmed by secondary sources; the pinpoint (commi 9-11) was not read in the official text",
    ),
  },
  l197of2022: {
    id: "it.l-197-2022.c54",
    kind: "statute",
    title: "Legge 29 dicembre 2022, n. 197",
    citation: "art. 1, comma 54 (amending L. 190/2014, art. 1, commi 54 e 71)",
    url: `${NORMATTIVA}stato:legge:2022-12-29;197`,
    verification: toBeVerified(
      "The €85,000 ceiling and the €100,000 immediate exit are confirmed by Circolare 32/E/2023; the pinpoint in L. 197/2022 was not read",
    ),
  },
  circolare32E2023: {
    id: "it.ade.circolare-32e-2023",
    kind: "guidance",
    title: CIRCOLARE_32E_2023,
    citation: "§ 3.2 (limiti di 85.000 e 100.000 euro, criterio di cassa)",
    url: CIRCOLARE_32E_URL,
    verification: official,
  },
  circolare32E2023FirstYear: {
    id: "it.ade.circolare-32e-2023.first-year",
    kind: "guidance",
    title: CIRCOLARE_32E_2023,
    citation: "ragguaglio ad anno del limite nel primo anno di attività (esempio: 1° marzo 2023)",
    url: CIRCOLARE_32E_URL,
    verification: secondary,
    note: "The €85,000 ceiling is pro-rated by days of activity; the €100,000 limit is not. Leap years (365 or 366 days) are to be verified.",
  },
  fatturaForfettari: {
    id: "it.ade.fattura-forfettari",
    kind: "guidance",
    title: "Agenzia delle Entrate, Fattura elettronica per i forfettari",
    citation: "Natura N2.2 e diciture in Causale",
    url: "https://www.agenziaentrate.gov.it/portale/fattura-elettronica-per-i-forfettari",
    verification: official,
  },

  // --- VAT (DPR 633/1972) -------------------------------------------------------------------
  vatStandardRate: {
    id: "it.dpr-633-1972.art16",
    kind: "statute",
    title: DPR_633_1972,
    citation: "art. 16, comma 1 (aliquota ordinaria del 22 per cento)",
    url: DPR_633_URL,
    verification: secondary,
  },
  vatReducedRates: {
    id: "it.dpr-633-1972.tabella-a",
    kind: "statute",
    title: DPR_633_1972,
    citation: "Tabella A, parti II, II-bis e III (aliquote del 4, 5 e 10 per cento)",
    url: DPR_633_URL,
    verification: secondary,
  },
  vatTaxableAmount: {
    id: "it.dpr-633-1972.art13",
    kind: "statute",
    title: DPR_633_1972,
    citation: "art. 13 (base imponibile: corrispettivi dovuti)",
    url: DPR_633_URL,
    verification: secondary,
  },
  vatDisbursements: {
    id: "it.dpr-633-1972.art15",
    kind: "statute",
    title: DPR_633_1972,
    citation: "art. 15, primo comma, n. 3)",
    url: DPR_633_URL,
    verification: toBeVerified(
      "The exclusion of disbursements in the client's name is confirmed by secondary sources; the pinpoint (c. 1, n. 3) is recalled, not re-read",
    ),
  },
  vatExempt: {
    id: "it.dpr-633-1972.art10",
    kind: "statute",
    title: DPR_633_1972,
    citation: "art. 10 (operazioni esenti)",
    url: DPR_633_URL,
    verification: secondary,
  },
  vatPlaceOfSupply: {
    id: "it.dpr-633-1972.art7-ter",
    kind: "statute",
    title: DPR_633_1972,
    citation: "art. 7-ter (prestazioni di servizi generiche)",
    url: DPR_633_URL,
    verification: secondary,
  },
  vatForeignAnnotations: {
    id: "it.dpr-633-1972.art21-c6-bis",
    kind: "statute",
    title: DPR_633_1972,
    citation: "art. 21, comma 6-bis, lettere a) e b)",
    url: DPR_633_URL,
    verification: secondary,
  },
  vatRoundingToCent: {
    id: "it.dpr-633-1972.art21-c2-l",
    kind: "statute",
    title: DPR_633_1972,
    citation: "art. 21, comma 2, lettera l) (arrotondamento al centesimo di euro)",
    url: DPR_633_URL,
    verification: toBeVerified("Wording recalled, not re-read in the official text"),
  },
  splitPayment: {
    id: "it.dpr-633-1972.art17-ter",
    kind: "statute",
    title: DPR_633_1972,
    citation: "art. 17-ter (scissione dei pagamenti)",
    url: DPR_633_URL,
    verification: secondary,
  },
  splitPaymentWithholdingExclusion: {
    id: "it.dpr-633-1972.art17-ter-c1-sexies",
    kind: "statute",
    title: DPR_633_1972,
    citation: "art. 17-ter, comma 1-sexies (added by DL 12 luglio 2018, n. 87)",
    url: DPR_633_URL,
    verification: secondary,
    note: "Split payment does not apply to services whose fees are subject to withholding (art. 25 DPR 600/1973), from 14 July 2018.",
  },
  splitPaymentDecision2026: {
    id: "it.eu.decision-2026-1728",
    kind: "eu-law",
    title: "Council Implementing Decision (EU) 2026/1728 of 10 July 2026",
    citation: "authorisation of the split payment until 30 June 2029",
    url: "https://www.finanze.gov.it/it/archivi/notizie/dettaglio-notizie/Pubblicata-la-decisione-di-proroga-dello-Split-Payment/",
    verification: official,
    note: "Announced by the Ministry of Economy and Finance; effective from 1 July 2026.",
  },
  splitPaymentDecision2023: {
    id: "it.eu.decision-2023-1552",
    kind: "eu-law",
    title: "Council Implementing Decision (EU) 2023/1552",
    citation: "authorisation of the split payment until 30 June 2026",
    verification: toBeVerified(
      "Only the 2026/1728 extension was verified; earlier decisions and their end dates were not",
    ),
  },
  euroRounding: {
    id: "it.eu.reg-1103-97.art5",
    kind: "eu-law",
    title: "Regolamento (CE) n. 1103/97 del Consiglio del 17 giugno 1997",
    citation: "art. 5 (arrotondamento al centesimo)",
    url: "https://eur-lex.europa.eu/eli/reg/1997/1103/oj",
    verification: secondary,
  },
  brexit: {
    id: "it.eu.withdrawal-agreement.art126",
    kind: "eu-law",
    title:
      "Agreement on the withdrawal of the United Kingdom of Great Britain and Northern Ireland from the European Union and the European Atomic Energy Community",
    citation: "art. 126 (transition period ending on 31 December 2020)",
    verification: toBeVerified("Pinpoint not verified"),
  },

  // --- Withholding (DPR 600/1973) -----------------------------------------------------------
  withholding: {
    id: "it.dpr-600-1973.art25",
    kind: "statute",
    title: DPR_600_1973,
    citation: "art. 25, comma 1 (ritenuta del 20 per cento sui compensi di lavoro autonomo)",
    url: DPR_600_URL,
    verification: official,
    note: "The Agenzia's F24 page states 20 % for residents.",
  },
  withholdingAgents: {
    id: "it.dpr-600-1973.art25-bis",
    kind: "statute",
    title: DPR_600_1973,
    citation: "art. 25-bis (provvigioni: 23 per cento sul 50 o sul 20 per cento)",
    url: DPR_600_URL,
    verification: secondary,
  },
  withholdingBase: {
    id: "it.ade.f24-ritenute-base",
    kind: "guidance",
    title:
      "Agenzia delle Entrate, F24 Ritenute reddito lavoro autonomo – Importi su cui si applica la ritenuta",
    citation: "scheda informativa",
    url: "https://www.agenziaentrate.gov.it/portale/web/guest/schede/pagamenti/versamento-modello-f24-ritenute-su-reddito-di-lavoro-autonomo-f24_rit_red_lav_aut/importi-su-cui-si-applica-la-ritenuta-f24_rit_red_lav_aut",
    verification: official,
    note: "Included: the 4 % INPS contribution and reimbursements of expenses. Excluded: the cassa's rivalsa and documented sums advanced in the client's name.",
  },

  // --- Social security ------------------------------------------------------------------------
  inpsRivalsa: {
    id: "it.l-662-1996.c212",
    kind: "statute",
    title: "Legge 23 dicembre 1996, n. 662",
    citation: "art. 1, comma 212",
    url: `${NORMATTIVA}stato:legge:1996-12-23;662`,
    verification: secondary,
    note: "Reported both as 'nella misura del 4 %' and 'fino al 4 %': rates below 4 % are an open point.",
  },
  cassaVat: {
    id: "it.dl-41-1995.art16",
    kind: "statute",
    title: "Decreto-legge 23 febbraio 1995, n. 41 (conv. L. 22 marzo 1995, n. 85)",
    citation: "art. 16 (contributo integrativo soggetto a IVA)",
    url: `${NORMATTIVA}stato:decreto.legge:1995-02-23;41`,
    verification: secondary,
  },
  cassaVatCourt: {
    id: "it.corte-cost.ord-156-1997",
    kind: "case-law",
    title: "Corte costituzionale, ordinanza n. 156 del 1997",
    citation: "contributo integrativo e IVA",
    url: "https://www.cortecostituzionale.it/scheda-pronuncia/1997/156",
    verification: secondary,
  },
  cassaForenseLaw: {
    id: "it.l-576-1980.art11",
    kind: "statute",
    title: "Legge 20 settembre 1980, n. 576",
    citation: "art. 11 (contributo integrativo)",
    url: `${NORMATTIVA}stato:legge:1980-09-20;576`,
    verification: toBeVerified("Pinpoint and current rate not read in the official text"),
  },
  cassaCustom: {
    id: "it.cassa.custom",
    kind: "user-configuration",
    title: "Professional fund configured in the settings",
    citation: "rate, TipoCassa and name entered by the user",
    verification: toBeVerified("Values supplied by the user: check them against the fund's rules"),
  },

  // --- Lawyers' general expenses --------------------------------------------------------------
  generalExpenses: {
    id: "it.dm-55-2014.art2-c2",
    kind: "regulation",
    title: "Decreto del Ministro della giustizia 10 marzo 2014, n. 55",
    citation: "art. 2, comma 2, as amended by DM 13 agosto 2022, n. 147",
    verification: secondary,
    note: "Flat reimbursement of general expenses 'nella misura del 15 per cento' of the fee.",
  },
  generalExpensesCnf: {
    id: "it.cnf.parere-38-2024",
    kind: "professional-practice",
    title: "Consiglio Nazionale Forense, parere n. 38/2024",
    citation: "rimborso forfettario delle spese generali",
    verification: secondary,
  },

  // --- Stamp duty (DPR 642/1972) --------------------------------------------------------------
  stampDuty: {
    id: "it.dpr-642-1972.tariffa-art13",
    kind: "statute",
    title: DPR_642_1972,
    citation: "Tariffa (allegato A), parte I, art. 13, comma 1",
    url: DPR_642_TARIFFA_URL,
    verification: official,
    note: "€2.00 per copy on invoices and similar documents (Risposta n. 129/2024).",
  },
  stampDutyThreshold: {
    id: "it.dpr-642-1972.tariffa-art13-nota2a",
    kind: "statute",
    title: DPR_642_1972,
    citation: "Tariffa, parte I, art. 13, nota 2, lettera a)",
    url: DPR_642_TARIFFA_URL,
    verification: official,
    note: "Not due when the amount does not exceed L. 150,000 = €77.47 (Risposta n. 45/2024).",
  },
  stampDutyVatExemption: {
    id: "it.dpr-642-1972.tabella-b-art6",
    kind: "statute",
    title: DPR_642_1972,
    citation: "Tabella (allegato B), art. 6",
    url: DPR_642_URL,
    verification: official,
    note: "Invoices for transactions subject to VAT are exempt (Risposta n. 21/2020).",
  },
  stampDutyAmount: {
    id: "it.dl-43-2013.art7-bis-c3",
    kind: "statute",
    title: "Decreto-legge 26 aprile 2013, n. 43 (conv. L. 24 giugno 2013, n. 71)",
    citation: "art. 7-bis, comma 3",
    url: `${NORMATTIVA}stato:decreto.legge:2013-04-26;43`,
    verification: secondary,
    note: "€2.00 (was €1.81) for documents formed from 26 June 2013.",
  },
  stampDutyMixedInvoices: {
    id: "it.ade.risoluzione-98e-2001",
    kind: "ruling",
    title: "Agenzia delle Entrate, Risoluzione n. 98/E del 3 luglio 2001",
    citation: "fatture con importi in parte soggetti e in parte non soggetti a IVA",
    verification: official,
    note: "Cited in Risposta n. 45/2024: due when the VAT-free amounts together exceed €77.47.",
  },
  stampDutyDisbursements: {
    id: "it.ade.risposta-491-2021",
    kind: "ruling",
    title: "Agenzia delle Entrate, Risposta n. 491 del 20 luglio 2021",
    citation: "spese anticipate e imposta di bollo",
    url: "https://www.agenziaentrate.gov.it/portale/documents/20143/0/Risposta_491_20.07.2021.pdf/c0a023c7-7c30-1e11-8cf8-16460212d92a",
    verification: secondary,
    note: "Official text not read.",
  },
  stampDutyForfettarioRecharge: {
    id: "it.ade.risposta-428-2022",
    kind: "ruling",
    title: "Agenzia delle Entrate, Risposta n. 428 del 12 agosto 2022",
    citation: "riaddebito dell'imposta di bollo da parte del forfettario",
    verification: secondary,
    note: "The recharged duty is part of the fee (income). Official text not read.",
  },
  stampDutyVirtual: {
    id: "it.dm-17-06-2014.art6",
    kind: "regulation",
    title: "Decreto del Ministro dell'economia e delle finanze 17 giugno 2014",
    citation: "art. 6, as amended by DM 28 dicembre 2018 (pagamento virtuale)",
    verification: secondary,
  },
  eInvoicingForfettari: {
    id: "it.dl-36-2022.art18",
    kind: "statute",
    title: "Decreto-legge 30 aprile 2022, n. 36",
    citation: "art. 18 (fatturazione elettronica per i forfettari dal 2024)",
    url: `${NORMATTIVA}stato:decreto.legge:2022-04-30;36`,
    verification: secondary,
  },

  // --- FatturaPA codes ------------------------------------------------------------------------
  fatturapaNatura: {
    id: "it.fatturapa.natura",
    kind: "technical-specification",
    title: FATTURAPA,
    citation: "Natura N1, N2.1, N2.2 e N4",
    url: FATTURAPA_URL,
    verification: secondary,
  },
  fatturapaTipoCassa: {
    id: "it.fatturapa.tipo-cassa",
    kind: "technical-specification",
    title: FATTURAPA,
    citation: "TipoCassa TC01, TC17, TC18, TC21 e TC22",
    url: FATTURAPA_URL,
    verification: secondary,
  },
  fatturapaTipoCassaUnconfirmed: {
    id: "it.fatturapa.tipo-cassa.unconfirmed",
    kind: "technical-specification",
    title: FATTURAPA,
    citation: "TipoCassa TC02-TC16, TC19 e TC20",
    url: FATTURAPA_URL,
    verification: toBeVerified("Codes not confirmed against the specification"),
  },
  fatturapaRitenuta: {
    id: "it.fatturapa.ritenuta",
    kind: "technical-specification",
    title: FATTURAPA,
    citation: "TipoRitenuta RT01 e RT02, CausalePagamento A",
    url: FATTURAPA_URL,
    verification: secondary,
  },
  fatturapaBollo: {
    id: "it.fatturapa.bollo",
    kind: "technical-specification",
    title: FATTURAPA,
    citation: "DatiBollo: BolloVirtuale e ImportoBollo",
    url: FATTURAPA_URL,
    verification: secondary,
  },
  fatturapaEsigibilita: {
    id: "it.fatturapa.esigibilita-iva",
    kind: "technical-specification",
    title: FATTURAPA,
    citation: "EsigibilitaIVA S (scissione dei pagamenti)",
    url: FATTURAPA_URL,
    verification: toBeVerified("Code not confirmed against the specification"),
  },
} satisfies Record<string, SourceRef>);

/**
 * The contributo integrativo rate of each preset fund, with the mark of table 7.3 of the
 * specification. Cited by the cassa component next to the rule's own sources.
 */
export const cassaRateSources: Readonly<Record<CassaPreset, SourceRef>> = deepFreeze({
  "cassa-forense": {
    id: "it.cassa.cassa-forense.rate",
    kind: "professional-practice",
    title: "Cassa Forense, contributo integrativo",
    citation: "4 per cento (CPA)",
    verification: secondary,
    note: "L. 576/1980 art. 11 is to be verified.",
  },
  cnpadc: {
    id: "it.cassa.cnpadc.rate",
    kind: "professional-practice",
    title: "CNPADC, contributo integrativo",
    citation: "4 per cento",
    verification: secondary,
  },
  cipag: {
    id: "it.cassa.cipag.rate",
    kind: "professional-practice",
    title: "CIPAG, contributo integrativo",
    citation: "5 per cento",
    verification: secondary,
  },
  inarcassa: {
    id: "it.cassa.inarcassa.rate",
    kind: "professional-practice",
    title: "Inarcassa, contributo integrativo",
    citation: "4 per cento",
    verification: secondary,
  },
  cnpr: {
    id: "it.cassa.cnpr.rate",
    kind: "professional-practice",
    title: "CNPR, contributo integrativo",
    citation: "4 per cento",
    verification: secondary,
  },
  enpacl: {
    id: "it.cassa.enpacl.rate",
    kind: "professional-practice",
    title: "ENPACL, contributo integrativo",
    citation: "4 per cento",
    verification: secondary,
    note: "Single secondary source.",
  },
  eppi: {
    id: "it.cassa.eppi.rate",
    kind: "professional-practice",
    title: "EPPI, contributo integrativo",
    citation: "5 per cento",
    verification: toBeVerified("Rate not confirmed by consistent sources"),
  },
  epap: {
    id: "it.cassa.epap.rate",
    kind: "professional-practice",
    title: "EPAP, contributo integrativo",
    citation: "4 per cento",
    verification: toBeVerified("Rate not confirmed by consistent sources"),
  },
  enpab: {
    id: "it.cassa.enpab.rate",
    kind: "professional-practice",
    title: "ENPAB, contributo integrativo",
    citation: "4 per cento",
    verification: toBeVerified("Rate not confirmed by consistent sources"),
  },
  enpapi: {
    id: "it.cassa.enpapi.rate",
    kind: "professional-practice",
    title: "ENPAPI, contributo integrativo",
    citation: "4 per cento (2 per cento verso le pubbliche amministrazioni)",
    verification: secondary,
    note: "Single secondary source. The 2 % rate towards public administrations is not automated.",
  },
  enpap: {
    id: "it.cassa.enpap.rate",
    kind: "professional-practice",
    title: "ENPAP, contributo integrativo",
    citation: "2 per cento",
    verification: secondary,
    note: "In February 2026 ENPAP was studying an increase to 4 % or 5 % from 2027.",
  },
} satisfies Record<CassaPreset, SourceRef>);

/** FatturaPA `TipoCassa` codes confirmed by secondary sources (the others are to be verified). */
const CONFIRMED_TIPO_CASSA: readonly string[] = ["TC01", "TC17", "TC18", "TC21", "TC22"];

/** The source of a FatturaPA `TipoCassa` code, with the right verification mark. */
export function tipoCassaSource(code: string): SourceRef {
  return CONFIRMED_TIPO_CASSA.includes(code)
    ? sources.fatturapaTipoCassa
    : sources.fatturapaTipoCassaUnconfirmed;
}
