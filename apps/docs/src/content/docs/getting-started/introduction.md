---
title: Introduction
description: What Fairhour is, how it works and what exists today.
sidebar:
  order: 1
---

Fairhour is an open-source, self-hostable time tracker that turns tracked time into **the exact
amounts to put on an invoice**. A pluggable, country-specific tax engine does the arithmetic,
explains every step with its legal source, and lets the community add other countries. Italy is
the reference pack.

:::caution[Early development]
Fairhour is at the start of its roadmap: today the repository holds the tooling, the
documentation site and the design of the tax engine. Pages in this site that describe a feature
that does not exist yet say so and name the release that brings it. Tax figures are
**informational**: always verify them with your accountant before issuing an invoice.
:::

## Why Fairhour

Time trackers tell you how many hours you worked. Fairhour also tells you what to invoice.

For a freelancer in Italy under the _regime forfettario_, 20 hours at €50.00 is not simply
€1,000.00: it is €1,000.00 plus €40.00 of 4% INPS _rivalsa_ plus €2.00 of stamp duty, with the
exemption wording the law requires, for a total of €1,042.00. Under the _regime ordinario_ the
same work becomes VAT on top and a 20% _ritenuta d'acconto_ deducted from what the client pays
you. Fairhour does that arithmetic for you, shows each step, and cites the rule behind it. The
[Italy tax pack](/fairhour/tax-packs/it/#9-worked-examples) has the worked examples.

## How it works

1. **Organize.** A workspace holds clients, which hold projects, which hold tasks. Each level can
   carry a rate, and the most specific one wins
   ([rates and budgets](/fairhour/guides/rates-and-budgets/)).
2. **Track.** Start a timer, add entries by hand or type `2h design Acme yesterday`
   ([time tracking](/fairhour/guides/time-tracking/)).
3. **Invoice.** Pick a client and a period. Fairhour builds the invoice lines from the billable
   time, hands them to the workspace's tax pack and shows every amount with its explanation
   ([invoices and taxes](/fairhour/guides/invoices-and-taxes/)).
4. **Report.** Dashboards, PDF timesheets and CSV exports show where the time and the money went.

## Principles

- **Exact money.** Amounts are integers in minor units (`bigint`), never floats, and every
  rounding names its mode ([ADR-0003](/fairhour/adr/0003-money-representation/)).
- **Every number is explained.** A tax pack cites the law for each rule, and the invoice screen
  shows the trace step by step ([ADR-0004](/fairhour/adr/0004-tax-engine-architecture/)).
- **Self-hosting first.** One container plus PostgreSQL, no dependency on a hosting vendor and no
  data leaving your instance unless you configure it
  ([self-hosting](/fairhour/self-hosting/)).
- **Accessible and international.** The interface targets WCAG 2.2 AA and ships in English and
  Italian, with more translations welcome.
- **Open.** The product is AGPL-3.0, the tax engine is MIT so that anyone can embed it, and these
  docs are CC BY 4.0 ([license](/fairhour/license/)).

## Roadmap

Releases follow the milestones of the project's backlog. Each milestone is one phase of the work;
the [milestone list on GitHub](https://github.com/fabiovincenzi/fairhour/milestones) tracks the
details.

| Release | Name                  | What it brings                                                                   | Status      |
| ------- | --------------------- | -------------------------------------------------------------------------------- | ----------- |
| v0.1    | Foundation            | Monorepo tooling, CI, governance, backlog as code, this documentation site       | In progress |
| v0.2    | Core & Tax Engine     | Exact money, time math, rates, the `TaxPack` engine, Italy and generic packs     | Planned     |
| v0.3    | Data & Auth           | PostgreSQL schema, migrations, sign-in, workspaces and roles, tenant isolation   | Planned     |
| v0.4    | Web MVP               | Clients, projects, timer, entries, rates, invoice computation screen, en and it  | Planned     |
| v0.5    | Reports               | Dashboards, charts, PDF timesheets, CSV export, signed share links               | Planned     |
| v0.6    | Hardening             | End-to-end and accessibility tests, security headers, rate limiting, performance | Planned     |
| v0.7    | Public API & Webhooks | REST API with OpenAPI, personal access tokens, outgoing webhooks                 | Planned     |
| v0.8    | Self-hosting          | Production compose file, container images, release pipeline, self-hosting guide  | Planned     |
| v0.9    | Desktop Companion     | Tray timer, idle detection, private activity suggestions                         | Planned     |
| v0.10   | FatturaPA             | FatturaPA XML export validated against the official schema                       | Planned     |
| v1.0    | Launch                | Launch polish, demo data, documentation pass                                     | Planned     |

## Where to go next

- Run the code and the docs site locally: [quickstart](/fairhour/getting-started/quickstart/).
- See how the tax engine is built: [tax packs](/fairhour/tax-packs/) and the
  [engine design](/fairhour/design/tax-engine/).
- Help out: [contributing](/fairhour/contributing/).
