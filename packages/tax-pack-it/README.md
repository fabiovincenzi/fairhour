# @fairhour/tax-pack-it

The **Italian tax pack** for the [Fairhour](https://github.com/fabiovincenzi/fairhour) tax
engine, [`@fairhour/tax-core`](https://github.com/fabiovincenzi/fairhour/blob/main/packages/tax-core).
It turns the lines of an invoice of an Italian self-employed professional (_lavoratore autonomo_
with a _partita IVA_) into the exact amounts to print on it, under the **regime forfettario** or
the **regime ordinario**, and explains every figure step by step, with its legal source.

> **Disclaimer.** The figures are **informational**. They follow the rules and sources documented
> in [docs/tax-packs/it.md](https://github.com/fabiovincenzi/fairhour/blob/main/docs/tax-packs/it.md),
> but they are not tax advice: verify every invoice with your accountant (_commercialista_) before
> you issue it. Several sources are still marked "to be verified" (see [Sources](#sources)).
>
> **Avvertenza.** Gli importi calcolati sono **indicativi** e non costituiscono consulenza
> fiscale: verifica ogni fattura con il tuo commercialista prima di emetterla.

- **Both regimes.** Forfettario (no VAT, no withholding, the legal wording the Agenzia delle
  Entrate suggests) and ordinario (VAT per rate, _ritenuta d'acconto_, split payment).
- **Social security.** INPS Gestione Separata _rivalsa_ (4 %) or a professional fund's
  _contributo integrativo_ (Cassa Forense, CNPADC, CIPAG, Inarcassa, CNPR, ENPACL, EPPI, EPAP,
  ENPAB, ENPAPI, ENPAP, or any other fund), lawyers' 15 % _spese generali_.
- **Imposta di bollo.** €2.00 above €77.47 not subject to VAT, charged to the client or absorbed.
- **Revenue tracker.** The forfettario ceiling (€85,000; €65,000 before 2022) and the €100,000
  immediate exit, on a cash basis, pro-rated in the first year.
- **FatturaPA-ready.** Every group and component carries its FatturaPA codes (`Natura`,
  `AliquotaIVA`, `TipoCassa`, `TipoRitenuta`, `BolloVirtuale`, ...), so an XML exporter needs no
  tax logic.
- **Exact and pure.** Amounts are [`@fairhour/money`](https://github.com/fabiovincenzi/fairhour/blob/main/packages/money)
  values (`bigint` cents), every rounding is explicit, and the computation is a pure function of
  the configuration and the invoice: no I/O, no clock, no randomness.

License: MIT. Dependencies: `@fairhour/money`, `@fairhour/tax-core` and `zod` 4.

## Quick start

```bash
pnpm add @fairhour/tax-pack-it @fairhour/tax-core @fairhour/money
```

```ts
import {
  computeInvoice,
  formatComputation,
  formatTrace,
  parseInvoiceInput,
} from "@fairhour/tax-core";
import { itPack, type ItConfigInput } from "@fairhour/tax-pack-it";

// Regime ordinario, enrolled in the INPS Gestione Separata, charging the 4 % rivalsa.
const config: ItConfigInput = {
  regime: "ordinario",
  socialSecurity: { kind: "inps-gestione-separata", rivalsa: true },
};

const input = parseInvoiceInput({
  issueDate: "2026-03-15",
  currency: "EUR",
  client: { country: "IT", kind: "business", isWithholdingAgent: true, vatId: "01234567890" },
  lines: [
    {
      id: "l1",
      kind: "service",
      description: "UX design",
      quantity: "20",
      unit: "hour",
      unitPrice: "50",
    },
  ],
});

const computation = computeInvoice(itPack, config, input);
// computation.total            -> { amount: 126880n, currency: "EUR" }
// computation.withholdingTotal -> { amount: 20800n, currency: "EUR" }
// computation.netPayable       -> { amount: 106080n, currency: "EUR" }

for (const step of formatTrace(computation, itPack, "en")) {
  console.log(`${step.step}. ${step.text}${step.formula ? ` (${step.formula})` : ""}`);
}
```

```text
1. UX design: 20 × €50.00 = €1,000.00
2. Subtotal of the lines: €1,000.00
3. VAT 22%: €1,000.00 (subject to VAT at 22%)
4. INPS rivalsa of 4% on the fees (4% × €1,000.00 = €40.00)
5. VAT at 22% on the taxable amount (22% × €1,040.00 = €228.80)
6. Amount subject to withholding: fees, general expenses and INPS rivalsa (the fund contribution, VAT, disbursements, goods and stamp duty are excluded) (€1,000.00 + €0.00 + €40.00 = €1,040.00)
7. Withholding tax of 20%, retained by the client and paid to the State (20% × €1,040.00 = €208.00)
8. No stamp duty: the amount not subject to VAT, €0.00, does not exceed €77.47 (€0.00 ≤ €77.47)
9. Document total: €1,268.80
10. Deducted from the amount payable: €208.00
11. Net amount payable: €1,060.80
```

Each step also carries its rule id (`it.ordinario.withholding`) and its sources.
`formatComputation(computation, itPack, "it")` lists the components in Italian: "Rivalsa INPS
4%: 40,00 €", "IVA: 228,80 €", "Ritenuta d'acconto 20%: 208,00 €". For the e-invoice, the INPS
rivalsa carries `{ "fatturapa.TipoCassa": "TC22", "fatturapa.Ritenuta": "SI" }`.

The same invoice under the **regime forfettario**, with the stamp duty charged to the client:

```ts
const flatRate: ItConfigInput = {
  regime: "forfettario",
  socialSecurity: { kind: "inps-gestione-separata", rivalsa: true },
  stampDuty: { charge: "client" },
};
const forfettario = computeInvoice(itPack, flatRate, input);
// total and net payable €1,042.00: fees 1,000.00 + rivalsa 40.00 + stamp duty 2.00, no VAT,
// no withholding; one summary row "N2.2 – Not subject to VAT (flat-rate scheme)", €1,042.00.

formatComputation(forfettario, itPack, "en").documentLegalNotes; // printed in Italian:
// "Operazione effettuata in regime forfettario ai sensi dell'articolo 1, commi da 54 a 89, della
//  Legge n. 190/2014 e successive modificazioni."
// "Si richiede la non applicazione della ritenuta alla fonte a titolo d'acconto ai sensi
//  dell'articolo 1, comma 67, della Legge n. 190/2014."
// "Imposta di bollo assolta in modo virtuale ai sensi dell'articolo 6 del DM 17 giugno 2014."
```

`formatComputation(computation, itPack, locale)` gives the formatted components, VAT summary,
totals, legal notes (in the reader's locale, and in Italian for the document), warnings and the
disclaimer.

## Configuration

The configuration is plain JSON, validated by `configSchema` (zod 4). `ItConfigInput` is the type
you store (fields with defaults are optional), `ItConfig` the parsed type. Percentages are
decimal strings (`"4"`, `"15"`, `"3.5"`). The regime and the social-security scheme have no
default: a wrong guess would silently change every invoice.

| Option                                 | Default                    | Meaning                                                                                                                             |
| -------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `regime`                               | required                   | `"forfettario"` or `"ordinario"` (also for the _regime semplificato_, which has the same invoice rules).                            |
| `socialSecurity`                       | required                   | `{ kind: "none" }`, `{ kind: "inps-gestione-separata", rivalsa?, rate? }` or `{ kind: "cassa", preset, rate?, tipoCassa?, name? }`. |
| `socialSecurity.rivalsa`               | `true`                     | INPS: charge the rivalsa to clients.                                                                                                |
| `socialSecurity.rate`                  | `"4"` (INPS), preset rate  | INPS: at most 4 %. Cassa: overrides the preset's rate (required for `preset: "custom"`).                                            |
| `socialSecurity.preset`                |                            | `cassa-forense`, `cnpadc`, `cipag`, `inarcassa`, `cnpr`, `enpacl`, `eppi`, `epap`, `enpab`, `enpapi`, `enpap` or `custom`.          |
| `socialSecurity.tipoCassa`, `name`     | the preset's               | FatturaPA `TipoCassa` (`TC01`..`TC21`) and the fund's name; required for `custom`.                                                  |
| `generalExpenses`                      | absent                     | Lawyers only: `{}` charges the 15 % _spese generali_; `{ rate }` overrides it.                                                      |
| `stampDuty.charge`                     | `"client"`                 | `"client"` adds the €2.00 to the total; `"absorbed"` shows it for information only.                                                 |
| `noWithholdingNote` (forfettario)      | `"when-withholding-agent"` | When to print the request not to withhold: `"when-withholding-agent"`, `"always"` or `"never"`.                                     |
| `wording.vat`, `wording.noWithholding` | the standard wording       | Forfettario: your own legal wording for the two notes (10 to 500 characters).                                                       |
| `revenueTracker.warningRatio`          | `"80"`                     | Forfettario: the tracker reports `approaching` from this percentage of the ceiling.                                                 |
| `withholding.enabled` (ordinario)      | `true`                     | Disable only for activities that are not _lavoro autonomo_.                                                                         |
| `withholding.rate`                     | the parameter, 20 %        | Commercial agents: `"23"`.                                                                                                          |
| `withholding.baseShare`                | `"100"`                    | Share of the fees subject to withholding (agents: `"50"` or `"20"`).                                                                |
| `withholding.tipoRitenuta`             | `"RT01"`                   | FatturaPA: `RT01` natural persons, `RT02` legal persons.                                                                            |
| `withholding.causalePagamento`         | `"A"`                      | FatturaPA `CausalePagamento` (`A`: habitual professional services).                                                                 |
| `splitPayment` (ordinario)             | `"auto"`                   | `"auto"` applies the split payment to Italian public administrations when its conditions hold; `"never"` turns it off.              |

Examples:

```ts
import type { ItConfigInput } from "@fairhour/tax-pack-it";

// Forfettario without a social-security surcharge (the stamp duty is charged to the client).
const forfettarioNoContribution: ItConfigInput = {
  regime: "forfettario",
  socialSecurity: { kind: "none" },
};

// Forfettario, INPS rivalsa, stamp duty paid by the professional, earlier ceiling warning.
const forfettarioAbsorbedStampDuty: ItConfigInput = {
  regime: "forfettario",
  socialSecurity: { kind: "inps-gestione-separata" },
  stampDuty: { charge: "absorbed" },
  noWithholdingNote: "always",
  revenueTracker: { warningRatio: "90" },
};

// A lawyer: Cassa Forense 4 % (CPA) and 15 % spese generali.
const lawyer: ItConfigInput = {
  regime: "ordinario",
  socialSecurity: { kind: "cassa", preset: "cassa-forense" },
  generalExpenses: {},
};

// An engineer or architect: Inarcassa 4 %.
const engineer: ItConfigInput = {
  regime: "ordinario",
  socialSecurity: { kind: "cassa", preset: "inarcassa" },
};

// A fund without a preset: state its rate, FatturaPA code and name.
const otherFund: ItConfigInput = {
  regime: "ordinario",
  socialSecurity: { kind: "cassa", preset: "custom", rate: "2", tipoCassa: "TC09", name: "ENPAM" },
};

// A commercial agent: 23 % on 50 % of the commissions (art. 25-bis DPR 600/1973).
const commercialAgent: ItConfigInput = {
  regime: "ordinario",
  socialSecurity: { kind: "none" },
  withholding: { rate: "23", baseShare: "50" },
};

// An activity whose fees are not subject to withholding.
const noWithholding: ItConfigInput = {
  regime: "ordinario",
  socialSecurity: { kind: "none" },
  withholding: { enabled: false },
};
```

### Per-invoice options

`InvoiceInput.options` accepts:

- `stampDuty`: `"auto"` (default, the configuration decides), `"charge"`, `"absorb"`, or
  `"not-due"` for an exemption the pack does not model (warning `it.stamp-duty.override`).
- `splitPayment`: `"auto"` (default), `"apply"` for clients subject to split payment that are not
  public administrations (State-controlled or FTSE MIB listed companies), or `"skip"`.

### What the pack refuses

`computeInvoice` throws `UnsupportedInputError` with localized issues for: invoices not in euro
(`it.currency-not-eur`: the thresholds are in euro, convert the prices first), a VAT rate on a
forfettario line (`it.forfettario.rate-not-allowed`), a rate other than 22, 10, 5 or 4 %
(`it.ordinario.unknown-vat-rate`) and the split payment forced on fees subject to withholding
(`it.split-payment.withholding-conflict`). Invoices dated before 2019 throw
`ParameterNotFoundError`.

## How an invoice is computed

The rules run in this order (rule ids appear in the trace):

| #   | Rule                            | What it does                                                                                                                                                             |
| --- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `it.common.classify-lines`      | Puts each line in a VAT summary group: `vat-22`/`10`/`5`/`4`, `n2.2` (forfettario, out of scope), `n2.1` (business abroad), `n4` (exempt), `n1` (art. 15 disbursements). |
| 2   | `it.common.general-expenses`    | Lawyers' 15 % _spese generali_ on the fees.                                                                                                                              |
| 3   | `it.common.cassa`               | The fund's _contributo integrativo_ on fees and general expenses: subject to VAT, not to withholding, not revenue.                                                       |
| 4   | `it.common.inps-rivalsa`        | The 4 % INPS rivalsa on the fees: subject to VAT and to withholding.                                                                                                     |
| 5   | `it.ordinario.vat`              | VAT once per rate, on the summary row's base.                                                                                                                            |
| 6   | `it.ordinario.withholding`      | 20 % (or the configured rate) of the base share of fees + general expenses + rivalsa, when the client is a withholding agent.                                            |
| 7   | `it.forfettario.no-vat`         | The forfettario legal note.                                                                                                                                              |
| 8   | `it.forfettario.no-withholding` | The request not to withhold (art. 1, c. 67, L. 190/2014).                                                                                                                |
| 9   | `it.common.stamp-duty`          | €2.00 when the amount not subject to VAT exceeds €77.47; always informational on credit notes.                                                                           |
| 10  | `it.ordinario.split-payment`    | Italian public administrations pay the VAT to the State, unless the fees are subject to withholding.                                                                     |

Rounding: line totals, contributions (once per group), VAT (once per rate) and the withholding
(once per document) are rounded **half up to the cent**; totals are sums of rounded amounts, so
`total = lines + contributions + VAT + charged stamp duty` and
`netPayable = total − withholding − split payment` hold exactly. Example: fees €333.33, rivalsa
13.3332 → €13.33, VAT 22 % × 346.66 = 76.2652 → €76.27, withholding 69.332 → €69.33, net
payable €353.60.

## Revenue tracker (forfettario)

The pack provides the `annualThresholds` capability: `countableRevenue(config, computation)` is
the part of an invoice that counts towards the ceiling once collected (fees, general expenses,
INPS rivalsa and the charged stamp duty; not the cassa contribution or art. 15 disbursements),
and `evaluateRevenue(config, input)` evaluates the receipts of a year:

```ts
import { parseMoney } from "@fairhour/money";
import { isoDate } from "@fairhour/tax-core";
import { configSchema, evaluateRevenue } from "@fairhour/tax-pack-it";

const status = evaluateRevenue(configSchema.parse(flatRate), {
  year: 2026,
  currency: "EUR",
  receipts: [
    { date: isoDate("2026-02-10"), amount: parseMoney("30000.00", "EUR") },
    { date: isoDate("2026-06-30"), amount: parseMoney("40000.00", "EUR") },
  ],
  asOf: isoDate("2026-10-10"), // "today", injected: the pack never reads the clock
});
// status.status -> "approaching"; status.explanation, formatted in English:
// "Fees collected in 2026 up to October 10, 2026: €70,000.00 (receipts: 2)"
// "€70,000.00 is 82.35% of the €85,000.00 ceiling, at or above the warning level of 80%"
// "€70,000.00 does not exceed the immediate exit limit of €100,000.00"
```

Statuses: `ok`, `approaching` (at or above `warningRatio` of the ceiling), `exceeded` (above the
ceiling: the regime ends on 31 December), `immediate-exit` (above €100,000, from 2023: the regime
ends at once and VAT is due from the transaction that crossed the limit), and `not-applicable` in
ordinario. In the first year of activity the ceiling is pro-rated by days (`85,000 × days / 365`).

## Parameters

Rates, thresholds and dates are versioned by effective date; a version is never edited, a new
one is added with its sources:

| Version         | From       | Changes                                                                                      |
| --------------- | ---------- | -------------------------------------------------------------------------------------------- |
| `it-2019-01-01` | 2019-01-01 | Baseline: VAT 22/10/5/4 %, withholding 20 %, stamp duty €2.00 above €77.47, ceiling €65,000. |
| `it-2021-01-01` | 2021-01-01 | United Kingdom no longer in the EU (reverse-charge note).                                    |
| `it-2023-01-01` | 2023-01-01 | Forfettario ceiling €85,000; immediate exit above €100,000.                                  |
| `it-2026-07-01` | 2026-07-01 | Split payment authorised until 2029-06-30 (Council Implementing Decision (EU) 2026/1728).    |

`listParameters(itPack)` (from `@fairhour/tax-core`) returns the timeline with every value.

## Sources

Every rule, parameter version, component and legal note cites its sources (`SourceRef`), and the
same list is in [docs/tax-packs/it.md](https://github.com/fabiovincenzi/fairhour/blob/main/docs/tax-packs/it.md).
The main ones:

- Regime forfettario: Legge 23 dicembre 2014, n. 190, art. 1, commi 54-89 (c. 58 lett. a: no
  VAT; c. 67: no withholding; c. 54 and 71: the €85,000 and €100,000 limits), Agenzia delle
  Entrate, Circolare 32/E del 5 dicembre 2023 and _Fattura elettronica per i forfettari_.
- VAT: DPR 26 ottobre 1972, n. 633, artt. 7-ter, 10, 13, 15, 16, 17-ter, 21; FatturaPA
  technical specifications 1.9.1.
- Withholding: DPR 29 settembre 1973, n. 600, artt. 25 and 25-bis; Agenzia delle Entrate,
  _F24 Ritenute reddito lavoro autonomo – Importi su cui si applica la ritenuta_.
- INPS rivalsa: Legge 23 dicembre 1996, n. 662, art. 1, c. 212. Professional funds: DL 41/1995
  art. 16 and the funds' rules. Lawyers' general expenses: DM 10 marzo 2014, n. 55, art. 2, c. 2.
- Stamp duty: DPR 26 ottobre 1972, n. 642, Tariffa, art. 13 and nota 2 lett. a), Tabella art. 6;
  DM 17 giugno 2014, art. 6; Agenzia delle Entrate rulings (Ris. 98/E/2001, Risposte 491/2021,
  428/2022, 45/2024, 129/2024).

Each source carries a verification status. The research for version 0 was done on 2026-10-09
through official summaries (Agenzia delle Entrate, Ministry of Economy and Finance, EU acts) and
professional literature; the consolidated statutes were **not** read in full, so no source is
marked `primary-text`, and some pinpoints, fund rates and FatturaPA codes are `to-be-verified`
(the UI shows them with a marker, and the pack warns when a fund rate to be verified is in use).
The open legal points are listed in section 14 of the specification.

## Limitations

- Self-employed professionals only: no sale-of-goods specifics (intra-EU supplies, exports),
  no e-commerce, no reverse charge on purchases.
- Invoices in euro only.
- Place of supply: only the general business-to-business rule (art. 7-ter); exceptions need a
  line `treatment: { kind: "out-of-scope", reference }`.
- One social-security scheme per configuration; fund rates that differ by client type (ENPAPI
  2 % towards public administrations) need a separate configuration.
- ENASARCO and other social-security withholdings (RT03-RT06), the Certificazione Unica, F24
  payments and the annual return are out of scope.
- No discounts or negative lines, no tax-inclusive prices.

The full specification, with worked examples and the test plan, is
[docs/tax-packs/it.md](https://github.com/fabiovincenzi/fairhour/blob/main/docs/tax-packs/it.md).

## License

MIT. See [LICENSE](./LICENSE).
