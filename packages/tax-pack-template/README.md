# @fairhour/tax-pack-template

A complete, minimal tax pack for **Exampleland**, a fictional country, to copy when you add a
country to Fairhour. It is a working pack: it passes the shared conformance suite, has golden
fixtures, table-driven tests for every rule, property tests and a purity test, with coverage above
95 %. Every place you need to change is marked with a `TEMPLATE:` comment.

The step-by-step guide is [docs/contributing/tax-packs.md](../../docs/contributing/tax-packs.md).
This README covers what the template contains and how to copy it.

> **Exampleland and its laws are fictional.** The pack id is `xx`, after the user-assigned ISO
> 3166-1 code XX, and every source is marked `to-be-verified`. Its figures show how a pack works
> and mean nothing for a real invoice. Never register this pack in the app. Figures computed by a
> real pack are informational too: they must be verified with an accountant.

## The fictional law of Exampleland

The template is small but realistic. It has a VAT with two rates that changed on a known date, a
regime without VAT that requires a note on the invoice, and a withholding that changes the amount
payable but not the total. Most countries' freelance invoices are a variation of these three.

| Rule                | What it does                                                                                                                                                                                                                                           | Fictional source                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| `xx.classify-lines` | Puts every line in a tax group: `vat-<rate>`, `small-business`, `exempt`, `out-of-scope` or `excluded` (disbursements). Warns about out-of-scope lines without a reference.                                                                            | VAT Act, arts. 5, 12, 30         |
| `xx.vat`            | VAT-registered businesses: VAT at the standard rate (20 % until 2025-12-31, 21 % from 2026-01-01) or the reduced rate (10 %), once per rate. Lines may name an explicit rate, which must be in force on the issue date.                                | VAT Act, art. 5; Budget Act 2025 |
| `xx.small-business` | Under the small-business exemption: no VAT, and the mandatory note, in the statutory wording or the user's own.                                                                                                                                        | VAT Act, art. 30                 |
| `xx.withholding`    | Clients that are withholding agents withhold 15 % (7 % for new businesses) of the fees: services, recharged expenses and mileage, not goods or disbursements. Deducted from the amount payable. The invoice option `withholding: "skip"` turns it off. | Income Tax Act, art. 25          |
| Rounding policy     | Half up to the minor unit: each line, the VAT once per rate, the withholding once per invoice.                                                                                                                                                         | VAT Act, art. 5                  |

Configuration (`src/config.ts`), with every default filled in:

```json
{
  "vatRegistered": true,
  "defaultVatRate": "standard",
  "withholding": { "enabled": true, "rate": "standard" }
}
```

`smallBusinessNote` (optional) replaces the statutory wording of the small-business note.
Messages exist in English and in Esperanto, which stands in for the country's own language: legal
notes are printed in `meta.documentLocale` (`eo`) on the invoice.

## Quick start

The example is executed by `src/readme.test.ts`.

```ts
import { computeInvoice, formatTrace, parseInvoiceInput } from "@fairhour/tax-core";
import { xxPack } from "@fairhour/tax-pack-template";

const input = parseInvoiceInput({
  issueDate: "2026-03-16",
  currency: "EUR",
  client: { country: "DE", kind: "business", isWithholdingAgent: true, vatId: "DE123456789" },
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
      kind: "reimbursement",
      description: "Courier",
      quantity: "1",
      unit: "item",
      unitPrice: "16",
    },
  ],
});

const computation = computeInvoice(xxPack, {}, input);
computation.total; // { amount: 122600n, currency: "EUR" }
computation.netPayable; // { amount: 107600n, currency: "EUR" }

for (const step of formatTrace(computation, xxPack, "en")) {
  console.log(`${step.step}. ${step.text}${step.formula ? ` (${step.formula})` : ""}`);
}
// 1. Design: 12.5 × €80.00 = €1,000.00
// 2. Courier: 1 × €16.00 = €16.00
// 3. Subtotal of the lines: €1,016.00
// 4. Lines classified into tax groups: 2
// 5. VAT at 21% on the taxable amount (21% × €1,000.00 = €210.00)
// 6. Withholding tax: 15% of the fees before VAT (15% × €1,000.00 = €150.00)
// 7. Document total: €1,226.00
// 8. Deducted from the amount payable: €150.00
// 9. Net amount payable: €1,076.00
```

