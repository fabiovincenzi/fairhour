# @fairhour/tax-pack-generic

A configurable **VAT / GST / sales tax, or no tax** pack for the
[Fairhour](https://github.com/fabiovincenzi/fairhour) tax engine,
[`@fairhour/tax-core`](https://github.com/fabiovincenzi/fairhour/blob/main/packages/tax-core). It
works in any country and any currency: you set the tax label, the rate (or no tax at all), and
the optional reverse-charge, exemption and withholding wording. The pack then gives you
reconciled invoice amounts and a step-by-step explanation of each one.

> **Disclaimer.** This pack applies the rates, labels and wording **you** configure. It knows no
> country's law: it does not decide whether a sale is taxable, which rate applies, whether a
> reverse charge is allowed or what an invoice must say. The figures are informational. Check
> your configuration and your invoices with an accountant or your tax authority's guidance.

- **Exact money.** Amounts are [`@fairhour/money`](https://github.com/fabiovincenzi/fairhour/blob/main/packages/money) values (`bigint` minor units), so
  there are no floats. Every rounding uses the mode you configure.
- **Any currency.** Euro, pound, dollar, yen (no decimals), dinar (three decimals): amounts are
  rounded to each currency's minor unit.
- **Reconciled.** `total = Σ lines + Σ tax` and `netPayable = total − withholding` hold exactly
  on every invoice. The engine checks them every time.
- **Explained.** Every figure comes with a trace step, in English or Italian. Your labels and
  notes are printed as you wrote them.
- **Pure.** No I/O, no clock, no randomness. The same configuration and invoice always give the
  same result. It runs on servers, in browsers and in desktop webviews.

License: MIT. Dependencies: `@fairhour/money`, `@fairhour/tax-core` and `zod` 4.

## Quick start

```bash
pnpm add @fairhour/tax-pack-generic @fairhour/tax-core @fairhour/money
```

```ts
import { computeInvoice, formatTrace, parseInvoiceInput } from "@fairhour/tax-core";
import { genericPack, type GenericConfigInput } from "@fairhour/tax-pack-generic";

const config: GenericConfigInput = { taxLabel: "VAT", tax: { kind: "rate", rate: "20" } };

const input = parseInvoiceInput({
  issueDate: "2026-03-15",
  currency: "GBP",
  client: { country: "GB", kind: "business", isWithholdingAgent: false, vatId: "GB123456789" },
  lines: [
    {
      id: "l1",
      kind: "service",
      description: "Design",
      quantity: "12.5",
      unit: "hour",
      unitPrice: "80",
    },
    {
      id: "l2",
      kind: "reimbursement", // a disbursement: outside the taxable amount by default
      description: "Courier",
      quantity: "1",
      unit: "item",
      unitPrice: "16",
    },
  ],
});

const computation = computeInvoice(genericPack, config, input);
// computation.taxTotal   -> { amount: 20000n, currency: "GBP" }
// computation.total      -> { amount: 121600n, currency: "GBP" }
// computation.netPayable -> { amount: 121600n, currency: "GBP" }

for (const step of formatTrace(computation, genericPack, "en")) {
  console.log(`${step.step}. ${step.text}${step.formula ? ` (${step.formula})` : ""}`);
}
```

```text
1. Design: 12.5 × £80.00 = £1,000.00
2. Courier: 1 × £16.00 = £16.00
3. Subtotal of the lines: £1,016.00
4. Lines classified into tax groups: 2
5. VAT at 20% on the taxable amount (20% × £1,000.00 = £200.00)
6. Document total: £1,216.00
7. Net amount payable: £1,216.00
```

`formatComputation(computation, genericPack, locale)` gives the formatted tax summary
(`VAT 20%: £1,000.00 / £200.00`, `Disbursements (outside the taxable amount): £16.00 / £0.00`),
the totals, the legal notes, the warnings and the disclaimer. Each trace step also carries its
rule id and its sources.

## Configuration

The configuration is plain JSON, validated by `configSchema` (zod 4). `GenericConfigInput` is the
type you store (fields with defaults are optional), `GenericConfig` the parsed type. The
settings form is generated from the schema (`z.toJSONSchema(configSchema, { io: "input" })`).

| Option                          | Default                | Meaning                                                                                                                      |
| ------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `taxLabel`                      | `"VAT"`                | The tax's name on the invoice and in the trace: `"VAT"`, `"GST"`, `"Sales tax"`, `"IVA"`, `"MwSt"`. 1 to 32 characters.      |
| `tax`                           | required               | `{ kind: "rate", rate, allowedLineRates? }` or `{ kind: "none", note? }`.                                                    |
| `tax.rate`                      |                        | The standard rate in percent, as a string: `"20"`, `"8.875"`. 0 to 100, at most 4 decimals.                                  |
| `tax.allowedLineRates`          | `[]`                   | Other rates a line may use (reduced rates). Empty means any rate. At most 10.                                                |
| `tax.note`                      | none                   | With `kind: "none"`: printed on every invoice, for example the wording of a small-business exemption.                        |
| `exemptNote`                    | none                   | Printed when a line is `exempt` and gives no reference of its own.                                                           |
| `reverseCharge.mode`            | `"off"`                | `"foreign-business-clients"`: no tax for business clients in a country other than `supplierCountry`.                         |
| `reverseCharge.supplierCountry` | none                   | Your ISO 3166-1 alpha-2 country (`"DE"`). Required unless the mode is `"off"`.                                               |
| `reverseCharge.note`            | `"Reverse charge"`     | Printed on reverse-charge invoices.                                                                                          |
| `withholding`                   | none                   | `{ label, rate, appliesTo }`: an income tax the client withholds and pays to the tax authority.                              |
| `withholding.label`             | `"Withholding tax"`    | 1 to 40 characters.                                                                                                          |
| `withholding.appliesTo`         | `"withholding-agents"` | `"withholding-agents"`: clients flagged `isWithholdingAgent`. `"business-clients"`: every business or public administration. |
| `rounding.mode`                 | `"halfUp"`             | `halfUp`, `halfEven`, `halfDown`, `up`, `down`, `ceiling` or `floor`.                                                        |
| `rounding.taxScope`             | `"per-document"`       | Round the tax once per rate on the whole document, or on each line and then add up (`"per-line"`).                           |
| `documentNote`                  | none                   | Free text printed on every invoice (a company registration, for example). 1 to 1000 characters.                              |

Examples:

```ts
import type { GenericConfigInput } from "@fairhour/tax-pack-generic";

// United Kingdom style: 20%, with reduced 5% and zero-rated lines allowed.
const ukVat: GenericConfigInput = {
  taxLabel: "VAT",
  tax: { kind: "rate", rate: "20", allowedLineRates: ["5", "0"] },
};

// Australia style: GST 10%, rounded on each line.
const australianGst: GenericConfigInput = {
  taxLabel: "GST",
  tax: { kind: "rate", rate: "10" },
  rounding: { taxScope: "per-line" },
};

// A combined US sales tax rate, banker's rounding.
const usSalesTax: GenericConfigInput = {
  taxLabel: "Sales tax",
  tax: { kind: "rate", rate: "8.875" },
  rounding: { mode: "halfEven" },
};

// No tax, with the note your law requires, and a document note.
const noTax: GenericConfigInput = {
  tax: { kind: "none", note: "VAT not applicable: small business exemption" },
  documentNote: "Registered in England and Wales, company number 01234567",
};

// EU business-to-business services: reverse charge for business clients in another country.
const euReverseCharge: GenericConfigInput = {
  taxLabel: "VAT",
  tax: { kind: "rate", rate: "19" },
  reverseCharge: {
    mode: "foreign-business-clients",
    supplierCountry: "DE",
    note: "Reverse charge",
  },
};

// A withholding on fees paid by business clients (the mechanism only, not a Spanish tax pack).
const withholding: GenericConfigInput = {
  taxLabel: "IVA",
  tax: { kind: "rate", rate: "21" },
  withholding: { label: "IRPF", rate: "15", appliesTo: "business-clients" },
};
```

### Per-invoice options

`InvoiceInput.options` accepts `{ reverseCharge: "auto" | "apply" | "skip" }` (default `"auto"`).
`"apply"` forces the reverse charge on one invoice (for example a domestic reverse-charge
scheme), and `"skip"` suppresses it. With `tax: { kind: "none" }` there is no tax to reverse, so
the option has no effect.

## How lines are treated

Each line's `treatment` (from `@fairhour/tax-core`) decides its group in the tax summary:

| Line treatment                          | Group                                       | Notes and warnings                                                                                 |
| --------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `excluded` (default for disbursements)  | `excluded`: outside the taxable amount      |                                                                                                    |
| `exempt`                                | `exempt`                                    | the line's `reference`, else `exemptNote`, else the warning `generic.exempt-without-note`          |
| `out-of-scope`                          | `out-of-scope`                              | the line's `reference`, if any                                                                     |
| `standard` or `rate`, no tax configured | `no-tax`                                    | `tax.note` (a `rate` line is refused: `generic.rate-without-tax`)                                  |
| `standard` or `rate`, reverse charge    | `reverse-charge`                            | `reverseCharge.note`; warning `generic.reverse-charge-without-vat-id` without a VAT id             |
| `standard`                              | `tax-<rate>` at `tax.rate` (`tax-20`)       |                                                                                                    |
| `rate`                                  | `tax-<rate>` at the line's rate (`tax-7-7`) | refused (`generic.rate-not-allowed`) when not `tax.rate` and not in a non-empty `allowedLineRates` |

The reverse charge applies with the option `"apply"`, or with `"auto"` when the mode is
`"foreign-business-clients"`, the client is a `business` and its country differs from
`supplierCountry`. The pack compares country codes only. It does not know the EU, VAT
registration, the place-of-supply rules or their exceptions: whether the reverse charge is
allowed is your responsibility, and the explanation trace says so.

The withholding is `rate × (every line except the excluded ones)`, before tax, deducted from the
amount payable. Nothing is withheld from clients it does not apply to, and the trace says why.

## Rounding

Line totals, the tax and the withholding are rounded to the currency's minor unit with
`rounding.mode`. The tax is rounded once per rate on the document (`"per-document"`), or on each
line and then added up (`"per-line"`). The difference shows on two lines of A$10.05 at 10% GST:

| `taxScope`     | `mode`     | Computation                       | GST  |
| -------------- | ---------- | --------------------------------- | ---- |
| `per-document` | `halfUp`   | 10% × 20.10 = 2.010               | 2.01 |
| `per-line`     | `halfUp`   | 10% × 10.05 = 1.005 → 1.01, twice | 2.02 |
| `per-line`     | `halfEven` | 1.005 → 1.00, twice               | 2.00 |

Any currency works: 7.5 h at ¥8,333 is ¥62,497.5, rounded to ¥62,498, and 10% tax on it is
¥6,250. In Kuwaiti dinars, 2.5 × KD 49.483 = KD 123.708 and 5% of it is KD 6.185.

## Sources

The pack has a single parameter version, `generic-v1`, with no legal values: every rate, label
and wording comes from your configuration. Its source is the configuration itself (kind
`user-configuration`), marked "to be verified" on purpose: the pack cannot check what you
configured. The reverse-charge step also cites, as context only, Council Directive 2006/112/EC,
art. 196 (the customer is liable for business-to-business services from abroad) and art. 226,
point (11a) (the invoice mention "Reverse charge"). The pack does not apply EU law; it prints
your wording.

## Limitations

- Prices are tax-exclusive; tax-inclusive (gross) prices are not supported.
- One tax per line: no compound or stacked taxes (Canadian GST + PST/QST, US state + local sales
  tax as separate lines, Indian CGST + SGST).
- No thresholds, registration limits, stamp duties, social-security contributions or
  regime-specific wording. A country that needs them deserves its own pack.
- No cash rounding (CHF 0.05 and similar).
- The pack never checks that your rates or your wording are legally correct.

The full specification, with worked examples, is
[docs/tax-packs/generic.md](https://github.com/fabiovincenzi/fairhour/blob/main/docs/tax-packs/generic.md).

## License

MIT. See [LICENSE](./LICENSE).
