/**
 * English catalog: the source locale, required for every key. Every text the pack produces (group
 * labels, trace steps, legal notes, warnings, refusals) is a message key with typed parameters,
 * formatted per locale later.
 *
 * Syntax: a strict subset of ICU MessageFormat. Placeholders are `{name}`; the parameter's type
 * (money, percent, date, text...) decides the formatting, so there is no `{x, number}`, plural or
 * select (use separate keys). An ASCII apostrophe directly before a brace is an error (ICU reads
 * it as quoting): write the typographic ’ there. Keys `core.*` belong to tax-core; the engine's
 * own catalog provides `core.formula.percentage` ("{rate} × {base} = {amount}") for packs to reuse.
 */

// TEMPLATE: rename the keys' "xx." prefix to your pack id, and write the texts for your country.
// Keep the meta.* keys: meta.name, meta.description and meta.disclaimer are required in every
// locale. The disclaimer must say that the figures are informational and must be verified with
// an accountant.
export const en = {
  "meta.name": "Exampleland (template)",
  "meta.description":
    "Template pack for the fictional country of Exampleland: VAT at the standard or reduced rate, the small-business exemption and the income tax withholding. Copy it to start a pack for your country.",
  "meta.disclaimer":
    "Exampleland and its law are fictional: these figures show how a tax pack works and mean nothing for a real invoice. Figures computed by a real pack are informational: verify them with an accountant.",

  "xx.rule.classify-lines.title": "Line classification",
  "xx.rule.vat.title": "VAT",
  "xx.rule.small-business.title": "Small-business exemption",
  "xx.rule.withholding.title": "Withholding tax",

  "xx.group.vat": "VAT {rate}",
  "xx.group.small-business": "No VAT (small business)",
  "xx.group.small-business.reference": "art. 30 of the VAT Act",
  "xx.group.exempt": "Exempt",
  "xx.group.exempt.reference": "art. 12 of the VAT Act",
  "xx.group.out-of-scope": "Outside the scope of VAT",
  "xx.group.excluded": "Disbursements (outside the taxable amount)",

  "xx.component.vat": "VAT",
  "xx.component.withholding": "Withholding tax {rate}",

  "xx.trace.classify": "Lines classified into tax groups: {count}",
  "xx.trace.vat": "VAT at {rate} on the taxable amount",
  "xx.trace.vat.none": "No VAT: there is no taxable amount",
  "xx.trace.small-business":
    "Small-business exemption: no VAT is charged, and the invoice says why",
  "xx.trace.withholding": "Withholding tax: {rate} of the fees before VAT",
  "xx.trace.withholding.not-agent": "No withholding tax: the client is not a withholding agent",
  "xx.trace.withholding.skipped": "No withholding tax: disabled on this invoice",
  "xx.trace.withholding.no-base": "No withholding tax: the invoice has no fees",

  "xx.note.small-business":
    "VAT not charged: small-business exemption under article 30 of the Exampleland VAT Act.",
  "xx.note.custom": "{text}",

  "xx.warning.out-of-scope-without-reference":
    "A line outside the scope of VAT has no reference: the invoice must say why no VAT is charged.",

  "xx.issue.rate-without-vat":
    "Line “{line}”: a VAT rate ({rate}) cannot be used under the small-business exemption",
  "xx.issue.unknown-vat-rate":
    "Line “{line}”: {rate} is not an Exampleland VAT rate on the issue date (standard {standard}, reduced {reduced})",

  "xx.rounding.description":
    "Amounts are rounded half up to the minor unit of the currency: each line total, the VAT once per rate and the withholding tax once on the invoice.",
} as const;

export type XxMessageKey = keyof typeof en;
