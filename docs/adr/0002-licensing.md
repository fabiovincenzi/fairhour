# ADR-0002: Licensing: AGPL-3.0 for the product, MIT for the libraries

- **Status:** Accepted
- **Date:** 2026-10-09
- **Deciders:** @fabiovincenzi (lead maintainer)
- **Backlog:** FND-007

## Context

Fairhour contains two kinds of code, with different audiences:

- **The product:** the web app, the desktop companion, the documentation site, the packages that
  exist only to serve them (`api`, `db`, `ui`, `pdf`, `core`, `config`) and the repository
  scripts. People _run_ it: self-hosters, and possibly a hosted offering.
- **The tax engine:** `@fairhour/money`, `@fairhour/tax-core` and the country packs
  `@fairhour/tax-pack-*`. Developers _embed_ it. Its value grows with the number of countries,
  and the people who can write a country pack (accountants, developers of other invoicing tools)
  are far more likely to contribute if they can use the result in their own software, including
  proprietary software.

Facts that shape the decision:

- The realistic threat to an open-source web app is a closed, modified, hosted fork. The GPL does
  not prevent it, because offering software as a service is not distribution. The AGPL does,
  through section 13 (Remote Network Interaction).
- Many companies forbid AGPL dependencies outright. An AGPL tax engine would not be embedded in
  other tools, and their developers would not contribute packs.
