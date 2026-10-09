---
title: Invoices and taxes
description: How Fairhour will turn billable time into the exact amounts of an invoice, with an explanation of every step.
sidebar:
  order: 3
  badge:
    text: Planned
    variant: caution
---

:::caution[In development]
This guide describes the planned behavior. The tax engine ships in v0.2 (Core & Tax Engine), the
invoice screen in v0.4 (Web MVP), PDF and CSV exports in v0.5 and the FatturaPA XML export in
v0.10. Details may change before then.
:::

:::danger[Informational figures]
The amounts Fairhour computes are **informational**. Always verify them with your accountant
before you issue an invoice. Fairhour does not provide tax or legal advice.
:::

## From time to invoice

1. **Choose a workspace tax profile.** Pick a tax pack (for example Italy, or the generic pack for
   any other country) and fill in its settings in a form generated from the pack's configuration.
   Mistakes are reported inline.
2. **Pick a client and a period.** Fairhour collects the billable entries and builds the invoice
   lines. You choose the grouping: one line per project, per task, per entry, or a single line.
   Quantities and prices are exact decimals, and rounding follows the project's setting.
3. **Review the computation.** The workspace's tax pack computes every amount and the screen
   shows them together with the explanation.
4. **Save.** Saving stores an **immutable snapshot** of the computation, so a later change to a
   rate or a rule never alters an invoice you already prepared.

## What you get

For every invoice the tax pack returns:

- the subtotal and the **taxable base**,
- contributions, taxes and withholdings, each with its rate and base,
- **stamp duty** where it applies,
- the **total** and the **net payable** amount,
- the **legal notes** the invoice must carry, and any **warnings**,
- the **explanation trace**.

Totals reconcile exactly: the engine checks that the components add up to the total and fails
loudly when they do not.

## The explanation trace

Each step of the computation appears as a line: what was computed, from which amounts, and which
rule and legal source produced it. Trace messages are localizable, starting with English and Italian. The trace is what
lets you (and your accountant) check an amount instead of trusting it.

## An example: Italy

Twenty hours at €50.00, so €1,000.00 of fees, for a freelancer who adds the 4% INPS _rivalsa_:

|                    | Regime forfettario | Regime ordinario |
| ------------------ | ------------------ | ---------------- |
| Fees               | €1,000.00          | €1,000.00        |
| INPS rivalsa (4%)  | €40.00             | €40.00           |
| VAT (22%)          | none               | €228.80          |
| Stamp duty         | €2.00              | not due          |
| **Total**          | **€1,042.00**      | **€1,268.80**    |
| Ritenuta d'acconto | none               | −€208.00         |
| **Net payable**    | **€1,042.00**      | **€1,060.80**    |

The [Italy tax pack](/fairhour/tax-packs/it/#9-worked-examples) documents each rule, its source
and more examples, and the [generic pack](/fairhour/tax-packs/generic/) covers VAT, GST and
sales tax in any other country.

## Exports

- A **PDF timesheet** for a client and period, to attach to the invoice (v0.5).
- A **CSV export** of the filtered entries (v0.5).
- A **FatturaPA XML** file for Italian electronic invoicing, validated against the official
  schema and downloaded from the invoice screen (v0.10).
- A **read-only share link** for a report, signed, expiring and revocable (v0.5).
