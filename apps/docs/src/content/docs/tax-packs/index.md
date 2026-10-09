---
title: Tax packs
description: What a tax pack is, which packs exist and how to add your country.
sidebar:
  label: Overview
  order: 0
---

A **tax pack** is the part of Fairhour that knows the rules of one country. The engine hands it an
invoice (lines, client, date, the freelancer's tax profile) and it returns the exact amounts to
put on that invoice, each with an explanation and a legal source.

:::danger[Informational figures]
Tax rules change and depend on your situation. Fairhour's figures are **informational**: always
verify them with your accountant before you issue an invoice.
:::

## What a pack contains

- A **configuration** schema: the choices a freelancer makes once (for Italy: the regime, the
  social security scheme, who pays the stamp duty), validated with zod.
- A **rule pipeline**: small, ordered rules, each citing its law in the code and in the pack's
  documentation page.
- **Parameters versioned by date** (rates, thresholds, amounts), so an invoice is computed with
  the rules in force on its issue date.
- The **legal wording** the invoice must carry, per locale.
- The **explanation trace**: one entry per step, with the rule, the amounts and the source.

Packs are pure functions with no I/O, so they give the same result on the server, in the browser
(live invoice previews) and in the desktop app. Money is exact: integers in minor units and
decimals parsed from strings, with every rounding named. Every pack must pass the shared
**conformance suite** and has golden fixtures.

The design is written down in the [tax engine design](/fairhour/design/tax-engine/),
[ADR-0003](/fairhour/adr/0003-money-representation/) (money) and
[ADR-0004](/fairhour/adr/0004-tax-engine-architecture/) (engine architecture).

## Available packs

The packs are specified; the implementation lands in v0.2 (Core & Tax Engine).

| Pack                          | Country | Covers                                                                                            | Documentation                                                     |
| ----------------------------- | ------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `@fairhour/tax-pack-it`       | Italy   | Regime forfettario and regime ordinario: VAT, ritenuta d'acconto, INPS rivalsa, casse, stamp duty | [Italy tax pack](/fairhour/tax-packs/it/)                         |
| `@fairhour/tax-pack-generic`  | Any     | A configurable tax label and rate (VAT, GST, sales tax) or none, wording, optional withholding    | [Generic tax pack](/fairhour/tax-packs/generic/)                  |
| `@fairhour/tax-pack-template` | None    | A copy-me template with `TEMPLATE` markers for new packs                                          | [Pack layout](/fairhour/design/tax-engine/#8-pack-package-layout) |

Every page of this section is documentation of one pack, written next to the code in
`docs/tax-packs/`.

## Add your country

Tax packs are the best way to make Fairhour useful where you live, and they do not need to be
written by a developer alone: an accountant who knows the rules and a developer who knows the
toolchain make a good pair.

1. Open a [tax pack request](https://github.com/fabiovincenzi/fairhour/issues/new?template=tax_pack_request.yml)
   so that we can agree on the scope.
2. Copy `packages/tax-pack-template` and model the configuration.
3. Implement each rule with its legal source, add golden fixtures and pass the conformance suite.
4. Document the pack in `docs/tax-packs/<country>.md`.

The step-by-step guide, `docs/contributing/tax-packs.md`, is coming soon (v0.2). Until then, the
[contributing guides](/fairhour/contributing/) and the [tax engine design](/fairhour/design/tax-engine/)
are the best starting points. Open requests for countries are listed under the
[`tax-pack-request` label](https://github.com/fabiovincenzi/fairhour/issues?q=is%3Aissue+is%3Aopen+label%3Atax-pack-request).

## License

The packs are MIT-licensed so that anyone, including proprietary invoicing software, can embed
them. The documentation is CC BY 4.0: quote it and translate it with attribution. See the
[license summary](/fairhour/license/).