- Contributions are certified with the DCO, without a CLA (see
  [CONTRIBUTING.md](../../CONTRIBUTING.md#developer-certificate-of-origin-dco)). The project
  therefore cannot relicense contributed code without the consent of every contributor concerned,
  so the license chosen for each package is effectively permanent. Today the repository contains
  only the maintainers' own work, which makes this the moment to set the split cleanly.
- The root [`LICENSE`](../../LICENSE) is AGPL-3.0, and the README already announces the split.
  This ADR makes it precise and enforceable.

## Decision drivers

1. Keep the product open, including modified versions offered as a service.
2. Make the tax engine as easy as possible to adopt, embed and contribute to.
3. Standard licenses (OSI-approved for code) with SPDX identifiers; no CLA, no custom terms.
4. A boundary that is simple to state and can be checked mechanically.
5. Low compliance cost for self-hosters, embedders and contributors.

## Considered options

1. **Everything AGPL-3.0.** The strongest protection, but the tax engine becomes unusable for most
   other software and excludes many of the contributors we need most.
2. **Everything MIT (or Apache-2.0).** Maximum adoption, but anyone may run a closed, modified
   Fairhour as a competing service.
3. **AGPL-3.0-only for the product, MIT for the libraries** (chosen).
4. **The same split with Apache-2.0 for the libraries.** Adds an express patent license; see
   [why MIT rather than Apache-2.0](#why-mit-rather-than-apache-20).
5. **The same split with weak copyleft (MPL-2.0 or LGPL-3.0) for the libraries.** Changes to the
   library files would have to be shared, but these licenses appear on corporate deny lists far
   more often than MIT, and LGPL's relinking terms are awkward for code bundled into browser and
   desktop apps.
6. **Open core or dual licensing with a CLA, or a source-available license (BUSL, Elastic).**
   Rejected outright: a CLA deters contributors, and source-available licenses are not open
   source.

## Decision

### License map

| Path                                                                                               | License                                       |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `packages/money`, `packages/tax-core`, every `packages/tax-pack-*` (including `tax-pack-template`) | **MIT**                                       |
| `apps/web`, `apps/desktop`, `apps/docs` (site code and configuration)                              | **AGPL-3.0-only**                             |
| `packages/api`, `packages/db`, `packages/ui`, `packages/pdf`, `packages/core`, `packages/config`   | **AGPL-3.0-only**                             |
| `scripts/*`                                                                                        | **AGPL-3.0-only**                             |
| Documentation: `docs/**` and the content of the docs site (`apps/docs/src/content/**`)             | **CC BY 4.0**; code samples in it are **MIT** |
| Everything else (root files, workflows, repository configuration)                                  | **AGPL-3.0-only** (root `LICENSE`)            |

Exclusions: third-party texts keep their own license (for example, `CODE_OF_CONDUCT.md` is
adapted from the Contributor Covenant, which is CC BY 4.0). None of these licenses grants rights
to the Fairhour name or logo; a trademark policy, if one is needed, is a separate decision.

### Rules

1. **Declaring a license.** Every package declares an SPDX identifier in the `license` field of
   its `package.json`. A package or directory whose license differs from the root ships its own
   `LICENSE` file. A file is under the license of the nearest `LICENSE` file above it, and that
   must agree with the enclosing `package.json`. Per-file SPDX headers are not required. MIT
   packages use the notice `Copyright (c) 2026 The Fairhour contributors`.
2. **The library boundary.** An MIT package may depend at runtime (`dependencies`,
   `peerDependencies`, `optionalDependencies`, and anything bundled into its build output) only on
   packages under MIT or another permissive license: ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0,
   0BSD, BlueOak-1.0.0 or CC0-1.0. It never depends on an AGPL workspace package (such as
   `@fairhour/core`, `db`, `api`, `ui`, `pdf` or `config`) or on any copyleft package.
   `devDependencies` used only to build, lint or test, such as the `@fairhour/config` presets or
   Vitest, are allowed, because they are neither distributed with the package nor compiled into
   it; the build must not inline them.
3. **Moving code across the boundary.** From an MIT package to an AGPL one is always fine (keep
   the MIT notice). From an AGPL package to an MIT one is a relicensing: allowed only when every
   author of that code agrees, otherwise the code is rewritten. Logic that tax packs may need is
   therefore designed into `money` or `tax-core` from the start, not written in `core` and moved
   later.
4. **Dependencies of the product.** AGPL packages may use any license compatible with AGPL-3.0:
   permissive licenses, MPL-2.0, LGPL and GPL-3.0. GPL-2.0-only is incompatible with the
   (A)GPL-3.0; SSPL, BUSL and the Commons Clause are not open source.
5. **Contributions.** Inbound equals outbound: a contribution is licensed under the license of the
   files it changes, as the DCO sign-off certifies ("the open source license indicated in the
   file"). There is no CLA.
6. **Third-party code** copied into the repository keeps its license and copyright notice, which
   must be compatible with the destination package and recorded next to the code.
7. **The network clause in practice.** The web app links to its source code. The link defaults to
   the upstream repository at the running version and can be changed by operators of a modified
   version, so that they meet section 13 by pointing at their own source. Docker images carry
   `org.opencontainers.image.licenses=AGPL-3.0-only`, and every binary release is built from a
   tagged, public commit.

### Why AGPL-3.0-only rather than -or-later

"Or later" lets the Free Software Foundation set future terms for every contribution; "only"
keeps the terms that contributors actually agreed to. The cost is that moving to a future AGPL
version would need contributors' consent, which is consistent with having no CLA.

### Why MIT rather than Apache-2.0

Apache-2.0's real advantage is its express patent license, which terminates for anyone who sues over
patents in the work. For these libraries it is worth little: they implement published, statutory
calculations; most contributors are individuals and small firms without patent portfolios; and the
license covers only contributors' own patents, not third parties', which is where the realistic risk
lies. Its costs are concrete: NOTICE-file and change-marking obligations that are routinely
mishandled when code is bundled into browser and desktop apps, a longer text for small vendors'
legal reviews, and incompatibility with GPL-2.0-only projects. MIT is the norm on npm, asks only
that the notice is kept, and is compatible with every license we care about, AGPL-3.0 included.

If a contributor with a patent portfolio wants to contribute substantially, a new ADR can move
future versions to Apache-2.0. MIT allows existing code to be redistributed under those terms as
long as its notice is kept, although the patent license would then cover only new contributions.

### Why CC BY 4.0 for documentation

- The AGPL is written for programs. Its conditions (Corresponding Source, network interaction,
  installation information) are unclear for prose, and that uncertainty deters the reuse we want:
  quoting a tax pack's explanation of a rounding rule, translating a guide, citing an ADR.
- The tax pack documents in `docs/tax-packs/` are the human-readable half of MIT libraries. They
  should be as easy to reuse as the code: attribution only.
- Attribution matters here. Tax rules change every year, and a credit that links back to Fairhour
  leads readers to the maintained version. That rules out CC0, while CC BY-SA would stop vendors
  from adapting the text for their own documentation.
- Creative Commons advises against its licenses for software, so code samples in the
  documentation are MIT and can be pasted into any project.
- CC BY 4.0 is the usual license for open documentation. The CNCF, for example, defaults its
  projects to an OSI license for code and CC BY 4.0 for documentation, with contributions
  usually certified through the DCO, as here.

The cost is a third license in the repository, kept manageable by the nearest-`LICENSE` rule.

### What this means in practice

This section explains intent; the license texts are authoritative.

| I want to…                                                    | Allowed?                                                                                |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Embed `@fairhour/tax-pack-it` in a proprietary invoicing app  | Yes. Keep the MIT notice.                                                               |
| Self-host an unmodified Fairhour for my company or my clients | Yes. Keep the notices.                                                                  |
| Run a modified Fairhour as a service for others               | Yes, if its users can get the source of your version (AGPL section 13).                 |
| Distribute a modified desktop app                             | Yes, with its source under AGPL-3.0.                                                    |
| Copy a function from `@fairhour/core` into a tax pack         | Only if all its authors agree to MIT; otherwise write it anew in `money` or `tax-core`. |
| Quote or translate a tax pack guide                           | Yes, with attribution (CC BY 4.0).                                                      |
| Paste a code sample from the docs into my project             | Yes (MIT).                                                                              |

## Consequences

### Positive

- Nobody may run a closed, modified Fairhour as a service; improvements to the product offered
  over a network reach its users as source.
- Anyone can embed the tax engine, including proprietary invoicing and accounting software, so a
  country pack written once is useful everywhere. That lowers the barrier for the contributors we
  most need.
- Standard licenses, SPDX identifiers and the DCO: no paperwork for contributors.
- Documentation and tax explanations can be quoted, translated and adapted with attribution.

### Negative

- Three licenses in one repository; contributors need to know which one applies. The
  nearest-`LICENSE` rule, the `license` fields and the boundary check keep this mechanical.
- Proprietary forks of the tax engine do not have to share their fixes. We accept that: tax rules
  change every year, so a private fork is expensive to maintain and contributing upstream is the
  cheaper path.
- The boundary constrains the architecture: tax packs cannot use `@fairhour/core`, and code cannot
  move from an AGPL package to an MIT one without its authors' consent.
- Some organizations will not self-host or contribute to AGPL software. We accept that; the parts
  they are most likely to want to reuse are MIT.
- Without a CLA there is no relicensing and no dual licensing later. The split is deliberate and
  long-lived.
- The source link required by section 13 is a small feature the web app must have before its
  first release.

## Compliance and enforcement

In place today:

- The root [`LICENSE`](../../LICENSE) holds the AGPL-3.0 text; the root `package.json` and every
  AGPL package declare `"license": "AGPL-3.0-only"`.
- [`dependency-review.yml`](../../.github/workflows/dependency-review.yml) fails pull requests
  that add dependencies under GPL-2.0-only, GPL-2.0-or-later, SSPL-1.0, BUSL-1.1 or the Commons
  Clause. The check is repository-wide and cannot tell an app dependency from a library one, so it
  is deliberately conservative (it also blocks GPL-2.0-or-later). It does not block GPL-3.0 or
  AGPL-3.0, which the apps may use; the per-package check below covers the MIT side. Exceptions
  need an ADR.
- The DCO workflow and the commitlint `Signed-off-by` rule check every commit.
- The Docker image declares its license through the `org.opencontainers.image.licenses` label.

To be added (follow-up work, outside this ADR's PR):

- When `money`, `tax-core` and the tax packs are scaffolded (FND-002, CORE-002, TAX-002,
  TAX-009): an MIT `LICENSE` file and `"license": "MIT"` in each. `tax-pack-template` carries
  both, so every new pack inherits them.
- Phase 2: an automated license boundary check in CI that fails when a package's `license` field
  and its `LICENSE` file disagree, when an MIT package has a runtime dependency that is an AGPL
  workspace package or is not on the permissive allowlist, or when source in an MIT package
  imports an AGPL workspace package.
- `docs/LICENSE` and a license file in the docs site's content directory (CC BY 4.0, with the MIT
  note for code samples), and a mention of the documentation license in the README.
- A backlog item for the web app's source link (rule 7).

## Links

- [ADR-0001: Technology stack](0001-technology-stack.md)
- [`LICENSE`](../../LICENSE), [`CONTRIBUTING.md`](../../CONTRIBUTING.md),
  [`GOVERNANCE.md`](../../GOVERNANCE.md), [release process](../maintainers/release-process.md)
- GNU AGPL-3.0: <https://www.gnu.org/licenses/agpl-3.0.html>
- MIT License: <https://opensource.org/license/mit>
- CC BY 4.0: <https://creativecommons.org/licenses/by/4.0/>
- Developer Certificate of Origin: <https://developercertificate.org/>
- FSF license compatibility list: <https://www.gnu.org/licenses/license-list.html>
- Creative Commons on licensing software:
  <https://creativecommons.org/faq/#can-i-apply-a-creative-commons-license-to-software>