## Layout

The layout every pack follows ([tax engine design, section 8](../../docs/design/tax-engine.md#8-pack-package-layout)):

| Path                                                  | What it holds                                                                                          |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `package.json`, `LICENSE`                             | MIT, like every `@fairhour/tax-pack-*` (ADR-0002; `pnpm license:check` enforces it)                    |
| `eslint.config.js`                                    | `mitLibrary` (license boundary, purity) and `moneySafety` (no floats on amounts)                       |
| `vitest.config.ts`                                    | coverage thresholds of 95 % and a 30 s timeout for the property tests                                  |
| `src/index.ts`                                        | the pack: `meta`, schemas, parameters, the rule pipeline, messages, rounding, `validateInput`          |
| `src/config.ts`, `src/options.ts`                     | the zod schemas of the workspace settings and of the per-invoice options                               |
| `src/parameters.ts`                                   | the legal values, versioned by effective date (append-only)                                            |
| `src/sources.ts`                                      | one `SourceRef` per cited provision, with how it was verified                                          |
| `src/groups.ts`                                       | the tax groups: the rows of the invoice's tax summary                                                  |
| `src/rounding.ts`                                     | the rounding policy                                                                                    |
| `src/validate-input.ts`                               | the inputs the pack refuses (`UnsupportedInputError`)                                                  |
| `src/rules/*.ts`, `src/rules/*.test.ts`               | one file per rule, each with its table-driven test                                                     |
| `src/messages/en.ts`, `src/messages/eo.ts`            | the message catalogs: English, and the country's language (Esperanto stands in for it)                 |
| `src/conformance.test.ts`, `test/conformance-data.ts` | the shared conformance suite and its inputs; the parameter timeline snapshot is in `src/__snapshots__` |
| `src/property.test.ts`                                | properties of the pack's own law, on random invoices                                                   |
| `src/purity.test.ts`                                  | no clock, randomness, environment, I/O or floats in the shipped code                                   |
| `src/template.test.ts`                                | in a copy: fails until every `TEMPLATE:` marker and every mention of Exampleland is gone               |
| `src/readme.test.ts`                                  | the examples of this README, executed                                                                  |
| `fixtures/invoices/*.json`                            | golden fixtures: hand-computed invoices, with the derivation in `description`                          |

## Copy it for your country

The full walkthrough, with the research and the review that come before and after, is in the
[guide](../../docs/contributing/tax-packs.md#4-copy-the-template). From the repository root, with
your ISO 3166-1 alpha-2 code in three spellings:

```bash
cc=de Cc=De CC=DE
cp -R packages/tax-pack-template "packages/tax-pack-$cc"
cd "packages/tax-pack-$cc"
rm -rf node_modules dist coverage src/__snapshots__
perl -pi -e "s/tax-pack-template/tax-pack-$cc/g" package.json
grep -rlE 'xx|Xx|XX' src test fixtures | xargs perl -pi -e "s/xx/$cc/g; s/Xx/$Cc/g; s/XX/$CC/g"
cd ../.. && pnpm install
pnpm --filter "@fairhour/tax-pack-$cc" test
```

The tests pass except `src/template.test.ts`, which lists what is left to do: every `TEMPLATE:`
marker and every mention of Exampleland. Replace them one by one, following the comment at each
marker, and rename `src/messages/eo.ts` after your country's language.

## License

[MIT](LICENSE). Packs are MIT so that anyone, including proprietary invoicing software, can embed
them (ADR-0002).
