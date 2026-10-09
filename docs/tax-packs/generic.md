# Generic tax pack (`@fairhour/tax-pack-generic`)

> **Disclaimer.** This pack applies the rate, labels and wording **you** configure. It knows no
> country's law: it does not decide whether a sale is taxable, which rate applies, whether a
> reverse charge is allowed or what an invoice must say. The figures are informational; check
> your configuration and your invoices with an accountant or your tax authority's guidance.

- **Pack id:** `generic` · **Countries:** any · **Locales:** `en`, `it` · **Document locale:**
  the user's locale (legal notes are user-supplied text)
- **Status:** specification for implementation (phase 2)
- **Backlog:** TAX-008 (pack), TAX-010 (docs)
- **Engine contract:** [`docs/design/tax-engine.md`](../design/tax-engine.md)

The generic pack makes Fairhour usable anywhere from day one: a freelancer in the United Kingdom,
Australia, Germany or the United States configures a label ("VAT", "GST", "Sales tax"), a rate
or no tax at all, optional reverse-charge and exemption wording and an optional withholding, and
gets reconciled invoice amounts with an explanation trace. When a country needs real rules
(thresholds, regime-specific wording, contributions), it deserves its own pack.

---

## 1. Configuration

```ts
// packages/tax-pack-generic/src/config.ts (shape; implement with zod 4, JSON in/out)
type Percent = string; // decimal string, 0 ≤ value ≤ 100, at most 4 decimals

type GenericConfig = {
  /** Shown in the summary and the trace: "VAT", "GST", "Sales tax", "IVA", "MwSt". 1..32 chars. */
  taxLabel: string; // default "VAT"
  tax:
    | {
        kind: "rate";
        rate: Percent; // the standard rate, e.g. "20"
        /** Other rates lines may use with treatment { kind: "rate" }; empty = any rate allowed. */
        allowedLineRates: Percent[]; // default [], max 10
      }
    | {
        kind: "none";
        /** Printed on every invoice, e.g. "VAT not applicable, art. 293 B of the CGI". */
        note?: string; // 1..500 chars
      };
  /** Printed when at least one line is exempt and the line gives no reference. */
  exemptNote?: string; // 1..500 chars
  reverseCharge: {
    mode: "off" | "foreign-business-clients"; // default "off"
    /** Required unless mode is "off": the supplier's ISO 3166-1 alpha-2 country. */
    supplierCountry?: string;
    /** Printed on reverse-charge invoices. */
    note: string; // default "Reverse charge", 1..500 chars
  };
  withholding?: {
    label: string; // default "Withholding tax", 1..40 chars
    rate: Percent;
    /** Who must withhold: clients flagged as withholding agents (default), or every business. */
    appliesTo: "withholding-agents" | "business-clients"; // default "withholding-agents"
  };
  rounding: {
    mode: RoundingMode; // default "halfUp"
    /** Tax rounded once per rate on the whole document, or on each line then summed. */
    taxScope: "per-document" | "per-line"; // default "per-document"
  };
  /** Free text printed on every invoice (payment terms belong elsewhere). */
  documentNote?: string; // 1..1000 chars
};
```

Nested objects use `.prefault({})` so their inner defaults apply (zod 4 `.default()` returns the
default value without parsing it). A refinement requires `supplierCountry` when
`reverseCharge.mode !== 'off'`.

