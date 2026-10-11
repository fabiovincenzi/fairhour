/**
 * English catalog of the Italian pack. English is the source locale; legal notes are printed in
 * Italian (`documentLocale: "it"`), so their English texts are translations for reading
 * (docs/tax-packs/it.md, section 12). Placeholders follow the tax-core ICU subset: no apostrophe
 * directly before a brace.
 */
export const en = {
  "meta.name": "Italy",
  "meta.description":
    "Italian self-employed professionals: regime forfettario and regime ordinario, with VAT, withholding tax (ritenuta d'acconto), INPS rivalsa, professional funds, stamp duty and split payment.",
  "meta.disclaimer":
    "Figures are informational and must be verified with your accountant before you issue an invoice.",

  "it.rule.common.classify-lines.title": "Line classification",
  "it.rule.common.general-expenses.title": "General expenses (lawyers)",
  "it.rule.common.cassa.title": "Professional fund contribution",
  "it.rule.common.inps-rivalsa.title": "INPS rivalsa",
  "it.rule.ordinario.vat.title": "VAT",
  "it.rule.ordinario.withholding.title": "Withholding tax (ritenuta d'acconto)",
  "it.rule.forfettario.no-vat.title": "No VAT (flat-rate scheme)",
  "it.rule.forfettario.no-withholding.title": "No withholding (flat-rate scheme)",
  "it.rule.common.stamp-duty.title": "Stamp duty",
  "it.rule.ordinario.split-payment.title": "Split payment",

  "it.group.vat": "VAT {rate}",
  "it.group.n2-2-forfettario": "N2.2 – Not subject to VAT (flat-rate scheme)",
  "it.group.n2-2": "N2.2 – Not subject to VAT (other cases)",
  "it.group.n2-1": "N2.1 – Not subject to VAT (arts. 7 to 7-septies)",
  "it.group.n4": "N4 – Exempt",
  "it.group.n1": "N1 – Excluded under art. 15",
  "it.group.reference.forfettario": "Law no. 190/2014, art. 1, paragraphs 54-89",
  "it.group.reference.art7-ter": "Presidential Decree no. 633/1972, art. 7-ter",
  "it.group.reference.art10": "Presidential Decree no. 633/1972, art. 10",
  "it.group.reference.art15": "Presidential Decree no. 633/1972, art. 15",

  "it.reason.forfettario": "no VAT under the flat-rate scheme",
  "it.reason.vat": "subject to VAT at {rate}",
  "it.reason.art15": "paid in the client's name and on the client's behalf, outside the VAT base",
  "it.reason.exempt": "exempt from VAT",
  "it.reason.out-of-scope": "not subject to VAT",
  "it.reason.reverse-charge-eu":
    "business client in another EU member state: the client accounts for the VAT (reverse charge)",
  "it.reason.outside-eu": "business client outside the EU: not subject to Italian VAT",
  "it.reference.art10": "art. 10 of Presidential Decree no. 633/1972",

  "it.note.forfettario":
    "Transaction under the flat-rate scheme (regime forfettario) pursuant to article 1, paragraphs 54 to 89, of Law no. 190/2014 as amended.",
  "it.note.forfettario-no-withholding":
    "Please do not apply withholding tax: under article 1, paragraph 67, of Law no. 190/2014 this income is subject to a substitute tax.",
  "it.note.art15":
    "Expenses paid in the client's name and on the client's behalf, excluded from the VAT base under article 15(1)(3) of Presidential Decree no. 633/1972.",
  "it.note.exempt": "VAT-exempt transaction ({reference}).",
  "it.note.out-of-scope": "Transaction outside the scope of VAT ({reference}).",
  "it.note.out-of-scope-generic": "Transaction outside the scope of VAT.",
  "it.note.reverse-charge-eu":
    "Reverse charge: not subject to Italian VAT under article 7-ter of Presidential Decree no. 633/1972.",
  "it.note.outside-eu":
    "Not subject to VAT under article 7-ter of Presidential Decree no. 633/1972.",
  "it.note.stamp-duty":
    "Stamp duty paid virtually under article 6 of the Ministerial Decree of 17 June 2014.",
  "it.note.split-payment":
    "Split payment under article 17-ter of Presidential Decree no. 633/1972.",
  "it.note.custom": "{text}",

  "it.component.general-expenses": "General expenses {rate}",
  "it.component.cassa": "{name} contribution {rate}",
  "it.component.inps-rivalsa": "INPS rivalsa {rate}",
  "it.component.vat": "VAT",
  "it.component.withholding": "Withholding tax {rate}",
  "it.component.stamp-duty": "Stamp duty",
  "it.component.split-payment": "VAT paid by the client (split payment)",

  "it.trace.classify.none": "No lines to classify",
  "it.trace.classify.group": "{group}: {amount} ({reason})",
  "it.trace.general-expenses": "Flat general expenses of {rate} of the fee",
  "it.trace.general-expenses.none": "No general expenses: the invoice has no fee",
  "it.trace.cassa": "{name} integrative contribution of {rate} on the fees and general expenses",
  "it.trace.cassa.none": "No {name} contribution: the invoice has no fees",
  "it.trace.inps-rivalsa": "INPS rivalsa of {rate} on the fees",
  "it.trace.inps-rivalsa.none": "No INPS rivalsa: the invoice has no fees",
  "it.trace.vat": "VAT at {rate} on the taxable amount",
  "it.trace.vat.none": "No VAT: no part of the invoice is subject to Italian VAT",
  "it.trace.withholding.not-agent":
    "No withholding: the client is not a withholding agent (sostituto d'imposta)",
  "it.trace.withholding.no-base": "No withholding: the invoice has no fees",
  "it.trace.withholding.gross":
    "Amount subject to withholding: fees, general expenses and INPS rivalsa (the fund contribution, VAT, disbursements, goods and stamp duty are excluded)",
  "it.trace.withholding.share": "Withholding base: {share} of that amount",
  "it.trace.withholding": "Withholding tax of {rate}, retained by the client and paid to the State",
  "it.trace.forfettario.no-vat":
    "No VAT: the flat-rate scheme does not charge VAT (Law no. 190/2014, art. 1, para. 58)",
  "it.trace.forfettario.no-withholding.note":
    "No withholding on flat-rate fees (Law no. 190/2014, art. 1, para. 67): the invoice asks the client not to withhold",
  "it.trace.forfettario.no-withholding.not-agent":
    "No withholding on flat-rate fees (Law no. 190/2014, art. 1, para. 67); no note: the client is not a withholding agent",
  "it.trace.forfettario.no-withholding.disabled":
    "No withholding on flat-rate fees (Law no. 190/2014, art. 1, para. 67); the note is disabled in the settings",
  "it.trace.stamp-duty.not-due":
    "No stamp duty: the amount not subject to VAT, {base}, does not exceed {threshold}",
  "it.trace.stamp-duty.override":
    "No stamp duty: marked as not due for this invoice (per-invoice option)",
  "it.trace.stamp-duty.charged":
    "Stamp duty of {amount} charged to the client: the amount not subject to VAT, {base}, exceeds {threshold}",
  "it.trace.stamp-duty.absorbed":
    "Stamp duty of {amount} paid by the professional, not added to the total: the amount not subject to VAT, {base}, exceeds {threshold}",
  "it.trace.stamp-duty.credit-note":
    "Stamp duty of {amount} on a credit note, shown for information and not added to the total: the amount not subject to VAT, {base}, exceeds {threshold}",
  "it.trace.split-payment.withholding":
    "No split payment: fees subject to withholding are excluded (art. 17-ter, para. 1-sexies, Presidential Decree no. 633/1972)",
  "it.trace.split-payment.expired": "No split payment: the EU authorisation ended on {date}",
  "it.trace.split-payment.no-vat": "No split payment: the invoice has no VAT",
  "it.trace.split-payment":
    "Split payment: the client pays the VAT of {amount} directly to the State",
  "it.trace.revenue.not-applicable":
    "The revenue ceiling applies only to the flat-rate scheme (regime forfettario)",
  "it.trace.revenue.total": "Fees collected in {year} up to {asOf}: {total} (receipts: {count})",
  "it.trace.revenue.prorated":
    "First year of activity, started on {start}: the ceiling is pro-rated to {days} days",
  "it.trace.revenue.ceiling.ok": "{total} is {ratio} of the {limit} ceiling: within the limit",
  "it.trace.revenue.ceiling.approaching":
    "{total} is {ratio} of the {limit} ceiling, at or above the warning level of {warningRatio}",
  "it.trace.revenue.ceiling.exceeded":
    "{total} exceeds the {limit} ceiling (since {date}, {ratio} of it): the flat-rate scheme ends on 31 December and the ordinary regime applies from {nextYear}",
  "it.trace.revenue.immediate-exit.ok":
    "{total} does not exceed the immediate exit limit of {limit}",
  "it.trace.revenue.immediate-exit.exceeded":
    "{total} exceeds {limit} (on {date}): the flat-rate scheme ends immediately and VAT is due from the transaction that exceeded the limit",
  "it.trace.revenue.immediate-exit.none": "No immediate exit limit before 2023",

  "it.formula.percentage": "{rate} × {base} = {amount}",
  "it.formula.withholding-gross": "{fees} + {generalExpenses} + {rivalsa} = {gross}",
  "it.formula.above-threshold": "{base} > {threshold}",
  "it.formula.not-above-threshold": "{base} ≤ {threshold}",
  "it.formula.prorata": "{ceiling} × {days} / 365 = {limit}",

  "it.warning.forfettario.treatment-ignored":
    "Exempt and out-of-scope treatments are ignored under the flat-rate scheme: no line carries VAT anyway.",
  "it.warning.forfettario.foreign-business-client":
    "Business client outside Italy under the flat-rate scheme: the invoice uses N2.2 and the flat-rate note. Whether the art. 7-ter annotations (N2.1, reverse charge) are also required is to be verified with your accountant.",
  "it.warning.client.eu-business-without-vat-id":
    "Reverse charge for an EU business client without a VAT number: add the client's VAT number (check it in VIES).",
  "it.warning.out-of-scope.missing-reference":
    "A line is not subject to VAT but has no legal reference: add the provision (for example the article of Presidential Decree no. 633/1972) to the line.",
  "it.warning.goods-lines":
    "Goods are not fees: they are excluded from the fund contribution, the INPS rivalsa and the withholding base.",
  "it.warning.cassa.rate-to-be-verified":
    "The {rate} rate of {name} is still to be verified: check it with the fund or set the rate in the settings.",
  "it.warning.withholding.foreign-agent":
    "A client outside Italy is marked as a withholding agent: withholding is applied, but check that the client really is an Italian sostituto d'imposta.",
  "it.warning.stamp-duty.override":
    "Stamp duty marked as not due for this invoice: make sure an exemption applies.",
  "it.warning.stamp-duty.credit-note-absorbed":
    "Stamp duty on a credit note is shown for information and is not added to the total.",
  "it.warning.split-payment.authorisation-expired":
    "The EU authorisation of the split payment ended on {date}: split payment is not applied.",
  "it.warning.revenue.approaching": "Revenue is approaching the flat-rate scheme ceiling.",
  "it.warning.revenue.exceeded":
    "Revenue exceeds the flat-rate scheme ceiling: the ordinary regime applies from next year.",
  "it.warning.revenue.immediate-exit":
    "Revenue exceeds the immediate exit limit: the flat-rate scheme ends now and VAT is due from the transaction that exceeded the limit.",
  "it.warning.revenue.leap-year":
    "The ceiling is pro-rated over 365 days; whether a leap year counts 366 is to be verified.",

  "it.issue.currency-not-eur":
    "The Italian pack computes invoices in euro, and this one is in {currency}: convert the prices to EUR first.",
  "it.issue.forfettario.rate-not-allowed":
    "A VAT rate ({rate}) cannot be applied under the flat-rate scheme, which charges no VAT.",
  "it.issue.ordinario.unknown-vat-rate":
    "{rate} is not an Italian VAT rate (allowed rates, in percent: {allowed}).",
  "it.issue.split-payment.withholding-conflict":
    "Split payment cannot be applied to fees subject to withholding (art. 17-ter, para. 1-sexies, Presidential Decree no. 633/1972).",

  "it.threshold.ceiling": "Flat-rate scheme ceiling (revenue and fees)",
  "it.threshold.immediate-exit": "Immediate exit limit of the flat-rate scheme",

  "it.rounding.description":
    "Line totals, contributions (once per tax group), VAT (once per rate, on the summary) and withholding (once per document) are rounded half up to the cent; totals are sums of rounded amounts.",
};

export type ItMessageKey = keyof typeof en;
