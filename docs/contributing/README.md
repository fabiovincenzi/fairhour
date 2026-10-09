# Contributing guides

Fairhour is built in the open, and every kind of contribution counts: code, tax packs,
translations, documentation, design, bug reports and reviews. Start with
[CONTRIBUTING.md](../../CONTRIBUTING.md) for the development setup, the workflow, the commit
conventions and the DCO sign-off, then pick the guide for what you want to do.

| I want to...                        | Read                                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------------------- |
| Set up my machine and send a change | [Contributing to Fairhour](../../CONTRIBUTING.md)                                           |
| Add or improve a translation        | [Translating Fairhour](translations.md)                                                     |
| Add a tax pack for my country       | The tax pack guide is coming soon (TAX-009, release v0.2). Until then, see the notes below. |
| Understand how the tax engine fits  | [Tax engine design](../design/tax-engine.md) and the [ADR index](../adr/README.md)          |
| Understand how decisions are made   | [Governance](../../GOVERNANCE.md)                                                           |
| Report a security problem           | [Security policy](../../SECURITY.md), never in a public issue                               |
| Help run the project                | [Maintainer handbook](../maintainers/README.md)                                             |

Everyone who takes part follows the [Code of Conduct](../../CODE_OF_CONDUCT.md).

## Adding a tax pack

The step-by-step guide (`docs/contributing/tax-packs.md`) is written together with the tax pack
template in phase 2. The short version, which will not change: open a
[tax pack request](https://github.com/fabiovincenzi/fairhour/issues/new?template=tax_pack_request.yml)
to agree on the scope, copy `packages/tax-pack-template`, implement each rule with its legal
source, add golden fixtures, make the shared conformance suite pass, and document the pack in
`docs/tax-packs/<country>.md`. The existing pack documentation, starting with the
[Italy tax pack](../tax-packs/it.md), shows the level of detail expected.

## Where the documentation lives

The documentation site is built from the repository, which is the single source of truth: pages
such as these guides, the ADRs, the tax pack documentation and the maintainer handbook are plain
Markdown under `docs/`, and the site copies them at build time. Edit them here, with a pull
request like any other change; every page of the site has an "Edit page" link that leads to its
source. Pages that exist only on the site live in `apps/docs/src/content/docs/`.