| Option               | Default          | Why                                                                                                                                     |
| -------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `taxLabel`           | `"VAT"`          | The most common name worldwide; any label is accepted.                                                                                  |
| `tax`                | required         | No safe default rate exists; the settings form asks for it.                                                                             |
| `reverseCharge.mode` | `"off"`          | Reverse charge has legal conditions the pack cannot check; the user opts in.                                                            |
| `withholding`        | absent           | Most countries have no withholding on freelance invoices.                                                                               |
| `rounding.mode`      | `"halfUp"`       | The most common commercial rounding; `halfEven` and the others are available.                                                           |
| `rounding.taxScope`  | `"per-document"` | One rounding per rate gives the smallest error; some authorities (for example the UK's HMRC) accept either, so `per-line` is available. |

Per-invoice options (`InvoiceInput.options`): `{ reverseCharge?: 'auto' | 'apply' | 'skip' }`,
default `auto`, to force or suppress the reverse charge on one invoice.

Input checks (`UnsupportedInputError`):

| Issue code                 | Condition                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------ |
| `generic.rate-not-allowed` | a `rate` treatment not equal to `tax.rate` and not in a non-empty `allowedLineRates` |
| `generic.rate-without-tax` | a `rate` treatment while `tax.kind === 'none'`                                       |

Any currency is accepted.

---

## 2. Rule pipeline

| #   | Rule id                  | Applies to               | Output                                                                                  |
| --- | ------------------------ | ------------------------ | --------------------------------------------------------------------------------------- |
| 1   | `generic.classify-lines` | always                   | tax groups and line assignment; reverse-charge, exempt and out-of-scope notes; warnings |
| 2   | `generic.tax`            | `tax.kind === 'rate'`    | `generic.tax` component (kind `tax`, adds to total)                                     |
| 3   | `generic.withholding`    | `withholding` configured | `generic.withholding` (deducted from payable) or an explanation                         |
| 4   | `generic.notes`          | always                   | no-tax note, document note                                                              |

### 2.1 `generic.classify-lines`

| Line treatment       | Condition                      | Group (id, treatment)                                                                                           |
| -------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `excluded`           |                                | `excluded` (excluded): disbursements outside the taxable amount                                                 |
| `exempt`             |                                | `exempt` (exempt) + note: the line's `reference`, else `exemptNote`, else warning `generic.exempt-without-note` |
| `out-of-scope`       |                                | `out-of-scope` (out-of-scope) + note with the line's `reference` if any                                         |
| `standard` or `rate` | `tax.kind === 'none'`          | `no-tax` (out-of-scope)                                                                                         |
| `standard` or `rate` | reverse charge applies (below) | `reverse-charge` (out-of-scope) + note `reverseCharge.note`                                                     |
| `standard`           | otherwise                      | `tax-<rate>` (taxable, `tax.rate`)                                                                              |
| `rate`               | otherwise                      | `tax-<rate>` (taxable, the line's rate)                                                                         |

Group ids replace the dot of a decimal rate with `-` (`tax-20`, `tax-7-7` for 7.7 %).

The reverse charge applies when the per-invoice option is `apply`, or when it is `auto`, the mode
is `foreign-business-clients`, the client is a `business` and `client.country !==
supplierCountry`. Warning `generic.reverse-charge-without-vat-id` when the client has no `vatId`.
The pack does not check EU membership, VIES registration or the place-of-supply rules: that is
the user's responsibility, stated in the trace.

### 2.2 `generic.tax`

One `tax` component with one allocation per taxable group, computed with `taxAllocations`:
`per-document` rounds `rate × group base` once per group; `per-line` rounds `rate × line net` for
each line and sums per group. Label: the configured `taxLabel` and the rate ("VAT 20%").

### 2.3 `generic.withholding`

Applies when `appliesTo` is `withholding-agents` and `client.isWithholdingAgent`, or when it is
`business-clients` and the client is a `business` or `public-administration`. Base: lines that
are not `excluded` (before tax); amount `rate × base`, rounded with `rounding.mode`; kind
`withholding`, deducted from the amount payable. Otherwise a trace step explains why nothing was
withheld.

### 2.4 `generic.notes`

Adds `tax.note` when there is no tax and `documentNote` when configured, as legal notes with the
key `generic.note.custom` (`"{text}"`).

### 2.5 Sources and parameters

The pack has a single parameter version, `generic-v1`, effective from 1900-01-01, with no legal
values (all values come from the configuration). Every rule and the version cite the source
`generic.user-configuration` (kind `user-configuration`: "Values supplied in the workspace's tax
settings"). The reverse-charge rule additionally cites, as context, Council Directive 2006/112/EC
art. 196 (customer liable for B2B services) and art. 226 point 11a (the invoice mention "Reverse
charge"), marked `verified` against an official summary; the pack does not apply EU law, it only
prints the user's wording.

---

## 3. Rounding policy

| What        | Mode            | Where                                                              |
| ----------- | --------------- | ------------------------------------------------------------------ |
| Line total  | `rounding.mode` | per line                                                           |
| Tax         | `rounding.mode` | per rate on the document (`per-document`) or per line (`per-line`) |
| Withholding | `rounding.mode` | once on the document                                               |

Totals are sums of rounded amounts, so `total = Σ lines + Σ tax` and `netPayable = total −
withholding` hold exactly.

---

## 4. Examples

All amounts are exact; each example is a golden fixture (section 6).

### 4.1 VAT 20 % (United Kingdom style)

Config: `{ taxLabel: 'VAT', tax: { kind: 'rate', rate: '20' } }`, currency GBP, a UK business
client. 12.5 h × £80.00 = **£1,000.00**; VAT 20 % = **£200.00**; total **£1,200.00**; net
payable £1,200.00.

### 4.2 GST 10 % (Australia style), and the effect of the tax scope

Config: `{ taxLabel: 'GST', tax: { kind: 'rate', rate: '10' } }`, currency AUD. Two lines of
A$10.05.

| `taxScope`     | `mode`     | Computation                         | GST      | Total |
| -------------- | ---------- | ----------------------------------- | -------- | ----- |
| `per-document` | `halfUp`   | 10 % × 20.10 = 2.010                | **2.01** | 22.11 |
| `per-line`     | `halfUp`   | 10 % × 10.05 = 1.005 -> 1.01, twice | **2.02** | 22.12 |
| `per-line`     | `halfEven` | 1.005 -> 1.00, twice                | **2.00** | 22.10 |

A single line of A$1,234.56: GST 123.456 -> **A$123.46**, total **A$1,358.02**.

### 4.3 No tax, with a note

Config: `{ taxLabel: 'VAT', tax: { kind: 'none', note: 'TVA non applicable, art. 293 B du CGI' } }`
(the wording of the French small-business franchise, given here only as an example of
user-supplied text). 15 h × €100.00 = **€1,500.00**; no tax; total and net payable **€1,500.00**;
the note is printed.

### 4.4 Reverse charge

Config: `{ taxLabel: 'VAT', tax: { kind: 'rate', rate: '19' }, reverseCharge: { mode:
'foreign-business-clients', supplierCountry: 'DE', note: 'Reverse charge' } }`.

- Client in France, `business`, `vatId: 'FR12345678901'`: 20 h × €90.00 = **€1,800.00** in group
  `reverse-charge`; no tax; total **€1,800.00**; note "Reverse charge".
- Same invoice to a client in Germany: VAT 19 % = **€342.00**, total **€2,142.00**.
- Client in France without `vatId`: reverse charge still applied (the user configured it), with
  the warning `generic.reverse-charge-without-vat-id`.

### 4.5 Withholding (illustrative)

Config: `{ taxLabel: 'IVA', tax: { kind: 'rate', rate: '21' }, withholding: { label: 'IRPF',
rate: '15', appliesTo: 'business-clients' } }`, a business client. Fees **€1,000.00**; IVA 21 % =
**€210.00**; total **€1,210.00**; withholding 15 % × 1,000.00 = **€150.00**; net payable
**€1,060.00**. This shows the mechanism only: it is not a Spanish tax pack, and the real rules
(rates by year and situation, invoice wording) belong in one.

### 4.6 Disbursement and exempt line

Config as 4.1 with `exemptNote: 'Exempt supply'`. Lines: £500.00 standard, £200.00 `exempt`,
£40.00 `excluded`. VAT 20 % × 500.00 = £100.00; summary `tax-20` 500.00/100.00, `exempt`
200.00/0.00, `excluded` 40.00/0.00; total **£840.00**.

---

## 5. Messages

Keys (both `en` and `it` required): `meta.name` ("Generic" / "Generico"), `meta.description`,
`meta.disclaimer`, `generic.rule.*.title`, `generic.group.tax` ("{label} {rate}"),
`generic.group.exempt`, `generic.group.out-of-scope`, `generic.group.no-tax`,
`generic.group.reverse-charge`, `generic.group.excluded`, `generic.component.tax` ("{label}"),
`generic.component.withholding` ("{label}"), `generic.trace.*`, `generic.formula.*`,
`generic.warning.*`, `generic.issue.*`, `generic.note.custom` ("{text}"),
`generic.rounding.description`. User-supplied labels and notes are passed as `text` parameters,
so they are printed verbatim in every locale.

---

## 6. Test plan and golden fixtures

Table-driven tests for every row of the classification table, every withholding condition, both
tax scopes with every rounding mode on tie values, the per-invoice option, and every warning and
issue code. Property tests specific to the pack: with `tax.kind === 'none'` there is never a `tax`
component; `per-document` tax is within half a minor unit of the exact tax per group;
`per-line` tax is within half a minor unit per line; withholding never exceeds the
non-excluded subtotal. The shared conformance suite runs with valid configs covering every
option.

Fixtures (`packages/tax-pack-generic/fixtures/invoices/`): `vat-20-gbp`, `gst-10-per-document`,
`gst-10-per-line-half-up`, `gst-10-per-line-half-even`, `gst-10-single-line`, `no-tax-with-note`,
`reverse-charge-foreign-business`, `reverse-charge-domestic-client`,
`reverse-charge-missing-vat-id`, `withholding-business-client`, `withholding-private-client`
(none withheld), `exempt-and-excluded-lines`, `jpy-zero-decimals` (¥ amounts, exponent 0),
`kwd-three-decimals` (exponent 3), `error-rate-not-allowed`.

---

## 7. Limitations

- Prices are always tax-exclusive; tax-inclusive (gross) pricing is not supported.
- One tax per line: no compound or stacked taxes (Canadian GST + PST/QST, US state + local sales
  tax, Indian CGST + SGST split). A country that needs them needs its own pack (and possibly an
  engine ADR, see the engine design's open points).
- No thresholds, registration limits, stamp duties, social-security contributions or
  regime-specific wording.
- Reverse-charge detection compares countries only; it does not know the EU, VIES, the
  place-of-supply rules or exceptions.
- No cash rounding (CHF 0.05 and similar).
- The pack never validates the legal correctness of the user's rates or wording.
