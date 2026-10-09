# Italy tax pack (`@fairhour/tax-pack-it`)

> **Disclaimer.** The figures Fairhour computes are **informational**. They follow the rules and
> sources documented on this page, but they are not tax advice: verify every invoice with your
> accountant (_commercialista_) before you issue it. The law changes; check the
> [parameter timeline](#11-parameter-timeline) and the [open points](#14-open-legal-points) below.
>
> **Avvertenza.** Gli importi calcolati da Fairhour sono **indicativi**: seguono le regole e le
> fonti documentate in questa pagina ma non costituiscono consulenza fiscale. Verifica ogni fattura
> con il tuo commercialista prima di emetterla.

- **Pack id:** `it` · **Countries:** `IT` · **Locales:** `en`, `it` · **Document locale:** `it`
- **Status:** specification for implementation (phase 2), reviewed against the sources on 2026-10-09
- **Backlog:** TAX-004 (forfettario), TAX-005 (ordinario), TAX-006 (stamp duty), TAX-007 (revenue
  tracker), TAX-010 (docs); FatturaPA export is phase 10 (FPA-002)
- **Engine contract:** [`docs/design/tax-engine.md`](../design/tax-engine.md)

Contents:

1. [Scope](#1-scope)
2. [How the sources were verified](#2-how-the-sources-were-verified)
3. [Glossary](#3-glossary)
4. [Configuration](#4-configuration)
5. [Per-invoice options and input checks](#5-per-invoice-options-and-input-checks)
6. [Rule pipeline](#6-rule-pipeline)
7. [Rules in detail](#7-rules-in-detail)
8. [Rounding policy](#8-rounding-policy)
9. [Worked examples](#9-worked-examples)
10. [Revenue tracker (forfettario ceiling)](#10-revenue-tracker-forfettario-ceiling)
11. [Parameter timeline](#11-parameter-timeline)
12. [Wording (messages)](#12-wording-messages)
13. [FatturaPA mapping (phase 10)](#13-fatturapa-mapping-phase-10)
14. [Open legal points](#14-open-legal-points)
15. [Known limitations](#15-known-limitations)
16. [Test plan and golden fixtures](#16-test-plan-and-golden-fixtures)
17. [Sources](#17-sources)

---

## 1. Scope

The pack computes the invoice of an Italian **self-employed professional** (_lavoratore
autonomo_, holder of a _partita IVA_) under one of two regimes:

- **Regime forfettario** (flat-rate scheme, L. 190/2014, art. 1, cc. 54-89): no VAT, no
  withholding, optional INPS _rivalsa_ or a professional fund (_cassa_) contribution, stamp duty.
- **Regime ordinario** (standard VAT regime; also used here for the _regime semplificato_, which
  has the same invoice rules): VAT, withholding tax (_ritenuta d'acconto_) when the client is a
  withholding agent, INPS rivalsa or cassa contribution, lawyers' flat general expenses, art. 15
  disbursements, stamp duty on the VAT-free part, split payment for public administrations.

It handles invoices and credit notes in **EUR** for clients in Italy, in the EU and outside the
EU. Everything it does not model is listed in [Known limitations](#15-known-limitations).

---

## 2. How the sources were verified

Research for this page was done on 2026-10-09 with web searches restricted, where possible, to
`agenziaentrate.gov.it`, `gazzettaufficiale.it`, `finanze.gov.it` and EU sources. Direct page
fetches of `normattiva.it` and `agenziaentrate.gov.it` were **not possible from the research
environment** (DNS failure), so consolidated statutes were not read in full. Each point carries one
of these marks, mirrored in code by `SourceRef.verification`:

| Mark      | Meaning                                                                                                                                                 | `verification` in code                                |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **[O]**   | Confirmed by an official publication (Agenzia delle Entrate page, guide, ruling, FAQ; Ministry of Economy notice; EU act), as quoted in search extracts | `{ status: 'verified', against: 'official-summary' }` |
| **[S]**   | Confirmed by several consistent secondary sources (professional press, practitioners' guides)                                                           | `{ status: 'verified', against: 'secondary' }`        |
| **[TBV]** | To be verified: plausible and widely repeated, but not confirmed against an official text in this session                                               | `{ status: 'to-be-verified', reason }`                |

Before the pack's first release, a maintainer should read the consolidated texts on Normattiva
for every [S] and [TBV] item and upgrade the marks (a metadata change, see the engine design).

---

## 3. Glossary

| Term                                        | Meaning                                                                                                                                                                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| _Compensi_                                  | Professional fees.                                                                                                                                                                                                              |
| _Rivalsa INPS 4 %_                          | An optional 4 % surcharge that professionals enrolled in the INPS _Gestione Separata_ may charge to clients to recover part of their pension contributions. Part of the fee for tax purposes.                                   |
| _Cassa_ / _contributo integrativo_          | Professionals in a regulated profession pay into their own pension fund (_cassa previdenziale_), and must charge clients an integrative contribution (e.g. 4 % for lawyers, _CPA_). Collected on the fund's behalf: not income. |
| _Ritenuta d'acconto_                        | Withholding tax: a client who is a _sostituto d'imposta_ (withholding agent: businesses, professionals, public administrations) pays 20 % of the fees directly to the State; the professional receives the rest.                |
| _Imposta di bollo_                          | Stamp duty: €2 on invoices, or parts of invoices, not subject to VAT above €77.47.                                                                                                                                              |
| _Spese ex art. 15_                          | Disbursements paid in the client's name and on the client's behalf (court fees, registry fees): outside the VAT base and the withholding base.                                                                                  |
| _Spese generali 15 %_                       | Lawyers' flat reimbursement of general expenses, 15 % of the fee.                                                                                                                                                               |
| _Split payment_ (_scissione dei pagamenti_) | For certain public-sector clients the VAT is paid by the client directly to the State.                                                                                                                                          |
| _Natura_                                    | FatturaPA code explaining why a line has no VAT (N1, N2.1, N2.2, N4...).                                                                                                                                                        |

---

## 4. Configuration

The configuration is a JSON document validated by a zod 4 schema (no transforms, defaults via
`.prefault()` for nested objects because zod 4's `.default()` returns the default without parsing
it). Decimal values are strings.

```ts
// packages/tax-pack-it/src/config.ts (shape; implement with zod 4)
type Percent = string; // decimal string, 0 ≤ value ≤ 100, at most 4 decimals

type CassaPresetId =
  | "cassa-forense"
  | "cnpadc"
  | "cipag"
  | "inarcassa"
  | "cnpr"
  | "enpacl"
  | "eppi"
  | "epap"
  | "enpab"
  | "enpapi"
  | "enpap"
  | "custom";

type SocialSecurity =
  | { kind: "none" }
  | {
      kind: "inps-gestione-separata";
      rivalsa: boolean /* default true */;
      rate: Percent; /* default "4", max "4" */
    }
  | {
      kind: "cassa";
      preset: CassaPresetId;
      rate?: Percent; // overrides the preset rate; required for "custom"
      tipoCassa?: `TC${string}`; // TC01..TC21, required for "custom"
      name?: string; // required for "custom", max 80
    };

type StampDuty = { charge: "client" | "absorbed" }; // default { charge: "client" }

type GeneralExpenses = { rate?: Percent }; // absent: the parameter (15 %)

type ItConfig =
  | {
      regime: "forfettario";
      socialSecurity: SocialSecurity; // required, no default
      generalExpenses?: GeneralExpenses; // lawyers only
      stampDuty: StampDuty;
      noWithholdingNote: "when-withholding-agent" | "always" | "never"; // default "when-withholding-agent"
      wording?: { vat?: string; noWithholding?: string }; // custom legal wording, 10..500 chars
      revenueTracker: { warningRatio: Percent }; // default { warningRatio: "80" }
    }
  | {
      regime: "ordinario";
      socialSecurity: SocialSecurity; // required, no default
      generalExpenses?: GeneralExpenses;
      withholding: {
        enabled: boolean; // default true
        rate?: Percent; // default: parameter (20)
        baseShare: Percent; // default "100" (agents: "50" or "20")
        tipoRitenuta: "RT01" | "RT02"; // default "RT01" (natural person)
        causalePagamento: string; // default "A", /^[A-Z][0-9A-Z]?$/
      };
      stampDuty: StampDuty;
      splitPayment: "auto" | "never"; // default "auto"
    };
```

| Option                   | Default                    | Why this default                                                                                                                                                       |
| ------------------------ | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `regime`                 | required                   | No safe guess: the regime changes everything.                                                                                                                          |
| `socialSecurity`         | required                   | Charging (or not) a 4 % rivalsa or a cassa contribution is a choice the user must make; a wrong default silently changes every invoice. The settings form asks for it. |
| `socialSecurity.rivalsa` | `true`                     | When a Gestione Separata professional configures INPS, charging the rivalsa is the common case; it can be turned off.                                                  |
| `socialSecurity.rate`    | `"4"`                      | The statutory measure (L. 662/1996, c. 212). Values above 4 are rejected. Whether a lower percentage is allowed is an [open point](#14-open-legal-points).             |
| `generalExpenses.rate`   | the parameter (15 %)       | DM 55/2014 art. 2 c. 2 as amended by DM 147/2022 fixes it at 15 %. Only lawyers should enable `generalExpenses` (`{}` is enough).                                      |
| `stampDuty.charge`       | `"client"`                 | The most common practice, and what the README example shows. `"absorbed"` keeps the duty as an informational line paid by the professional.                            |
| `noWithholdingNote`      | `"when-withholding-agent"` | The note asks the withholding agent not to withhold; it is pointless for private clients. `"always"` is harmless if the user prefers it.                               |
| `withholding.enabled`    | `true`                     | Professionals' fees paid by a withholding agent are subject to it (art. 25 DPR 600/1973). Disable only for activities that are not _lavoro autonomo_.                  |
| `withholding.baseShare`  | `"100"`                    | Professionals: full base. Commercial agents (art. 25-bis, 23 % on 50 % or 20 %) set rate and share.                                                                    |
| `splitPayment`           | `"auto"`                   | Applies the law when its conditions hold; `"never"` for users who know their PA clients are excluded.                                                                  |

---

## 5. Per-invoice options and input checks

Per-invoice options (`InvoiceInput.options`, validated by `invoiceOptionsSchema`):

```ts
type ItOptions = {
  stampDuty?: "auto" | "charge" | "absorb" | "not-due"; // default "auto" (use the config)
  splitPayment?: "auto" | "apply" | "skip"; // default "auto"
};
```

- `stampDuty: 'not-due'` is an escape hatch for documents exempt for reasons the pack does not
  model (for example disbursements that are themselves taxes, Risposta 491/2021). It emits the
  warning `it.stamp-duty.override` and the trace says the user overrode the rule.
- `splitPayment: 'apply'` covers clients subject to split payment that are not public
  administrations in the input model (companies controlled by the State, FTSE MIB listed
  companies; see [limitations](#15-known-limitations)); `'skip'` the opposite.

`validateInput` refusals (`UnsupportedInputError`):

| Issue code                              | Condition                                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `it.currency-not-eur`                   | `input.currency !== 'EUR'` (thresholds are in euro; the bridge converts foreign prices with an explicit rate) |
| `it.forfettario.rate-not-allowed`       | forfettario and a line with `treatment.kind === 'rate'` (no VAT exists in the regime)                         |
| `it.ordinario.unknown-vat-rate`         | ordinario and a `rate` treatment not in the parameter's allowed rates (22, 10, 5, 4)                          |
| `it.split-payment.withholding-conflict` | `splitPayment: 'apply'` while withholding would apply (art. 17-ter c. 1-sexies excludes it)                   |

---

## 6. Rule pipeline

Rules run in this order. `appliesTo` is structural (regime, configuration); the outcome of an
applicable rule ("no withholding: private client") is always explained in the trace.

| #   | Rule id                         | Applies to                                                                                                                                | Output                                                                                       |
| --- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1   | `it.common.classify-lines`      | always                                                                                                                                    | tax groups, line assignment, notes for art. 15 / exempt / foreign clients, warnings          |
| 2   | `it.common.general-expenses`    | `generalExpenses` configured                                                                                                              | `it.general-expenses` (surcharge, adds to total)                                             |
| 3   | `it.common.cassa`               | `socialSecurity.kind = 'cassa'`                                                                                                           | `it.cassa` (contribution, adds to total)                                                     |
| 4   | `it.common.inps-rivalsa`        | `socialSecurity.kind = 'inps-gestione-separata'` and `rivalsa`                                                                            | `it.inps-rivalsa` (contribution, adds to total)                                              |
| 5   | `it.ordinario.vat`              | ordinario                                                                                                                                 | `it.vat` (tax, adds to total)                                                                |
| 6   | `it.ordinario.withholding`      | ordinario and `withholding.enabled`                                                                                                       | `it.withholding` (deducted from payable) or an explanation; fact `withholdingApplied`        |
| 7   | `it.forfettario.no-vat`         | forfettario                                                                                                                               | legal note `it.note.forfettario`                                                             |
| 8   | `it.forfettario.no-withholding` | forfettario                                                                                                                               | legal note `it.note.forfettario-no-withholding` (per `noWithholdingNote`)                    |
| 9   | `it.common.stamp-duty`          | always                                                                                                                                    | `it.stamp-duty` (adds to total or informational) and `it.note.stamp-duty`, or an explanation |
| 10  | `it.ordinario.split-payment`    | ordinario, option not `skip`, and either option `apply` or (`splitPayment = 'auto'` and the client is an Italian `public-administration`) | `it.split-payment` (deducted from payable) and `it.note.split-payment`, or an explanation    |

Pack facts: `{ withholdingApplied: boolean }` (initially `false`).

Tax groups registered by rule 1 (ids are stable; only groups that receive lines are registered,
except that rule 9 may register `n1` in ordinario for the stamp duty recharge):

| Group id                             | Treatment    | Rate         | Used for                                                                            | `exportCodes`            |
| ------------------------------------ | ------------ | ------------ | ----------------------------------------------------------------------------------- | ------------------------ |
| `vat-22`, `vat-10`, `vat-5`, `vat-4` | taxable      | 22, 10, 5, 4 | ordinario, `standard` (22) or `rate` lines                                          | `fatturapa.AliquotaIVA`  |
| `n2.2`                               | out-of-scope |              | forfettario (all non-excluded lines); ordinario `out-of-scope` lines                | `fatturapa.Natura: N2.2` |
| `n2.1`                               | out-of-scope |              | ordinario, `standard`/`rate` lines for a business client outside Italy (art. 7-ter) | `fatturapa.Natura: N2.1` |
| `n4`                                 | exempt       |              | ordinario `exempt` lines                                                            | `fatturapa.Natura: N4`   |
| `n1`                                 | excluded     |              | `excluded` lines (art. 15) in both regimes; stamp duty recharged in ordinario       | `fatturapa.Natura: N1`   |

---

## 7. Rules in detail

### 7.1 `it.common.classify-lines`

Assigns every line to a group:

| Regime      | Line treatment       | Client                             | Group                                                                                                           |
| ----------- | -------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| forfettario | `excluded`           | any                                | `n1`                                                                                                            |
| forfettario | anything else        | any                                | `n2.2` (warning `it.forfettario.treatment-ignored` for `exempt`/`out-of-scope`: the regime already removes VAT) |
| ordinario   | `excluded`           | any                                | `n1` + note `it.note.art15`                                                                                     |
| ordinario   | `exempt`             | any                                | `n4` + note `it.note.exempt` (reference from the line, default "art. 10 del DPR n. 633/1972")                   |
| ordinario   | `out-of-scope`       | any                                | `n2.2` + note `it.note.out-of-scope` (reference from the line)                                                  |
| ordinario   | `standard` or `rate` | `business` with `country !== 'IT'` | `n2.1` + note `it.note.reverse-charge-eu` (EU country per the parameter list) or `it.note.outside-eu`           |
| ordinario   | `standard`           | otherwise                          | `vat-22`                                                                                                        |
| ordinario   | `rate`               | otherwise                          | `vat-<rate>`                                                                                                    |

Legal notes are one per kind: when several exempt (or out-of-scope) lines carry references, the
distinct references are joined with "; " in line order into the single `{reference}` parameter.

Warnings: `it.forfettario.foreign-business-client` (forfettario, business client outside Italy:
see [open point 6](#14-open-legal-points)); `it.client.eu-business-without-vat-id` (ordinario,
reverse charge without a VAT id); `it.goods-lines` (info: goods are excluded from contribution and
withholding bases).

Sources:

- Forfettario, no VAT on domestic operations: **L. 190/2014, art. 1, c. 58, lett. a)** ("non
  esercitano la rivalsa dell'imposta di cui all'articolo 18 del DPR 633/1972, per le operazioni
  nazionali") [O]; FatturaPA natura **N2.2** "non soggette – altri casi" for forfettari, Agenzia
  delle Entrate, _Fattura elettronica per i forfettari_ [O].
- VAT standard rate 22 %: **DPR 633/1972, art. 16, c. 1** [S]; reduced rates 4 %, 5 %, 10 %:
  **Tabella A, parti II, II-bis, III** [S], unchanged in 2026 [S].
- Disbursements: **DPR 633/1972, art. 15, c. 1, n. 3** (sums paid in the name and on behalf of the
  client, duly documented, are excluded from the VAT base) [S; pinpoint n. 3 TBV]; natura **N1**
  [S].
- Exempt operations: **DPR 633/1972, art. 10** [S]; natura **N4** [S].
- Services to business clients abroad: place of supply **DPR 633/1972, art. 7-ter** [S]; invoice
  annotation **art. 21, c. 6-bis**: "inversione contabile" for a taxable person liable in another
  EU member state (lett. a), "operazione non soggetta" for supplies outside the EU (lett. b) [S];
  natura **N2.1** "non soggette ai sensi degli artt. da 7 a 7-septies" [S].

### 7.2 `it.common.general-expenses` (lawyers' _spese generali_)

- **Base:** per group, the `service` lines (the fee, _compenso_).
- **Amount:** `rate` (configured, else the parameter, 15 %) of the base, `halfUp` per group. Kind
  `surcharge`, adds to the total, allocated to the same groups as the fees (so it follows their
  VAT treatment).
- It is part of the fee: it enters the cassa base, the VAT base and the withholding base.
- **Sources:** **DM 10 marzo 2014, n. 55, art. 2, c. 2**: flat reimbursement of general expenses
  of 15 % of the total fee; the 2022 amendment (**DM 147/2022**) replaced "di regola" with "nella
  misura del 15 per cento", as reported by the Consiglio Nazionale Forense (parere n. 38/2024) [S].
  Inclusion in the CPA, VAT and withholding bases: consistent professional practice [S]; the
  withholding treatment follows from the Agenzia's rule that only analytically documented
  disbursements in the client's name are excluded from the withholding base [O].

### 7.3 `it.common.cassa` (_contributo integrativo_)

- **Base:** per group, lines of kind `service`, `expense`, `mileage` that are not `excluded`
  (the fees and fee-like reimbursements that form the VAT turnover), plus the allocations of
  `it.general-expenses`.
- **Amount:** the preset or configured rate, `halfUp` per group. Kind `contribution`, adds to the
  total, `exportCodes: { "fatturapa.TipoCassa": <TC>, "fatturapa.Ritenuta": "NO" }`.
- **VAT:** subject to VAT in ordinario (it is allocated to the fees' groups). Source: the
  contributo integrativo was made subject to VAT by **DL 41/1995, art. 16** (conv. L. 85/1995),
  as recounted by the Corte costituzionale, **ord. 156/1997** [S].
- **Withholding:** not part of the withholding base. Source: Agenzia delle Entrate, _F24
  Ritenute reddito lavoro autonomo – Importi su cui si applica la ritenuta_: the base excludes
  "l'eventuale rivalsa per la cassa nazionale dell'ordine professionale" [O].
- **Forfettario:** still charged (no VAT); not revenue for the ceiling [S].

Presets (parameter `cassa`, versioned; the user can override the rate):

| Preset          | Fund           | Profession                                                           | Rate                                     | Mark                             | TipoCassa    | Mark  |
| --------------- | -------------- | -------------------------------------------------------------------- | ---------------------------------------- | -------------------------------- | ------------ | ----- |
| `cassa-forense` | Cassa Forense  | lawyers                                                              | 4 %                                      | [S] (L. 576/1980 art. 11: [TBV]) | TC01         | [S]   |
| `cnpadc`        | CNPADC         | _dottori commercialisti_                                             | 4 %                                      | [S]                              | TC02         | [TBV] |
| `cipag`         | CIPAG          | _geometri_                                                           | 5 %                                      | [S]                              | TC03         | [TBV] |
| `inarcassa`     | Inarcassa      | engineers, architects                                                | 4 %                                      | [S]                              | TC04         | [TBV] |
| `cnpr`          | CNPR           | _ragionieri_                                                         | 4 %                                      | [S]                              | TC06         | [TBV] |
| `enpacl`        | ENPACL         | labour consultants                                                   | 4 %                                      | [S] (single source)              | TC08         | [TBV] |
| `eppi`          | EPPI           | _periti industriali_                                                 | 5 %                                      | [TBV]                            | TC17         | [S]   |
| `epap`          | EPAP           | multi-profession fund (agronomists, geologists, chemists, actuaries) | 4 %                                      | [TBV]                            | TC18         | [S]   |
| `enpab`         | ENPAB          | biologists                                                           | 4 %                                      | [TBV]                            | TC19         | [TBV] |
| `enpapi`        | ENPAPI         | nurses                                                               | 4 % (2 % towards public administrations) | [S] (single source)              | TC20         | [TBV] |
| `enpap`         | ENPAP          | psychologists                                                        | 2 %                                      | [S]                              | TC21         | [S]   |
| `custom`        | any other fund |                                                                      | user-defined                             |                                  | user-defined |       |

Notes: a preset whose rate is [TBV] emits the info warning `it.cassa.rate-to-be-verified`. ENPAP
was studying, in February 2026, an increase of its integrative rate to 4 % or 5 % from 2027 [S]:
when approved, it becomes a new parameter version. Reduced rates towards public administrations
(ENPAPI 2 %) are not automated: use `rate` or a separate configuration.

### 7.4 `it.common.inps-rivalsa`

- **Base:** per group, lines of kind `service`, `expense`, `mileage` that are not `excluded`,
  plus `it.general-expenses` allocations (normally absent: lawyers are in Cassa Forense).
- **Amount:** `rate` (default 4 %) of the base, `halfUp` per group. Kind `contribution`, adds to
  the total, `exportCodes: { "fatturapa.TipoCassa": "TC22", "fatturapa.Ritenuta": "SI" | "NO" }`,
  with `SI` exactly when `it.ordinario.withholding` will withhold (ordinario, withholding enabled,
  client is a withholding agent; computable from the context before rule 6 runs).
- **Sources:** optional charge of 4 % of gross fees by professionals in the Gestione Separata,
  **L. 23 dicembre 1996, n. 662, art. 1, c. 212** [S].
- **Ordinario, VAT:** part of the VAT base (allocated to the fees' groups) — it is part of the
  consideration (**DPR 633/1972, art. 13**) [S].
- **Ordinario, withholding:** part of the withholding base. Agenzia delle Entrate, _F24 Ritenute
  reddito lavoro autonomo – Importi su cui si applica la ritenuta_: "è soggetto a ritenuta il
  contributo Inps addebitato al cliente (4%) da parte di lavoratori autonomi iscritti alla
  gestione separata Inps" [O]. Secondary sources also cite a ministerial resolution n. 109/E,
  with inconsistent years (1996/2002) [TBV]; the code cites the Agenzia page.
- **Forfettario:** no VAT and no withholding; the rivalsa is part of the fees and counts towards
  the revenue ceiling (cash basis) [S]. No official ruling was found stating it expressly [TBV for
  an official confirmation].

### 7.5 `it.ordinario.vat`

- One `tax` component `it.vat` with one allocation per taxable group (`vat-22`, `vat-10`, ...):
  `percentage(groupBase, rate, halfUp)`. The group base includes the lines, the general expenses,
  the cassa contribution and the INPS rivalsa allocated to it. `rate` is set on the component only
  when there is a single taxable group.
- Computed **per rate on the summary** (FatturaPA `DatiRiepilogo`: tax = taxable amount × rate,
  per rate/nature), amounts rounded to the cent. The obligation to state rate, tax and taxable
  amount "con arrotondamento al centesimo di euro" is in **DPR 633/1972, art. 21, c. 2, lett. l)**
  [TBV: wording recalled, not re-read]. Half-cent ties round up (`halfUp`), consistent with the
  euro rounding rule of **Reg. (CE) 1103/97, art. 5** [S] and universal practice. FatturaPA's exact
  tolerance on `Imposta` (error 00421) is to be confirmed in phase 10 [TBV].
- No VAT component when there is no taxable group (the trace says so).

### 7.6 `it.ordinario.withholding` (_ritenuta d'acconto_)

- **Applies** when the client is a withholding agent (`client.isWithholdingAgent`). Otherwise the
  trace says "no withholding: the client is not a withholding agent (sostituto d'imposta)".
  Warning `it.withholding.foreign-agent` when a client outside Italy is flagged as an agent.
- **Base:** lines of kind `service`, `expense`, `mileage` in any non-`excluded` group (exempt and
  non-subject fees are still fees) + `it.general-expenses` + `it.inps-rivalsa`; **not** the cassa
  contribution, VAT, art. 15 disbursements, goods or stamp duty. Then `baseShare` (default 100 %):
  `base = multiply(gross, baseShare / 100, halfUp)`.
- **Amount:** `percentage(base, rate, halfUp)` with `rate` from the config or the parameter (20 %).
  Kind `withholding`, effect `deducted-from-payable`,
  `exportCodes: { "fatturapa.TipoRitenuta": "RT01" | "RT02", "fatturapa.CausalePagamento": "A" }`.
  Sets the fact `withholdingApplied = true`.
- **Sources:** 20 % on the taxable part of fees for _lavoro autonomo_ paid by withholding agents,
  **DPR 600/1973, art. 25, c. 1** [O] (the Agenzia's F24 page states 20 % for residents); base
  inclusions and exclusions per the same Agenzia page: included the 4 % INPS contribution and
  reimbursements of expenses (including documented expenses advanced by the professional),
  excluded statutory social-security contributions borne by the payer, the cassa's rivalsa and
  sums advanced in the client's name and on the client's behalf when analytically documented [O].
  Agents: **art. 25-bis** (23 % on 50 % of commissions, or 20 % with employees) [S].

### 7.7 `it.forfettario.no-vat` and `it.forfettario.no-withholding`

- `it.forfettario.no-vat` adds the legal note `it.note.forfettario` (or the custom
  `wording.vat`): "Operazione effettuata in regime forfettario ai sensi dell'articolo 1, commi da
  54 a 89, della Legge n. 190/2014 e successive modificazioni." This is the wording the Agenzia
  delle Entrate suggests for the e-invoice _Causale_ [O]. Sources: L. 190/2014 art. 1 c. 58
  lett. a) [O]; Agenzia, _Fattura elettronica per i forfettari_ [O].
- `it.forfettario.no-withholding` adds `it.note.forfettario-no-withholding` (or
  `wording.noWithholding`) according to `noWithholdingNote`: "Si richiede la non applicazione
  della ritenuta alla fonte a titolo d'acconto ai sensi dell'articolo 1, comma 67, della Legge n.
  190/2014." Source: **L. 190/2014, art. 1, c. 67**: fees of the regime are not subject to
  withholding; the taxpayer gives the withholding agent a declaration that the income is subject
  to the substitute tax [O]. The Agenzia's guide asks professionals not subject to withholding to
  add a second _Causale_ referring to comma 67 [O]; the exact sentence is not prescribed by law
  (practice, [S]), hence the custom wording option.

### 7.8 `it.common.stamp-duty` (_imposta di bollo_)

- **Amount not subject to VAT** = Σ base of the groups whose treatment is not `taxable`
  (`n1`, `n2.1`, `n2.2`, `n4`), computed before the duty itself is added. For a forfettario
  invoice that is the whole document; for an ordinario invoice it is only the VAT-free part.
- **Due** when that amount is **greater than €77.47** (equal to €77.47 is not enough); amount
  **€2.00**.
- **Charged** (`charge: 'client'`, or option `charge`): component `it.stamp-duty`, kind
  `stamp-duty`, adds to the total, allocated to `n2.2` in forfettario (the recharged duty is part
  of the fee, Risposta 428/2022) and to `n1` in ordinario (practice: shown as an art. 15 recharge,
  see [open point 3](#14-open-legal-points)); the rule registers that group when no line uses it.
  Not part of any contribution or withholding base.
- **Absorbed** (`charge: 'absorbed'`, option `absorb`, and always for **credit notes**, warning
  `it.stamp-duty.credit-note-absorbed`): informational component, the total is unchanged.
- In both cases the legal note `it.note.stamp-duty` (virtual payment) and
  `exportCodes: { "fatturapa.BolloVirtuale": "SI", "fatturapa.ImportoBollo": "2.00" }`.
- **Sources:**
  - €2 per copy on invoices and similar documents: **DPR 642/1972, Tariffa (allegato A), parte I,
    art. 13, c. 1** [O] (Risposta 129/2024); amount raised from €1.81 to €2.00 for documents
    formed from 26 June 2013 by **DL 43/2013, art. 7-bis, c. 3** (conv. L. 71/2013) [S].
  - Not due when the sum does not exceed L. 150,000 = **€77.47**: **nota 2, lett. a)** to art. 13
    [O] (Risposta 45/2024).
  - Exemption of invoices for operations subject to VAT: **Tabella (allegato B), art. 6** [O]
    (Risposta 21/2020).
  - Mixed invoices: due when the VAT-free components together exceed €77.47: **Risoluzione
    98/E del 3 luglio 2001** [O] (cited in Risposta 45/2024); disbursements (art. 15) count,
    **Risposta 491/2021** [S, official text not read].
  - E-invoices: virtual payment, quarterly, under **DM 17 giugno 2014, art. 6** as amended by
    **DM 28 dicembre 2018** [S]; F24 codes 2521-2524, Risoluzione 42/E/2019 [S]. E-invoicing is
    mandatory for every forfettario taxpayer from 2024-01-01 (**DL 36/2022, art. 18**) [S].
  - Forfettario recharge is income: **Risposta n. 428 del 12 agosto 2022** [S, official text not
    read].

### 7.9 `it.ordinario.split-payment` (_scissione dei pagamenti_)

- **Runs** (`appliesTo`) in ordinario when the per-invoice option is not `skip` and either the
  option is `apply` or `splitPayment` is `auto` and the client is a `public-administration` with
  `country === 'IT'`. For any other client it is skipped silently.
- **Charges** the split payment when there is VAT (`taxTotal > 0`), withholding was **not**
  applied (`withholdingApplied = false`), and the issue date is on or before the parameter
  `splitPayment.authorisedUntil`; otherwise it adds a trace step explaining which condition failed.
- **Effect:** component `it.split-payment`, kind `other`, `deducted-from-payable`, amount = the VAT
  total: the client pays the VAT to the State, so `netPayable = total − VAT (− withholding)`.
  Legal note `it.note.split-payment`; `exportCodes: { "fatturapa.EsigibilitaIVA": "S" }` [TBV].
- **Excluded** when withholding applies: **DPR 633/1972, art. 17-ter, c. 1-sexies**, added by **DL
  87/2018** (in force 14 July 2018): split payment does not apply to services whose fees are
  subject to withholding under art. 25 DPR 600/1973 [S]. The trace says so (this is the normal
  case for professionals invoicing a public administration).
- After `authorisedUntil` the rule does not apply and warns `it.split-payment.authorisation-expired`.
- **Sources:** **DPR 633/1972, art. 17-ter** [S]; EU authorisation extended to **30 June 2029** by
  **Council Implementing Decision (EU) 2026/1728** of 10 July 2026 (OJ 15 July 2026), effective
  from 1 July 2026, announced by the Ministry of Economy and Finance [O].

---

## 8. Rounding policy

| What                                  | Mode         | Where                                           | Step  |
| ------------------------------------- | ------------ | ----------------------------------------------- | ----- |
| Line total (`quantity × unitPrice`)   | `halfUp`     | per line                                        | €0.01 |
| General expenses, cassa, INPS rivalsa | `halfUp`     | once per tax group (normally one)               | €0.01 |
| VAT                                   | `halfUp`     | once per rate, on the summary (`DatiRiepilogo`) | €0.01 |
| Withholding                           | `halfUp`     | once on the document's withholding base         | €0.01 |
| Stamp duty                            | fixed amount | per document                                    |       |

Totals are sums of rounded amounts, so the document always reconciles: `total = Σ lines +
general expenses + cassa/rivalsa + VAT + charged stamp duty`; `netPayable = total − withholding −
split-payment VAT`. Legal basis: amounts on invoices are stated to the cent (DPR 633/1972 art. 21
c. 2 lett. l) [TBV]); half-up is the euro rounding convention (Reg. CE 1103/97 art. 5) [S]. There
is no statutory rule on _where_ intermediate rounding happens; per-rate VAT on the summary matches
FatturaPA's structure [S].

Rounding example (ordinario, INPS rivalsa, withholding agent): fees €333.33; rivalsa 4 % =
13.3332 -> **€13.33**; VAT base €346.66 × 22 % = 76.2652 -> **€76.27**; withholding 20 % of
€346.66 = 69.332 -> **€69.33**; total €422.93; net payable **€353.60**.

Tie example (ordinario, no social security, private client): fee €12.75; VAT 22 % = 2.805 ->
**€2.81** (`halfUp`; `halfEven` would give €2.80); total €15.56.

---

## 9. Worked examples

All examples are dated 2026-03-15 (parameter version `it-2026-07-01` does not apply yet, so
`it-2023-01-01` is used) and invoice 20 hours at €50.00 = **€1,000.00** of fees unless stated
otherwise. Each becomes a golden fixture (section 16).

### (a) Forfettario, INPS rivalsa, stamp duty charged — total €1,042.00

Config: `{ regime: 'forfettario', socialSecurity: { kind: 'inps-gestione-separata', rivalsa: true }, stampDuty: { charge: 'client' } }`; client: Italian business, withholding agent.

| Step | Rule                            | Computation                                                                   | Amount       |
| ---- | ------------------------------- | ----------------------------------------------------------------------------- | ------------ |
| 1    | core                            | 20 h × €50.00                                                                 | 1,000.00     |
| 2    | `it.common.classify-lines`      | line -> `n2.2` (no VAT, forfettario)                                          |              |
| 3    | `it.common.inps-rivalsa`        | 4 % × 1,000.00                                                                | 40.00        |
| 4    | `it.forfettario.no-vat`         | note "Operazione effettuata in regime forfettario..."                         |              |
| 5    | `it.forfettario.no-withholding` | note "Si richiede la non applicazione della ritenuta..." (client is an agent) |              |
| 6    | `it.common.stamp-duty`          | not subject to VAT 1,040.00 > 77.47 -> charged                                | 2.00         |
| 7    | core                            | total = 1,000.00 + 40.00 + 2.00                                               | **1,042.00** |
| 8    | core                            | net payable (no withholding)                                                  | **1,042.00** |

Summary: `n2.2` base 1,042.00, tax 0.00. Taxable base 1,040.00. Countable revenue for the
ceiling: 1,042.00.

### (b) Ordinario, INPS rivalsa, VAT, withholding — total €1,268.80, net €1,060.80

Config: `{ regime: 'ordinario', socialSecurity: { kind: 'inps-gestione-separata', rivalsa: true } }` (defaults: withholding enabled, 20 %); client: Italian business, withholding agent.

| Step | Rule                       | Computation                      | Amount       |
| ---- | -------------------------- | -------------------------------- | ------------ |
| 1    | core                       | 20 h × €50.00                    | 1,000.00     |
| 2    | `it.common.classify-lines` | line -> `vat-22`                 |              |
| 3    | `it.common.inps-rivalsa`   | 4 % × 1,000.00                   | 40.00        |
| 4    | `it.ordinario.vat`         | 22 % × 1,040.00                  | 228.80       |
| 5    | `it.ordinario.withholding` | 20 % × (1,000.00 + 40.00)        | 208.00       |
| 6    | `it.common.stamp-duty`     | not subject to VAT 0.00: not due |              |
| 7    | core                       | total = 1,040.00 + 228.80        | **1,268.80** |
| 8    | core                       | net payable = 1,268.80 − 208.00  | **1,060.80** |

### (c) Lawyer, ordinario: spese generali, CPA, VAT, withholding — total €1,459.12, net €1,229.12

Config: `{ regime: 'ordinario', socialSecurity: { kind: 'cassa', preset: 'cassa-forense' }, generalExpenses: { rate: '15' } }`; client: Italian business, withholding agent.

| Step | Rule                         | Computation                                   | Amount       |
| ---- | ---------------------------- | --------------------------------------------- | ------------ |
| 1    | core                         | fee                                           | 1,000.00     |
| 2    | `it.common.classify-lines`   | line -> `vat-22`                              |              |
| 3    | `it.common.general-expenses` | 15 % × 1,000.00                               | 150.00       |
| 4    | `it.common.cassa`            | CPA 4 % × (1,000.00 + 150.00)                 | 46.00        |
| 5    | `it.ordinario.vat`           | 22 % × (1,000.00 + 150.00 + 46.00 = 1,196.00) | 263.12       |
| 6    | `it.ordinario.withholding`   | 20 % × (1,000.00 + 150.00) (CPA excluded)     | 230.00       |
| 7    | `it.common.stamp-duty`       | not subject to VAT 0.00: not due              |              |
| 8    | core                         | total = 1,196.00 + 263.12                     | **1,459.12** |
| 9    | core                         | net payable = 1,459.12 − 230.00               | **1,229.12** |

### (d) Ordinario, private client — total and net €1,268.80

As (b), but the client is an `individual`, not a withholding agent.

| Step | Rule                       | Computation                                        | Amount       |
| ---- | -------------------------- | -------------------------------------------------- | ------------ |
| 3    | `it.common.inps-rivalsa`   | 4 % × 1,000.00                                     | 40.00        |
| 4    | `it.ordinario.vat`         | 22 % × 1,040.00                                    | 228.80       |
| 5    | `it.ordinario.withholding` | not applied: the client is not a withholding agent |              |
| 7    | core                       | total                                              | **1,268.80** |
| 8    | core                       | net payable                                        | **1,268.80** |

### (e) Ordinario with €100.00 of art. 15 disbursements — stamp duty applies

As (b), plus a line of kind `reimbursement` (court fee paid in the client's name) of €100.00.

| Step | Rule                       | Computation                                          | Amount           |
| ---- | -------------------------- | ---------------------------------------------------- | ---------------- |
| 1    | core                       | fees; disbursement                                   | 1,000.00; 100.00 |
| 2    | `it.common.classify-lines` | fees -> `vat-22`; disbursement -> `n1`, note art. 15 |                  |
| 3    | `it.common.inps-rivalsa`   | 4 % × 1,000.00 (disbursement excluded)               | 40.00            |
| 4    | `it.ordinario.vat`         | 22 % × 1,040.00                                      | 228.80           |
| 5    | `it.ordinario.withholding` | 20 % × 1,040.00 (disbursement excluded)              | 208.00           |
| 6    | `it.common.stamp-duty`     | not subject to VAT 100.00 > 77.47 -> charged, `n1`   | 2.00             |
| 7    | core                       | total = 1,000.00 + 100.00 + 40.00 + 228.80 + 2.00    | **1,370.80**     |
| 8    | core                       | net payable = 1,370.80 − 208.00                      | **1,162.80**     |

Summary: `vat-22` base 1,040.00 tax 228.80; `n1` base 102.00 tax 0.00. Taxable base 1,040.00.

### (f) Forfettario at and above the stamp threshold

No social security, stamp charged. Fee €77.47: not subject to VAT 77.47 is **not greater** than
77.47, no duty, total **€77.47**. Fee €77.48: duty due, total **€79.48**.

### (g) Lawyer, forfettario — total €1,198.00

Config: forfettario, Cassa Forense, general expenses 15 %, stamp charged. Fee 1,000.00 + spese
generali 150.00 + CPA 4 % × 1,150.00 = 46.00 + stamp 2.00 = **€1,198.00**; no VAT, no
withholding. Countable revenue: 1,000.00 + 150.00 + 2.00 = 1,152.00 (CPA excluded).

### (h) Ordinario, business client in Germany (reverse charge) — total €2,082.00

Fees €2,000.00 (40 h × €50.00), INPS rivalsa, client `{ country: 'DE', kind: 'business',
isWithholdingAgent: false, vatId: 'DE123456789' }`. Lines -> `n2.1` with the note "Inversione
contabile..."; rivalsa 80.00 (allocated to `n2.1`); no VAT; not subject to VAT 2,080.00 > 77.47 ->
stamp 2.00 (`n1`); total **€2,082.00**; no withholding; net payable €2,082.00.

### (i) Public administration client

- Professional (withholding applies): as (b) with `kind: 'public-administration'`: withholding
  €208.00 applies, so split payment is **excluded** (art. 17-ter c. 1-sexies, trace step);
  total €1,268.80, net €1,060.80.
- Activity not subject to withholding (`withholding.enabled: false`, no social security): fee
  1,000.00, VAT 220.00, total €1,220.00, split payment €220.00 deducted, net payable **€1,000.00**,
  note "Scissione dei pagamenti...".

### (j) Credit note, forfettario

As (a) with `documentKind: 'credit-note'`: rivalsa 40.00; stamp duty €2.00 is informational
(absorbed, warning `it.stamp-duty.credit-note-absorbed`); total **€1,040.00** (positive
magnitudes; the document kind gives the direction).

---

## 10. Revenue tracker (forfettario ceiling)

Capability `annualThresholds` (TAX-007). Not applicable in ordinario (`status: 'not-applicable'`,
countable revenue zero).

- **Countable revenue of an invoice** (`countableRevenue`): lines that are not `excluded` +
  general expenses + INPS rivalsa + charged stamp duty; **excluding** the cassa contribution and
  art. 15 disbursements. Sources: L. 190/2014 c. 64 (income determined on fees _percepiti_) [S];
  rivalsa counts [S]; stamp recharge counts (Risposta 428/2022) [S]; the contributo integrativo
  is not income [S].
- **Cash basis:** receipts are counted by collection date. For the €100,000 limit the Agenzia
  confirmed the cash criterion (**Circolare 32/E del 5 dicembre 2023**, § 3.2) [O]. For
  businesses (not professionals) the €85,000 test may follow other criteria; the pack targets
  professionals [TBV for businesses].
- **Thresholds for year `Y`:**
  - `it.forfettario.ceiling`: €85,000 (from the parameter version in force on 1 January of
    `Y + 1`, because the test decides access for the following year); €65,000 for revenue years
    2019-2021. Exceeding it (strictly greater) means leaving the regime from the following year.
    Sources: **L. 190/2014, art. 1, c. 54, lett. a)**, as amended by **L. 145/2018** (€65,000) and
    **L. 197/2022** (€85,000, from 2023) [O via Circolare 32/E/2023].
  - `it.forfettario.immediate-exit`: €100,000, for years from 2023: exceeding it (strictly)
    ends the regime **in the same year**, and VAT is due from the operation that makes the
    revenue exceed the limit. Source: **L. 190/2014, art. 1, c. 71**, second and third periods,
    added by **L. 197/2022** [O via Circolare 32/E/2023].
- **First year:** if `activityStartDate` falls in `Y`, the €85,000 ceiling is pro-rated:
  `85,000 × days / 365` (days from the start date to 31 December inclusive, `halfUp` to the cent),
  as in the Circolare's example (1 March 2023 -> 306 days -> about €71,260) [S]. The €100,000
  limit is **not** pro-rated [S]. Whether leap years use 366 is [TBV].
- **Status:** `immediate-exit` if above €100,000 (with `crossedOn` = the date of the receipt that
  crossed it); else `exceeded` if above the ceiling; else `approaching` if at or above
  `warningRatio` (default 80 %) of the ceiling; else `ok`. Each status comes with an explanation
  trace and its sources.

---

## 11. Parameter timeline

Parameters are full snapshots; a new version copies the previous one and changes what the law
changed. Invoices dated before 2019-01-01 are refused (`ParameterNotFoundError`): Fairhour does
not target them.

| Version         | Effective from | Changes                                                                                                                                                                                                                                                                                 | Sources                                                                                                                                                                                                                                                                                |
| --------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `it-2019-01-01` | 2019-01-01     | Baseline. VAT 22 % (allowed 22/10/5/4). Withholding 20 %. INPS rivalsa max 4 %. Stamp duty €2.00 above €77.47. Forfettario ceiling €65,000, no in-year exit. General expenses 15 %. Cassa presets (table 7.3). EU member states: EU-27 + GB. Split payment authorised until 2026-06-30. | DPR 633/1972 art. 16 [S]; DPR 600/1973 art. 25 [O]; L. 662/1996 c. 212 [S]; DPR 642/1972 Tariffa art. 13 [O] and DL 43/2013 art. 7-bis c. 3 [S]; L. 145/2018 art. 1 cc. 9-11 [S, pinpoint TBV]; DM 55/2014 art. 2 c. 2 [S]; split payment end date under Decision (EU) 2023/1552 [TBV] |
| `it-2021-01-01` | 2021-01-01     | United Kingdom removed from the EU list (end of the Brexit transition period on 2020-12-31; Northern Ireland's special status concerns goods, not services).                                                                                                                            | EU-UK Withdrawal Agreement art. 126 [TBV pinpoint]                                                                                                                                                                                                                                     |
| `it-2023-01-01` | 2023-01-01     | Forfettario ceiling €85,000; immediate exit above €100,000.                                                                                                                                                                                                                             | L. 197/2022 (amending L. 190/2014 art. 1 cc. 54 and 71) [O via Circolare 32/E/2023]; pinpoint in L. 197/2022 art. 1 c. 54 [TBV]                                                                                                                                                        |
| `it-2026-07-01` | 2026-07-01     | Split payment authorised until 2029-06-30.                                                                                                                                                                                                                                              | Council Implementing Decision (EU) 2026/1728 [O]                                                                                                                                                                                                                                       |

Constants not versioned because they did not change since 2019: the €77.47 threshold (L. 150,000
converted), the 15 % lawyers' rate (DM 147/2022 changed "di regola" into a fixed measure, not
the value), the 20 % withholding, the VAT rates. Watch items: ENPAP integrative rate from 2027;
any budget law changing the forfettario limits (the 2026 budget law kept €85,000 [S]).

`ItParams` shape:

```ts
interface ItParams {
  readonly vat: { readonly standardRate: Decimal; readonly allowedRates: readonly Decimal[] };
  readonly withholding: { readonly professionalRate: Decimal };
  readonly inpsRivalsa: { readonly maxRate: Decimal };
  readonly stampDuty: { readonly amount: Money; readonly threshold: Money };
  readonly forfettario: { readonly ceiling: Money; readonly immediateExit: Money | null };
  readonly generalExpenses: { readonly rate: Decimal };
  readonly cassa: Readonly<
    Record<
      Exclude<CassaPresetId, "custom">,
      {
        readonly name: string;
        readonly rate: Decimal;
        readonly tipoCassa: string;
        readonly rateVerified: boolean;
      }
    >
  >;
  readonly euCountries: readonly CountryCode[];
  readonly splitPayment: { readonly authorisedUntil: IsoDate };
}
```

---

## 12. Wording (messages)

Legal notes are printed in Italian (`documentLocale: 'it'`); the English text is a translation
for reading. Users can replace the two forfettario notes with their own wording.

| Key                                  | Italian (printed on the document)                                                                                                                       | English                                                                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `it.note.forfettario`                | Operazione effettuata in regime forfettario ai sensi dell'articolo 1, commi da 54 a 89, della Legge n. 190/2014 e successive modificazioni.             | Transaction under the flat-rate scheme (regime forfettario) pursuant to article 1, paragraphs 54 to 89, of Law no. 190/2014 as amended.               |
| `it.note.forfettario-no-withholding` | Si richiede la non applicazione della ritenuta alla fonte a titolo d'acconto ai sensi dell'articolo 1, comma 67, della Legge n. 190/2014.               | Please do not apply withholding tax: under article 1, paragraph 67, of Law no. 190/2014 this income is subject to a substitute tax.                   |
| `it.note.art15`                      | Spese anticipate in nome e per conto del cliente, escluse dalla base imponibile IVA ai sensi dell'articolo 15, primo comma, n. 3), del DPR n. 633/1972. | Expenses paid in the client's name and on the client's behalf, excluded from the VAT base under article 15(1)(3) of Presidential Decree no. 633/1972. |
| `it.note.exempt`                     | Operazione esente da IVA ({reference}).                                                                                                                 | VAT-exempt transaction ({reference}).                                                                                                                 |
| `it.note.out-of-scope`               | Operazione non soggetta a IVA ({reference}).                                                                                                            | Transaction outside the scope of VAT ({reference}).                                                                                                   |
| `it.note.reverse-charge-eu`          | Inversione contabile: operazione non soggetta a IVA in Italia ai sensi dell'articolo 7-ter del DPR n. 633/1972.                                         | Reverse charge: not subject to Italian VAT under article 7-ter of Presidential Decree no. 633/1972.                                                   |
| `it.note.outside-eu`                 | Operazione non soggetta ai sensi dell'articolo 7-ter del DPR n. 633/1972.                                                                               | Not subject to VAT under article 7-ter of Presidential Decree no. 633/1972.                                                                           |
| `it.note.stamp-duty`                 | Imposta di bollo assolta in modo virtuale ai sensi dell'articolo 6 del DM 17 giugno 2014.                                                               | Stamp duty paid virtually under article 6 of the Ministerial Decree of 17 June 2014.                                                                  |
| `it.note.split-payment`              | Scissione dei pagamenti ai sensi dell'articolo 17-ter del DPR n. 633/1972.                                                                              | Split payment under article 17-ter of Presidential Decree no. 633/1972.                                                                               |
| `it.note.custom`                     | {text}                                                                                                                                                  | {text}                                                                                                                                                |
| `meta.disclaimer`                    | Gli importi sono indicativi e vanno verificati con il proprio commercialista prima di emettere la fattura.                                              | Figures are informational and must be verified with your accountant before you issue an invoice.                                                      |

Other key families (both locales required): `meta.name`, `meta.description`,
`it.rule.<rule-id-suffix>.title`, `it.trace.*` (one per outcome, e.g.
`it.trace.withholding.not-agent`), `it.formula.*` (`"{rate} × {base} = {amount}"`),
`it.group.*` (summary labels such as "IVA 22%" / "VAT 22%", "N2.2 – Non soggetta (forfettario)"),
`it.component.*`, `it.warning.*`, `it.issue.*`, `it.threshold.*`, `it.rounding.description`.

---

## 13. FatturaPA mapping (phase 10)

The computation carries `exportCodes` so that the XML generator (FPA-002) needs no tax logic.
Codes from the FatturaPA technical specifications (version 1.9 in force since 1 April 2025 [S];
1.9.1 published on the Agenzia site [O]); confirm every table against the vendored XSD and
specification in phase 10.

| Concept            | FatturaPA field                    | Value                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------ | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Regime             | `RegimeFiscale`                    | `RF01` ordinario [TBV], `RF19` forfettario [S]                                                                                                                                                                                                                                                                                                                                            |
| Forfettario lines  | `Natura`                           | `N2.2` [O]                                                                                                                                                                                                                                                                                                                                                                                |
| Foreign B2B        | `Natura`                           | `N2.1` [S]                                                                                                                                                                                                                                                                                                                                                                                |
| Art. 15            | `Natura`                           | `N1` [S]                                                                                                                                                                                                                                                                                                                                                                                  |
| Exempt             | `Natura`                           | `N4` [S]                                                                                                                                                                                                                                                                                                                                                                                  |
| INPS rivalsa       | `DatiCassaPrevidenziale/TipoCassa` | `TC22` [S], `Ritenuta` = `SI` in ordinario with withholding                                                                                                                                                                                                                                                                                                                               |
| Cassa              | `TipoCassa`                        | TC01 Cassa Forense [S] · TC02 CNPADC · TC03 CIPAG · TC04 Inarcassa · TC05 Notariato · TC06 CNPR · TC07 ENASARCO · TC08 ENPACL · TC09 ENPAM · TC10 ENPAF · TC11 ENPAV · TC12 ENPAIA · TC13 Fondo spedizionieri e agenzie marittime · TC14 INPGI · TC15 ONAOSI · TC16 CASAGIT · TC17 EPPI [S] · TC18 EPAP [S] · TC19 ENPAB · TC20 ENPAPI · TC21 ENPAP [S] · TC22 INPS [S] (unmarked: [TBV]) |
| Withholding        | `DatiRitenuta/TipoRitenuta`        | `RT01` natural persons, `RT02` legal persons [S] (RT03-RT06 are social-security withholdings, not used)                                                                                                                                                                                                                                                                                   |
| Withholding reason | `CausalePagamento`                 | `A` (habitual self-employed professional services) [S]                                                                                                                                                                                                                                                                                                                                    |
| Stamp duty         | `DatiBollo`                        | `BolloVirtuale` = `SI`, `ImportoBollo` = `2.00` [S]                                                                                                                                                                                                                                                                                                                                       |
| Split payment      | `EsigibilitaIVA`                   | `S` [TBV]                                                                                                                                                                                                                                                                                                                                                                                 |
| Credit note        | `TipoDocumento`                    | `TD04` [TBV]                                                                                                                                                                                                                                                                                                                                                                              |

---

## 14. Open legal points

Everything below is implemented with the conservative or most common behaviour and flagged in the
code (`to-be-verified` sources, warnings).

1. **Primary texts not read.** Normattiva could not be reached; L. 190/2014, DPR 633/1972, DPR
   600/1973, DPR 642/1972, L. 662/1996, DM 55/2014 were verified through official summaries or
   secondary sources only. Read the consolidated texts before the first release.
2. **Rivalsa INPS at less than 4 %.** Comma 212 is reported both as "nella misura del 4 %" and as
   "fino al 4 %". The pack accepts rates up to 4 % [TBV].
3. **Stamp duty recharged in ordinario.** Shown as an art. 15 recharge (N1, outside VAT and
   withholding), as most software does. Risposta 428/2022 treats the recharge as part of the fee
   (for forfettari); whether in ordinario it should enter the VAT base is unresolved [TBV].
4. **Pinpoint of art. 15** (c. 1, n. 3) and of **art. 21 c. 2 lett. l)** (rounding to the cent)
   recalled from memory [TBV].
5. **Ministerial resolution 109/E** on rivalsa and withholding: number and year inconsistent in
   secondary sources [TBV]; the Agenzia's F24 page is cited instead [O].
6. **Forfettario invoicing foreign business clients.** The pack uses N2.2 and the forfettario
   note for every client and warns. Whether art. 7-ter / 21 c. 6-bis annotations (N2.1,
   "inversione contabile") are also required is [TBV].
7. **Cassa rates and codes** marked [TBV] in 7.3 and 13 (EPPI 5 %, EPAP 4 %, ENPAB 4 %; TC02-TC16,
   TC19, TC20).
8. **Credit notes and stamp duty.** The duty is due on credit notes above the threshold (they are
   "note" under art. 13 [S]); always treating it as absorbed is a modelling choice [TBV].
9. **Pro-rating in leap years** (365 or 366 days) [TBV].
10. **Exact FatturaPA tolerances** for `Imposta` and `ImponibileImporto` [TBV, phase 10].
11. **Split payment end date in the 2019 version** (2026-06-30 under Decision (EU) 2023/1552,
    and earlier decisions before it): only the 2026/1728 extension was verified [TBV]. The
    simplification has no effect on invoices dated before 2026-07-01.
12. **Revenue counting for businesses** (ricavi conseguiti) versus professionals (compensi
    percepiti) for the €85,000 test [TBV].

---

## 15. Known limitations

- Self-employed professionals only: no sale-of-goods specifics (intra-EU supplies N3.x, exports,
  margin schemes), no e-commerce, no reverse charge received (purchases).
- Invoices in EUR only (`it.currency-not-eur`).
- Place of supply: only the general B2B rule (art. 7-ter). Exceptions (arts. 7-quater,
  7-quinquies, 7-sexies, 7-septies, for example consultancy to consumers outside the EU) must be
  set by hand with `treatment: { kind: 'out-of-scope', reference }`.
- Split payment is automatic only for Italian clients of kind `public-administration`; companies
  controlled by public bodies and listed companies need the per-invoice option `apply`.
- Public administrations and private individuals outside Italy are invoiced with Italian VAT (the
  B2C rule); foreign public bodies identified for VAT, which art. 7-ter treats like businesses,
  must be entered as `business`.
- ENASARCO, ENPAM and other social-security withholdings (RT03-RT06) are not modelled; agents can
  set the withholding rate and base share only.
- One social-security scheme per configuration (INPS or one cassa). Professionals in two funds,
  cassa minimums and cassa rates that differ by client type are not modelled.
- Stamp-duty exemptions (for example disbursements that are taxes, Risposta 491/2021) need the
  per-invoice option `not-due`.
- No discounts or negative lines (see the engine design).
- Withholding certification (Certificazione Unica), payment deadlines, F24 and the annual
  return are out of scope.
- The _regime dei minimi_ (DL 98/2011), the _regime agevolato_ for new activities' 5 % rate and
  the substitute tax itself (5 %/15 % on the forfettario income) do not affect the invoice and are
  out of scope.

---

## 16. Test plan and golden fixtures

Table-driven unit tests, one file per rule, covering every row of the tables in sections 5 to 7
(regime × treatment × client kind/country × option), threshold boundaries (77.47 / 77.48;
ceiling and €100,000 at, just below and just above; first-year pro-rating), the four parameter
versions on their boundary dates, and every warning and issue code.

Property-based tests specific to the pack (fast-check, on top of the shared conformance suite):

- forfettario never has a `tax` or `withholding` component; ordinario never has the forfettario
  notes;
- ordinario withholding = 20 % × (fees + rivalsa + general expenses) within half a cent, and
  never includes the cassa or `n1` amounts;
- stamp duty is present iff the non-taxable base exceeds 77.47, and never changes VAT or
  withholding;
- `netPayable = total − withholding − split-payment` and split payment never coexists with
  withholding;
- countable revenue ≤ total, and equals total for a forfettario invoice without cassa and
  disbursements.

Golden fixtures (`packages/tax-pack-it/fixtures/invoices/`):

| Fixture                                    | Example                                                   |
| ------------------------------------------ | --------------------------------------------------------- |
| `forfettario-rivalsa-bollo-charged`        | (a)                                                       |
| `forfettario-no-rivalsa-bollo-absorbed`    | (a) without rivalsa, stamp absorbed: total 1,000.00       |
| `forfettario-bollo-at-threshold`           | (f) 77.47                                                 |
| `forfettario-bollo-above-threshold`        | (f) 77.48                                                 |
| `forfettario-below-threshold-with-rivalsa` | fee 74.00 + rivalsa 2.96 = 76.96: no duty                 |
| `forfettario-lawyer-cassa-forense`         | (g)                                                       |
| `forfettario-art15-disbursement`           | fee 500.00 + disbursement 50.00 (`n1`), duty on 550.00    |
| `forfettario-credit-note`                  | (j)                                                       |
| `ordinario-rivalsa-withholding`            | (b)                                                       |
| `ordinario-lawyer-cassa-forense`           | (c)                                                       |
| `ordinario-private-client`                 | (d)                                                       |
| `ordinario-art15-bollo`                    | (e)                                                       |
| `ordinario-rounding`                       | section 8, fees 333.33                                    |
| `ordinario-rounding-tie`                   | section 8, fee 12.75                                      |
| `ordinario-reduced-rate-mixed`             | a 22 % line and a 10 % line: two VAT allocations          |
| `ordinario-exempt-n4-bollo`                | exempt line 300.00: duty due                              |
| `ordinario-eu-business-reverse-charge`     | (h)                                                       |
| `ordinario-non-eu-business`                | client in `US`: note "operazione non soggetta"            |
| `ordinario-pa-withholding-no-split`        | (i) first case                                            |
| `ordinario-pa-split-payment`               | (i) second case                                           |
| `ordinario-agent-withholding-50`           | rate 23 %, base share 50 %                                |
| `ordinario-goods-line`                     | goods excluded from rivalsa and withholding               |
| `error-currency-usd`                       | `expectedError: unsupported-input`, `it.currency-not-eur` |
| `error-before-2019`                        | `expectedError: parameters-not-found`                     |
| `forfettario-2022-ceiling-version`         | dated 2022-06-01, parameters `it-2021-01-01`              |

---

## 17. Sources

Official (verification as marked in the text):

- Agenzia delle Entrate, _F24 Ritenute reddito lavoro autonomo – Importi su cui si applica la
  ritenuta_:
  <https://www.agenziaentrate.gov.it/portale/web/guest/schede/pagamenti/versamento-modello-f24-ritenute-su-reddito-di-lavoro-autonomo-f24_rit_red_lav_aut/importi-su-cui-si-applica-la-ritenuta-f24_rit_red_lav_aut>
- Agenzia delle Entrate, _Fattura elettronica per i forfettari_:
  <https://www.agenziaentrate.gov.it/portale/fattura-elettronica-per-i-forfettari>
- Agenzia delle Entrate, text of L. 190/2014, art. 1, cc. 54-89:
  <https://www.agenziaentrate.gov.it/portale/documents/20143/241330/commi+54_+89_LEGGE+23+dicembre+2014.pdf/e5221678-d627-821c-fc47-d3c5be04f123>
- Agenzia delle Entrate, Circolare 32/E del 5 dicembre 2023 (copy):
  <https://www.dirittobancario.it/wp-content/uploads/2023/12/Circolare-Agenzia-delle-Entrate-5-dicembre-2023-n.-32-E.pdf>
- Agenzia delle Entrate, guide _L'imposta di bollo sulle fatture elettroniche_:
  <https://www.agenziaentrate.gov.it/portale/documents/20143/3394067/Guida_Bollo_sulle_fatture_elettroniche.pdf/4aacfaa2-5ada-e8d5-8f1c-6b61f25923a8>
- Agenzia delle Entrate, Risposta n. 21/2020:
  <https://www.agenziaentrate.gov.it/portale/documents/20143/2316552/Risposta+n.+21+del+2020.pdf/24c3fc56-4aac-f5eb-79e8-a46850e0bbb0>
- Agenzia delle Entrate, Risposta n. 491/2021:
  <https://www.agenziaentrate.gov.it/portale/documents/20143/0/Risposta_491_20.07.2021.pdf/c0a023c7-7c30-1e11-8cf8-16460212d92a>
- Agenzia delle Entrate, Risposta n. 45/2024:
  <https://www.agenziaentrate.gov.it/portale/documents/20143/5866231/Risposta+n.+45_2024.pdf/42d7fe7c-9cd8-baec-772c-365eac09e3c8>
- Agenzia delle Entrate, Risposta n. 129/2024:
  <https://www.agenziaentrate.gov.it/portale/documents/20143/6193302/Risposta+n.+129_2024.pdf/8bcec98d-1b64-d4d8-1dd8-2d4ee1e9f786>
- DPR 642/1972, Tariffa, art. 13 (Ministry of Economy and Finance documentation centre):
  <https://def.finanze.it/DocTribFrontend/getContent.do?id=%7B0C8651F4-4C34-4F0F-82C2-538A2E4FC576%7D>
- Agenzia delle Entrate, FatturaPA technical specifications 1.9.1, Allegato A:
  <https://www.agenziaentrate.gov.it/portale/documents/d/guest/allegato-a-specifiche-tecniche-vers-1-9-1>
- Ministry of Economy and Finance, _Pubblicata la decisione di proroga dello Split Payment_:
  <https://www.finanze.gov.it/it/archivi/notizie/dettaglio-notizie/Pubblicata-la-decisione-di-proroga-dello-Split-Payment/>
- Corte costituzionale, ordinanza 156/1997: <https://www.cortecostituzionale.it/scheda-pronuncia/1997/156>
- Council Directive 2006/112/EC (VAT Directive): <https://eur-lex.europa.eu/eli/dir/2006/112/oj>

Statutes (canonical Normattiva URN links; not fetched from the research environment):

- L. 23 dicembre 2014, n. 190: <https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:legge:2014-12-23;190>
- DPR 26 ottobre 1972, n. 633: <https://www.normattiva.it/uri-res/N2Ls?urn:nir:presidente.repubblica:decreto:1972-10-26;633>
- DPR 29 settembre 1973, n. 600: <https://www.normattiva.it/uri-res/N2Ls?urn:nir:presidente.repubblica:decreto:1973-09-29;600>
- DPR 26 ottobre 1972, n. 642: <https://www.normattiva.it/uri-res/N2Ls?urn:nir:presidente.repubblica:decreto:1972-10-26;642>
- L. 23 dicembre 1996, n. 662: <https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:legge:1996-12-23;662>
- L. 30 dicembre 2018, n. 145: <https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:legge:2018-12-30;145>
- L. 29 dicembre 2022, n. 197: <https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:legge:2022-12-29;197>
- DL 26 aprile 2013, n. 43: <https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legge:2013-04-26;43>
- DL 12 luglio 2018, n. 87: <https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legge:2018-07-12;87>
- DL 30 aprile 2022, n. 36: <https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legge:2022-04-30;36>

Secondary sources used to corroborate [S] points (professional press and practitioners' guides,
consulted 2026-10-09): Consiglio Nazionale Forense parere n. 38/2024 (via foroeuropeo.it);
fiscozen.it, ilsole24ore.com (NT+ Fisco), ecnews.it, informazionefiscale.it, fiscoetasse.com,
money.it, centrofiscale.com and the casse's guides (Cassa Forense, Inarcassa, CIPAG, ENPAP)
cited on the pages linked from those sources.
