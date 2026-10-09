<div align="center">

<!-- Logo placeholder: replace with docs/assets/logo.svg once the brand is ready -->
<img src="docs/assets/logo-placeholder.svg" alt="Fairhour logo" width="96" height="96" />

# Fairhour

**Every hour, fairly billed.**

Open-source, self-hostable time tracking that tells you _exactly_ what to put on your invoice:
taxable base, contributions, VAT, withholding, stamp duty, total and net payable, country by country.

[![CI](https://github.com/fabiovincenzi/fairhour/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/fabiovincenzi/fairhour/actions/workflows/ci.yml)
[![Coverage](https://codecov.io/gh/fabiovincenzi/fairhour/graph/badge.svg)](https://codecov.io/gh/fabiovincenzi/fairhour)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/fabiovincenzi/fairhour?include_prereleases&sort=semver)](https://github.com/fabiovincenzi/fairhour/releases)
[![Discussions](https://img.shields.io/github/discussions/fabiovincenzi/fairhour)](https://github.com/fabiovincenzi/fairhour/discussions)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/fabiovincenzi/fairhour/badge)](https://scorecard.dev/viewer/?uri=github.com/fabiovincenzi/fairhour)
<!-- ALL-CONTRIBUTORS-BADGE:START - Do not remove or modify this section -->

[![All Contributors](https://img.shields.io/badge/all_contributors-1-orange.svg?style=flat-square)](#contributors)
<!-- ALL-CONTRIBUTORS-BADGE:END -->

[Documentation](https://fabiovincenzi.github.io/fairhour/) ·
[Roadmap](ROADMAP.md) ·
[Self-hosting](https://fabiovincenzi.github.io/fairhour/self-hosting/) ·
[Contributing](CONTRIBUTING.md)

</div>

> [!WARNING]
> Fairhour is in early development. Tax figures are **informational**: always verify them with
> your accountant before issuing an invoice.

## Why Fairhour?

Time trackers tell you how many hours you worked. Fairhour also tells you what to invoice.
For a freelancer in Italy under the _regime forfettario_, 40 hours at €50/h is not simply
"€2,000": it is €2,000 + 4% INPS _rivalsa_ + €2 stamp duty, with the exemption wording the law
requires. Under the _regime ordinario_ it becomes VAT on top and a 20% _ritenuta d'acconto_
deducted from what the client pays you. Fairhour does that math for you, explains every step
with its legal source, and lets the community add other countries.

## Features

- ⏱️ **Time tracking**: one-click timer that survives reloads and syncs across tabs and devices,
  manual entries, edit/split/merge, overlap detection, per-project rounding (none/6/15/30 min),
  billable flag, tags and notes, plus natural-language quick add (`2h design Acme yesterday`).
- 🗂️ **Workspaces → clients → projects → tasks**, with roles (owner, admin, member, viewer)
  and an audit log.
- 💶 **Rates that resolve themselves**: task > project > client > workspace default; fixed-price
  projects; half/full-day rates; expenses, mileage and equipment line items; multi-currency
  with an explicit exchange rate per invoice.
- 🧮 **Pluggable tax engine**: country packs turn time into invoice amounts with a
  human-readable explanation trace. Ships with 🇮🇹 Italy (forfettario + ordinario) and a
  generic VAT/no-VAT pack usable anywhere.
- 📊 **Reports**: dashboards by day/week/month, client, project, task and tag; charts for hours,
  revenue, effective hourly rate and budget burn; PDF timesheets, CSV export and signed,
  expiring share links for clients.
- 🎯 **Budgets** with 80%/100% alerts and the _effective hourly rate_ of fixed-price work.
- 🖥️ **Desktop companion** (Tauri): tray timer, idle detection and private, opt-in activity
  suggestions that never leave your device.
- 🔌 **Public REST API** with OpenAPI spec, personal access tokens and webhooks.
- 🏠 **Self-hosting first**: one `docker compose up`, documented environment variables.
- 🌍 **Internationalized**: English and Italian, with more translations welcome.

## Screenshots

| Timer         | Invoice computation | Reports       |
| ------------- | ------------------- | ------------- |
| _coming soon_ | _coming soon_       | _coming soon_ |

## Quickstart (development)

Requirements: Node.js ≥ 22.18, pnpm (via `corepack enable`), Docker (for Postgres and Mailpit).

```bash
git clone https://github.com/fabiovincenzi/fairhour.git
cd fairhour
corepack enable
pnpm install
cp .env.example .env
docker compose up -d        # Postgres + Mailpit
pnpm db:migrate && pnpm db:seed
pnpm dev                    # web app on http://localhost:3000
```

## Self-hosting

```bash
curl -O https://raw.githubusercontent.com/fabiovincenzi/fairhour/main/deploy/docker-compose.yml
curl -O https://raw.githubusercontent.com/fabiovincenzi/fairhour/main/.env.example
mv .env.example .env        # set BETTER_AUTH_SECRET, APP_URL, SMTP_* …
docker compose up -d
```

See the [self-hosting guide](https://fabiovincenzi.github.io/fairhour/self-hosting/) for
environment variables, backups and upgrades.

## Tax packs

| Pack                         | Status                                                                                                             | Regimes                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `@fairhour/tax-pack-it`      | 🟢 reference                                                                                                       | Regime forfettario, regime ordinario (VAT, ritenuta, INPS rivalsa, casse, stamp duty) |
| `@fairhour/tax-pack-generic` | 🟢 stable                                                                                                          | Configurable VAT/GST or no-VAT, optional withholding                                  |
| Your country?                | 🙋 [help wanted](https://github.com/fabiovincenzi/fairhour/issues?q=is%3Aissue+is%3Aopen+label%3Atax-pack-request) | [How to add a tax pack](docs/contributing/tax-packs.md)                               |

## Roadmap

See [ROADMAP.md](ROADMAP.md) and the [milestones](https://github.com/fabiovincenzi/fairhour/milestones).
The whole backlog lives as code in [`.github/backlog`](.github/backlog) and is synced to GitHub issues.

## Contributing

Contributions of every size are welcome: code, translations, tax packs for your country,
docs and bug reports. Start with [CONTRIBUTING.md](CONTRIBUTING.md) and the
[`good first issue`](https://github.com/fabiovincenzi/fairhour/labels/good%20first%20issue) label.
All commits must be signed off ([DCO](https://developercertificate.org/)).

## Contributors

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/fabiovincenzi"><img src="https://avatars.githubusercontent.com/fabiovincenzi?s=100" width="100px;" alt="fabiovincenzi"/><br /><sub><b>fabiovincenzi</b></sub></a><br /><a href="#maintenance-fabiovincenzi" title="Maintenance">🚧</a> <a href="#ideas-fabiovincenzi" title="Ideas, Planning, & Feedback">🤔</a></td>
    </tr>
  </tbody>
</table>
<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->
<!-- ALL-CONTRIBUTORS-LIST:END -->

## License

The Fairhour applications are licensed under the [GNU AGPL-3.0](LICENSE). The reusable
libraries `@fairhour/money`, `@fairhour/tax-core` and `@fairhour/tax-pack-*` are MIT-licensed
so that anyone can embed the tax engine. Documentation is licensed under
[CC BY 4.0](docs/LICENSE). See [ADR-0002](docs/adr/0002-licensing.md).
