# Governance

Fairhour is an open-source project run in the open. This document describes how decisions are
made and how people can take on more responsibility.

## Roles

- **Users** use Fairhour and give feedback through issues and Discussions.
- **Contributors** submit code, docs, translations, tax packs, designs, reviews or triage help.
  Anyone can become a contributor; contributions are accepted under the project's licenses with
  a DCO sign-off.
- **Tax pack stewards** are contributors who own a country pack (e.g. `tax-pack-de`). They review
  changes to that pack and keep its rules and sources current. Listed in [MAINTAINERS.md](MAINTAINERS.md).
- **Maintainers** review and merge PRs, triage issues, cut releases and steward the roadmap.
  Listed in [MAINTAINERS.md](MAINTAINERS.md).
- **Lead maintainer** (@fabiovincenzi) has the final say when consensus cannot be reached.

## Decision making

1. Most decisions happen in PRs and issues through **lazy consensus**: if nobody objects within a
   reasonable time (usually 72 hours for non-trivial changes), the proposal moves forward.
2. **Significant decisions** (architecture, licensing, new dependencies with large footprints,
   breaking changes, data model changes) are recorded as an ADR in `docs/adr/` and discussed in
   the PR that introduces it.
3. If consensus cannot be reached, maintainers vote (simple majority); the lead maintainer breaks ties.

## Becoming a maintainer

Contributors who have shown sustained, high-quality contributions and good judgement in reviews
can be nominated by any maintainer. The nomination is accepted with no objection from other
maintainers within 7 days. Maintainers inactive for 12 months move to emeritus status.

## Tax correctness

Tax packs encode laws that change. Changes to a pack require a source for every rule, updated
golden fixtures, and a review from that pack's steward (or a maintainer when there is none).
Fairhour's output is informational; the project does not provide tax or legal advice.

## Code of Conduct

Everyone follows the [Code of Conduct](CODE_OF_CONDUCT.md). Maintainers enforce it.

## Changes to this document

Changes to governance are proposed by PR and require approval from a majority of maintainers.
