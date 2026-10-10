/**
 * English catalog (the source locale). `{label}` is the user's tax label ("VAT", "GST", "Sales
 * tax") and `{text}` a user-supplied note: both are `text` parameters, printed verbatim in every
 * locale.
 */
export const en = {
  "meta.name": "Generic",
  "meta.description":
    "Configurable VAT, GST or sales tax, or no tax, with optional reverse charge, exemption wording and withholding. Works in any country and currency.",
  "meta.disclaimer":
    "This pack applies the rates, labels and wording of your tax settings; it does not know your country's law. Figures are informational: check your settings and your invoices with an accountant or your tax authority.",

  "generic.rule.classify-lines.title": "Line classification",
  "generic.rule.tax.title": "Tax",
  "generic.rule.withholding.title": "Withholding",
  "generic.rule.notes.title": "Invoice notes",

  "generic.group.tax": "{label} {rate}",
  "generic.group.reverse-charge": "Reverse charge",
  "generic.group.no-tax": "No {label}",
  "generic.group.exempt": "Exempt",
  "generic.group.out-of-scope": "Out of scope",
  "generic.group.excluded": "Disbursements (outside the taxable amount)",

  "generic.component.tax": "{label}",
  "generic.component.withholding": "{label}",

  "generic.trace.classify": "Lines classified into tax groups: {count}",
  "generic.trace.no-tax": "No {label}: the tax settings say that no tax applies",
  "generic.trace.reverse-charge.forced":
    "Reverse charge, forced on this invoice: the client accounts for the {label}",
  "generic.trace.reverse-charge.foreign-business":
    "Reverse charge: business client in {clientCountry}, supplier in {supplierCountry}, so the client accounts for the {label}. The pack compares countries only: checking that the reverse charge is allowed (EU membership, VAT registration, place of supply) is your responsibility",
  "generic.trace.reverse-charge.skipped": "No reverse charge: disabled on this invoice",
  "generic.trace.reverse-charge.not-business": "No reverse charge: the client is not a business",
  "generic.trace.reverse-charge.domestic":
    "No reverse charge: the client is in the supplier's country ({country})",
  "generic.trace.tax": "{label} at {rate} on the taxable amount",
  "generic.trace.tax.line": "{label} at {rate} on “{description}”",
  "generic.trace.tax.per-line": "{label} at {rate}: the tax of each line, rounded and added up",
  "generic.trace.tax.none": "No {label}: there is no taxable amount",
  "generic.trace.withholding": "{label}: {rate} of the amount before tax, disbursements excluded",
  "generic.trace.withholding.not-agent": "No {label}: the client is not a withholding agent",
  "generic.trace.withholding.individual": "No {label}: the client is a private individual",
  "generic.trace.withholding.no-base": "No {label}: there is no amount to withhold on",

  "generic.formula.tax-per-line": "{rate} × {base}, rounded line by line = {amount}",

  "generic.warning.exempt-without-note":
    "An exempt line has no reference and no exemption note is configured: the invoice may need to say why no tax is charged.",
  "generic.warning.reverse-charge-without-vat-id":
    "Reverse charge applied, but the client has no VAT number: reverse-charge invoices usually need the client's VAT identification number.",

  "generic.issue.rate-not-allowed":
    "Line “{line}”: the rate {rate} is not one of the rates configured for {label}",
  "generic.issue.rate-without-tax":
    "Line “{line}”: a rate ({rate}) cannot be used because the tax settings say that no tax applies",

  "generic.note.custom": "{text}",

  "generic.rounding.description":
    "Line totals, {label} and withholdings are rounded to the currency's minor unit, {mode}; {label} is rounded {scope}.",
  "generic.rounding.description-no-tax":
    "Line totals and withholdings are rounded to the currency's minor unit, {mode}.",
  "generic.rounding.mode.half-up": "half up (ties away from zero)",
  "generic.rounding.mode.half-even": "half even (ties to the even digit)",
  "generic.rounding.mode.half-down": "half down (ties toward zero)",
  "generic.rounding.mode.up": "up (away from zero)",
  "generic.rounding.mode.down": "down (toward zero)",
  "generic.rounding.mode.ceiling": "toward positive infinity",
  "generic.rounding.mode.floor": "toward negative infinity",
  "generic.rounding.scope.per-document": "once per rate on the whole document",
  "generic.rounding.scope.per-line": "on each line, then added up",
} as const;

export type GenericMessageKey = keyof typeof en;
